-- READ-ONLY fulfillment inventory. Run in the restricted Supabase SQL editor.
-- Replace only the request UUID below with one read from the operator queue;
-- the account ID is derived from that request, never supplied by a client.
-- This report does not delete or update any data.
WITH selected_request AS (
  SELECT id, user_id, status, requested_at
  FROM public.account_deletion_requests
  WHERE id = 'REPLACE_WITH_REQUEST_UUID'::uuid
), target AS (
  SELECT user_id FROM selected_request
)
SELECT 'request' AS area, jsonb_build_object(
  'request_id', r.id,
  'status', r.status,
  'requested_at', r.requested_at,
  'user_id', r.user_id
) AS details
FROM selected_request r
UNION ALL
SELECT 'profile', jsonb_build_object('rows', count(*))
FROM public.users u JOIN target t ON u.id = t.user_id
UNION ALL
SELECT 'owned_groups', jsonb_build_object(
  'rows', count(g.id),
  'group_ids', coalesce(jsonb_agg(g.id) FILTER (WHERE g.id IS NOT NULL), '[]'::jsonb)
)
FROM public.groups g JOIN target t ON g.created_by = t.user_id
UNION ALL
SELECT 'group_memberships', jsonb_build_object('rows', count(*))
FROM public.group_members gm JOIN target t ON gm.user_id = t.user_id
UNION ALL
SELECT 'owned_persons', jsonb_build_object('rows', count(*))
FROM public.persons p JOIN target t ON p.owner_id = t.user_id
UNION ALL
SELECT 'owned_schedules', jsonb_build_object('rows', count(s.id))
FROM public.schedules s JOIN target t ON s.owner_id = t.user_id
UNION ALL
SELECT 'shifts_claimed_or_owned', jsonb_build_object('rows', count(*))
FROM public.shifts s JOIN target t ON s.user_id = t.user_id
UNION ALL
SELECT 'shift_codes_owned', jsonb_build_object('rows', count(*))
FROM public.shift_codes sc JOIN target t ON sc.user_id = t.user_id
UNION ALL
SELECT 'group_scoped_shift_codes', jsonb_build_object('rows', count(*))
FROM public.shift_codes sc
JOIN public.groups g ON g.id = sc.group_id
JOIN target t ON g.created_by = t.user_id
UNION ALL
SELECT 'sharing_records_sent_or_received', jsonb_build_object('rows', count(*))
FROM public.schedule_sharing sh JOIN target t
  ON sh.from_user_id = t.user_id OR sh.to_user_id = t.user_id
UNION ALL
SELECT 'daily_notes', jsonb_build_object(
  'rows', count(*),
  'image_references', coalesce(sum(cardinality(n.image_urls)), 0)
)
FROM public.daily_notes n JOIN target t ON n.user_id = t.user_id
UNION ALL
SELECT 'roster_aliases_created', jsonb_build_object('rows', count(*))
FROM public.person_aliases pa JOIN target t ON pa.created_by = t.user_id
UNION ALL
SELECT 'roster_aliases_referencing_owned_people', jsonb_build_object('rows', count(*))
FROM public.person_aliases pa
JOIN public.persons p ON p.id = pa.canonical_person_id
JOIN target t ON p.owner_id = t.user_id
UNION ALL
SELECT 'roster_merges_created', jsonb_build_object('rows', count(*))
FROM public.roster_identity_merges rm JOIN target t ON rm.created_by = t.user_id
UNION ALL
SELECT 'merge_history_referencing_owned_people', jsonb_build_object('rows', count(DISTINCT rm.id))
FROM public.roster_identity_merges rm
JOIN target t ON TRUE
JOIN public.persons p ON p.owner_id = t.user_id
WHERE rm.primary_person_id = p.id OR rm.secondary_person_id = p.id
UNION ALL
SELECT 'merge_movements_blocking_person_delete', jsonb_build_object(
  'shift_movements', (SELECT count(*) FROM public.roster_identity_merge_shift_movements m
    JOIN public.persons p ON p.id = m.previous_person_id JOIN target t ON p.owner_id = t.user_id),
  'person_movements', (SELECT count(*) FROM public.roster_identity_merge_person_movements m
    JOIN public.persons p ON p.id = m.previous_canonical_person_id JOIN target t ON p.owner_id = t.user_id),
  'claim_movements', (SELECT count(*) FROM public.roster_identity_merge_claim_movements m
    JOIN public.persons p ON p.id = m.previous_person_id JOIN target t ON p.owner_id = t.user_id)
)
UNION ALL
SELECT 'support_requests', jsonb_build_object('rows', count(*))
FROM public.support_requests sr JOIN target t ON sr.user_id = t.user_id
UNION ALL
SELECT 'request_notification_data', jsonb_build_object(
  'jobs', count(*),
  'unsent_jobs', count(*) FILTER (WHERE o.state <> 'sent'),
  'retained_reply_addresses', count(o.operator_reply_to),
  'retained_message_or_note', count(*) FILTER (WHERE o.payload ? 'message' OR o.payload->>'note' IS NOT NULL),
  'contact_snapshots', (SELECT count(*) FROM request_mail.contacts c
    WHERE c.request_id IN (SELECT DISTINCT q.request_id FROM request_mail.outbox q JOIN target x ON q.owner_id=x.user_id))
)
FROM request_mail.outbox o JOIN target t ON o.owner_id=t.user_id
UNION ALL
SELECT 'request_operator_notes', jsonb_build_object('rows', count(*))
FROM public.account_deletion_requests r JOIN target t ON r.user_id=t.user_id
WHERE r.operator_note IS NOT NULL
UNION ALL
SELECT 'storage_objects', jsonb_build_object(
  'shift_images', count(*) FILTER (WHERE o.bucket_id = 'shift-images'),
  'note_images', count(*) FILTER (WHERE o.bucket_id = 'note-images')
)
FROM storage.objects o JOIN target t ON
  (o.bucket_id = 'shift-images' AND (
    o.owner_id = t.user_id::text OR o.name LIKE t.user_id::text || '/%'
  )) OR
  (o.bucket_id = 'note-images' AND o.name LIKE t.user_id::text || '/%');

-- Inspect the names, remaining admins, and other members of creator-owned
-- groups before deciding whether to transfer or close each group.
WITH target AS (
  SELECT user_id
  FROM public.account_deletion_requests
  WHERE id = 'REPLACE_WITH_REQUEST_UUID'::uuid
)
SELECT g.id, g.name, g.created_by,
  count(*) FILTER (WHERE gm.user_id <> g.created_by) AS other_members,
  count(*) FILTER (WHERE gm.user_id <> g.created_by AND gm.role IN ('admin', 'site_manager')) AS other_admins
FROM public.groups g
JOIN target t ON g.created_by = t.user_id
LEFT JOIN public.group_members gm ON gm.group_id = g.id
GROUP BY g.id, g.name, g.created_by
ORDER BY g.name, g.id;
