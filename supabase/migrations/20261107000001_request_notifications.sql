-- Mail delivery is asynchronous; request transactions only write local rows.
-- Private contacts have no auth FK so a completion receipt survives auth deletion.
create schema if not exists request_mail;
revoke all on schema request_mail from public, anon, authenticated;
grant usage on schema request_mail to service_role;

alter table public.account_deletion_requests add column operator_note text
  check (operator_note is null or char_length(operator_note) <= 2000);
grant update (operator_note) on public.account_deletion_requests to service_role;
grant select on public.support_requests to service_role;

create table request_mail.contacts (
  request_id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create table request_mail.outbox (
  id uuid primary key default gen_random_uuid(),
  queue_order bigint generated always as identity unique,
  request_id uuid not null,
  owner_id uuid not null,
  kind text not null check (kind in ('support', 'deletion')),
  audience text not null check (audience in ('operator', 'customer')),
  event text not null,
  -- Operator reply contact is retained separately from customer contact snapshots.
  operator_reply_to text,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  claim_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  provider_id text,
  failure_code text,
  created_at timestamptz not null default now()
);
create index request_mail_ready on request_mail.outbox (available_at, created_at)
  where state in ('pending', 'sending');
create unique index request_mail_received_once on request_mail.outbox (request_id, audience)
  where event = 'received';
alter table request_mail.contacts enable row level security;
alter table request_mail.outbox enable row level security;
revoke all on all tables in schema request_mail from public, anon, authenticated;
grant select on all tables in schema request_mail to service_role;

-- Preserve existing open cases' verified contact before operators remove auth.
insert into request_mail.contacts (request_id, email)
select r.id, case when u.email_confirmed_at is not null then u.email end
from public.account_deletion_requests r left join auth.users u on u.id = r.user_id
where r.status in ('pending', 'in_progress', 'action_required');
insert into request_mail.contacts (request_id, email)
select r.id, case when u.email_confirmed_at is not null then u.email end
from public.support_requests r join auth.users u on u.id = r.user_id
on conflict (request_id) do nothing;

create function request_mail.enqueue_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare verified_email text; data jsonb; event_name text; request_kind text;
begin
  if tg_table_name = 'account_deletion_requests' then
    if new.status in ('action_required', 'rejected') and
       (new.operator_note is null or new.operator_note !~ '[^[:space:]]') then
      raise exception 'OPERATOR_NOTE_REQUIRED';
    end if;
    if new.status = 'completed' and exists (select 1 from auth.users where id = new.user_id) then
      raise exception 'AUTH_ACCOUNT_STILL_EXISTS';
    end if;
    if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
    request_kind := 'deletion';
    event_name := case when tg_op = 'INSERT' then 'received' else new.status end;
    data := jsonb_build_object('status', new.status, 'note', new.operator_note,
      'requested_at', new.requested_at, 'due_at', new.requested_at + interval '30 days');
  else
    request_kind := 'support'; event_name := 'received';
    data := jsonb_build_object('message', new.message, 'requested_at', new.created_at);
  end if;

  select email into verified_email from auth.users
    where id = new.user_id and email_confirmed_at is not null;
  insert into request_mail.contacts (request_id, email) values (new.id, verified_email)
    on conflict (request_id) do nothing;
  -- Existing cases use their original verified snapshot, including after auth deletion.
  select email into verified_email from request_mail.contacts where request_id = new.id;
  insert into request_mail.outbox (request_id, owner_id, kind, audience, event, operator_reply_to, payload)
    values (new.id, new.user_id, request_kind, 'operator', event_name, verified_email, data);
  insert into request_mail.outbox (request_id, owner_id, kind, audience, event, payload, state, failure_code)
    values (new.id, new.user_id, request_kind, 'customer', event_name, data - 'message',
      case when verified_email is null then 'failed' else 'pending' end,
      case when verified_email is null then 'no_verified_contact' end);
  return new;
end $$;
revoke all on function request_mail.enqueue_request() from public, anon, authenticated;
create trigger support_request_mail after insert on public.support_requests
  for each row execute function request_mail.enqueue_request();
create trigger deletion_request_mail after insert or update on public.account_deletion_requests
  for each row execute function request_mail.enqueue_request();

-- One initial notification per audience also covers requests committed before
-- this migration. Completed/rejected historical cases are not reopened. The
-- partial unique index makes this backfill safe to repeat alongside live inserts.
with existing as (
  select s.id, s.user_id, 'support' as kind,
    jsonb_build_object('message', s.message, 'requested_at', s.created_at) as payload
  from public.support_requests s
  union all
  select d.id, d.user_id, 'deletion', jsonb_build_object('status', d.status,
    'note', d.operator_note, 'requested_at', d.requested_at,
    'due_at', d.requested_at + interval '30 days')
  from public.account_deletion_requests d
  where d.status in ('pending', 'in_progress', 'action_required')
)
insert into request_mail.outbox
  (request_id, owner_id, kind, audience, event, operator_reply_to, payload, state, failure_code)
select e.id, e.user_id, e.kind, a.audience, 'received',
  case when a.audience = 'operator' then c.email end,
  case when a.audience = 'customer' then e.payload - 'message' else e.payload end,
  case when a.audience = 'customer' and c.email is null then 'failed' else 'pending' end,
  case when a.audience = 'customer' and c.email is null then 'no_verified_contact' end
from existing e join request_mail.contacts c on c.request_id = e.id
cross join (values ('operator'), ('customer')) as a(audience)
on conflict (request_id, audience) where event = 'received' do nothing;

-- RPC contract: claim returns <=10 envelopes. Each id is the immutable provider
-- idempotency key. claim_token must accompany every finish; stale owners cannot
-- mutate a reclaimed job. Five-minute leases exceed the sequential batch timeout.
create function public.claim_request_notifications(p_limit integer default 10)
returns table (id uuid, claim_token uuid, kind text, audience text, event text,
  request_id uuid, to_email text, reply_to text, payload jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  -- A retry must never leave Resend's 24-hour idempotency lifetime.
  update request_mail.outbox o set state = 'failed', failure_code = 'retry_exhausted',
    claim_token = null, lease_until = null
    where (o.state = 'pending' or (o.state = 'sending' and o.lease_until <= now()))
      and (o.attempts >= 8 or o.first_attempt_at <= now() - interval '23 hours');
  return query
  with candidates as (
    select o.id from request_mail.outbox o
    where ((o.state = 'pending' and o.available_at <= now())
       or (o.state = 'sending' and o.lease_until <= now()))
      -- Serialize submission per request/audience; mailbox arrival remains the
      -- provider's responsibility. Operator outage does not hold customer receipts.
      and not exists (select 1 from request_mail.outbox earlier
        where earlier.request_id = o.request_id and earlier.audience = o.audience
          and earlier.state in ('pending', 'sending')
          and earlier.queue_order < o.queue_order)
    order by o.queue_order for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 10))
  ), claimed as (
    update request_mail.outbox o set state = 'sending', attempts = o.attempts + 1,
      first_attempt_at = coalesce(o.first_attempt_at, now()),
      claim_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
    from candidates c where o.id = c.id returning o.*
  )
  select o.id, o.claim_token, o.kind, o.audience, o.event, o.request_id,
    case when o.audience = 'operator' then 'appai@appai.info' else c.email end,
    case when o.audience = 'operator' then coalesce(o.operator_reply_to, 'appai@appai.info')
      else 'appai@appai.info' end, o.payload
  from claimed o left join request_mail.contacts c on c.request_id = o.request_id;
