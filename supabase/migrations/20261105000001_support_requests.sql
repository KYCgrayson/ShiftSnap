-- Only the server chooses the sender and timestamps. Operators read the inbox
-- through the restricted project dashboard, not through the mobile client.
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000 and message ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);
create index support_requests_sender_time on public.support_requests(user_id, created_at);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;

create function public.submit_support_request(p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sender uuid := auth.uid(); receipt uuid;
begin
  if sender is null then raise exception 'authentication required'; end if;
  if p_message is null or char_length(p_message) not between 1 and 2000 or p_message !~ '[^[:space:]]' then
    raise exception 'invalid message length';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(sender::text, 2793));
  if (select count(*) from public.support_requests where user_id = sender and created_at >= now() - interval '1 hour') >= 5 then
    raise exception 'support request limit exceeded';
  end if;
  insert into public.support_requests(user_id, message) values(sender, btrim(p_message)) returning id into receipt;
  return receipt;
end $$;
revoke all on function public.submit_support_request(text) from public, anon;
grant execute on function public.submit_support_request(text) to authenticated;
