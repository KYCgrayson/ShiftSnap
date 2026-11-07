-- Restricted Supabase SQL editor ONLY. Contains customer contact information.
-- Do not publish/export results or paste them into public issues.
-- Read-only: use the receipt displayed by the app/mail to identify a case.
WITH cases AS (
  SELECT id, user_id, 'deletion'::text AS kind, status, requested_at AS created_at,
    requested_at + interval '30 days' AS target_at, operator_note AS message
  FROM public.account_deletion_requests
  UNION ALL
  SELECT id, user_id, 'support', 'received', created_at, NULL, message
  FROM public.support_requests
)
SELECT r.id AS receipt, r.kind, r.status, r.created_at, r.target_at,
  CASE WHEN u.email_confirmed_at IS NOT NULL THEN u.email ELSE c.email END AS verified_reply_email,
  r.message,
  coalesce(n.delivery, '[]'::jsonb) AS notifications
FROM cases r
LEFT JOIN auth.users u ON u.id=r.user_id
LEFT JOIN request_mail.contacts c ON c.request_id=r.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('job', o.id, 'audience', o.audience,
    'event', o.event, 'state', o.state, 'attempts', o.attempts,
    'failure_code', o.failure_code, 'provider_id', o.provider_id)
    ORDER BY o.queue_order) AS delivery
  FROM request_mail.outbox o WHERE o.request_id=r.id
) n ON true
ORDER BY r.created_at DESC;