end $$;

-- RPC contract: delivered=true requires a provider ID. On failure the worker
-- supplies only an allowlisted code plus retryable. Returns false for stale tokens.
-- Completion delivery removes the customer contact; operator evidence is separate.
create function public.finish_request_notification(p_id uuid, p_claim_token uuid,
  p_delivered boolean, p_provider_id text default null,
  p_failure_code text default null, p_retryable boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job request_mail.outbox%rowtype;
begin
  select * into job from request_mail.outbox
    where id = p_id and state = 'sending' and claim_token = p_claim_token for update;
  if not found then return false; end if;
  if p_delivered then
    if p_provider_id is null or char_length(p_provider_id) not between 1 and 200 then
      raise exception 'PROVIDER_ID_REQUIRED';
    end if;
    update request_mail.outbox set state = 'sent', sent_at = now(),
      provider_id = p_provider_id, claim_token = null, lease_until = null, failure_code = null,
      payload = payload - 'message', operator_reply_to = null
      where id = p_id;
    if job.audience = 'customer' and (job.kind = 'support' or job.event = 'completed') then
      delete from request_mail.contacts where request_id = job.request_id;
      if job.event = 'completed' then
        update request_mail.outbox set state = 'failed', failure_code = 'contact_purged',
          claim_token = null, lease_until = null
          where request_id = job.request_id and audience = 'customer'
            and state in ('pending', 'sending') and id <> p_id;
      end if;
    end if;
  else
    update request_mail.outbox set
      state = case when p_retryable and attempts < 8
        and first_attempt_at > now() - interval '23 hours' then 'pending' else 'failed' end,
      available_at = now() + make_interval(secs => least(3600, 30 * (2 ^ attempts)::integer)),
      claim_token = null, lease_until = null,
      failure_code = case when p_failure_code in ('provider_rejected', 'provider_unavailable',
        'provider_timeout', 'provider_response', 'invalid_envelope', 'no_verified_contact')
        then p_failure_code else 'delivery_failed' end
    where id = p_id;
  end if;
  return true;
end $$;
revoke all on function public.claim_request_notifications(integer) from public, anon, authenticated;
revoke all on function public.finish_request_notification(uuid, uuid, boolean, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_request_notifications(integer) to service_role;
grant execute on function public.finish_request_notification(uuid, uuid, boolean, text, text, boolean)
  to service_role;
comment on schema request_mail is 'Server-only notification outbox; customer contacts purged after support receipt or deletion completion delivery.';
comment on column request_mail.outbox.owner_id is
  'Owner lookup for fulfillment cleanup, including failed support mail after auth removal. No auth FK. Retained notification bodies/notes must be reviewed and redacted during actual deletion.';
comment on column public.account_deletion_requests.operator_note is
  'Customer-visible status explanation, required for action_required/rejected. Never include secrets or unrelated personal data.';
