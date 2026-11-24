-- Run against a disposable LOCAL Supabase database with migrations through
-- 20261109000001 already applied. This script applies #135 after seeding old data.
-- psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/group_member_claims.sql
BEGIN;

CREATE FUNCTION pg_temp.assert_claim_test(ok BOOLEAN, message TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Claim test: %', message; END IF;
END;
$$;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('13500000-0000-4000-8000-000000000001', 'claim-owner@example.test', '{}'),
       ('13500000-0000-4000-8000-000000000002', 'claim-member@example.test', '{}'),
       ('13500000-0000-4000-8000-000000000003', 'claim-name-only@example.test', '{}'),
       ('13500000-0000-4000-8000-000000000004', 'claim-outsider@example.test', '{}'),
       ('13500000-0000-4000-8000-000000000005', 'claim-id-only@example.test', '{}');

INSERT INTO public.groups (id, name, invite_code, created_by)
VALUES ('13500000-0000-4000-8000-000000000010', 'Claim test', 'QA0135', '13500000-0000-4000-8000-000000000001'),
       ('13500000-0000-4000-8000-000000000011', 'Second group', 'QB0135', '13500000-0000-4000-8000-000000000001');
INSERT INTO public.group_members (group_id, user_id, role)
SELECT '13500000-0000-4000-8000-000000000010', id,
       CASE WHEN email = 'claim-owner@example.test' THEN 'admin' ELSE 'member' END::public.group_role
FROM public.users WHERE email IN ('claim-owner@example.test', 'claim-member@example.test',
                                 'claim-name-only@example.test', 'claim-id-only@example.test');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES ('13500000-0000-4000-8000-000000000011', '13500000-0000-4000-8000-000000000001', 'member'),
       ('13500000-0000-4000-8000-000000000011', '13500000-0000-4000-8000-000000000002', 'member');

INSERT INTO public.shift_codes (user_id, code, meaning, start_time, end_time)
VALUES ('13500000-0000-4000-8000-000000000001', 'D', 'Day', '08:00', '16:00');

INSERT INTO public.shift_codes (user_id, group_id, is_group_shared, code, meaning, start_time, end_time)
VALUES ('13500000-0000-4000-8000-000000000001', '13500000-0000-4000-8000-000000000010', true, 'GX', 'Early', '08:00', '16:00'),
       ('13500000-0000-4000-8000-000000000002', '13500000-0000-4000-8000-000000000011', true, 'GX', 'Late', '09:00', '17:00');

INSERT INTO public.persons (id, owner_id, group_id, name)
SELECT ('13500000-0000-4000-8000-00000000002' || n)::UUID,
       '13500000-0000-4000-8000-000000000001', '13500000-0000-4000-8000-000000000010', name
FROM (VALUES (1, 'Jason0'), (2, 'Jason1.'), (3, 'Jason2.'), (4, 'Another'), (5, 'Previously merged')) roster(n, name);

INSERT INTO public.schedules (id, owner_id, group_id, year_month, image_url)
SELECT ('13500000-0000-4000-8000-00000000003' || n)::UUID,
       '13500000-0000-4000-8000-000000000001', '13500000-0000-4000-8000-000000000010', month, ''
FROM (VALUES (1, '2026-11'), (2, '2026-12'), (3, '2027-01'), (4, '2026-11')) months(n, month);
INSERT INTO public.schedules (id, owner_id, group_id, year_month, image_url)
VALUES ('13500000-0000-4000-8000-000000000035', '13500000-0000-4000-8000-000000000001',
        '13500000-0000-4000-8000-000000000011', '2026-11', '');

INSERT INTO public.shifts (schedule_id, user_id, person_id, date, shift_code, start_time, end_time, name_on_schedule, source)
SELECT ('13500000-0000-4000-8000-00000000003' || schedule)::UUID,
       '13500000-0000-4000-8000-000000000001',
       CASE WHEN person IS NOT NULL THEN ('13500000-0000-4000-8000-00000000002' || person)::UUID END,
       day::DATE, code, time_start::TIME, time_end::TIME, name, 'reference_scan'
FROM (VALUES
  (1, 1, '2026-11-30', 'D', '08:00', '16:00', 'Jason0'),
  (2, 2, '2026-11-30', 'D', '08:00', '16:00', 'Jason1.'),
  (2, 2, '2026-11-30', 'D', NULL, NULL, 'Jason1.'),
  (2, 2, '2026-12-01', 'N', '00:00', '08:00', 'Alternate label'),
  (4, 4, '2026-11-28', 'D', '08:00', '16:00', 'Older upload kept'),
  (5, NULL, '2026-11-28', 'D', '08:00', '16:00', 'Second group name'),
  (1, NULL, '2026-11-26', 'GX', NULL, NULL, 'Cross group A'),
  (5, NULL, '2026-11-26', 'GX', NULL, NULL, 'Cross group B'),
  (2, 2, '2026-11-30', 'D', '09:00', '17:00', 'Jason1.'),
  (3, 3, '2027-01-02', 'N', '00:00', '08:00', 'Jason2.'),
  (3, 4, '2027-01-03', 'D', '08:00', '16:00', 'Another'),
  (1, 5, '2026-11-29', 'D', '08:00', '16:00', 'Previously merged'),
  (1, NULL, '2026-11-28', 'D', '08:00', '16:00', 'Name only')
) rows(schedule, person, day, code, time_start, time_end, name);

SELECT set_config('request.jwt.claim.sub', '13500000-0000-4000-8000-000000000002', true);
SELECT public.claim_person_in_schedule('13500000-0000-4000-8000-000000000031', 'Previously merged');
SELECT set_config('request.jwt.claim.sub', '13500000-0000-4000-8000-000000000001', true);
CREATE TEMP TABLE claim_test_merge AS
SELECT public.merge_roster_people('13500000-0000-4000-8000-000000000021',
                                  '13500000-0000-4000-8000-000000000025') AS id;
SELECT public.claim_person_in_schedule('13500000-0000-4000-8000-000000000031', 'Jason0');
SELECT set_config('request.jwt.claim.sub', '13500000-0000-4000-8000-000000000003', true);
SELECT public.claim_person_in_schedule('13500000-0000-4000-8000-000000000031', 'Name only');
SELECT set_config('ishift.schedule_claim_mutation', 'on', true);
UPDATE public.group_members SET claimed_person_id = '13500000-0000-4000-8000-000000000024'
WHERE group_id = '13500000-0000-4000-8000-000000000010' AND user_id = '13500000-0000-4000-8000-000000000005';
SELECT set_config('ishift.schedule_claim_mutation', '', true);

\ir ../migrations/20261124000001_group_member_claims.sql

SELECT pg_temp.assert_claim_test(count(*) = 4 AND bool_and(slot = 1), 'existing claims copied to slot 1')
FROM public.group_member_claims WHERE group_id = '13500000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_claim_test(person_id IS NULL AND name_on_schedule = 'Name only', 'name-only claim preserved')
FROM public.group_member_claims WHERE group_id = '13500000-0000-4000-8000-000000000010'
  AND user_id = '13500000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_claim_test(person_id = '13500000-0000-4000-8000-000000000024' AND name_on_schedule IS NULL, 'ID-only claim preserved')
FROM public.group_member_claims WHERE group_id = '13500000-0000-4000-8000-000000000010'
  AND user_id = '13500000-0000-4000-8000-000000000005';

SELECT set_config('request.jwt.claim.sub', '13500000-0000-4000-8000-000000000001', true);
SELECT public.undo_roster_people_merge(id) FROM claim_test_merge;
SELECT pg_temp.assert_claim_test(claimed_person_id = '13500000-0000-4000-8000-000000000025',
                                 'a pre-migration merge can still be undone')
FROM public.group_members WHERE group_id = '13500000-0000-4000-8000-000000000010'
  AND user_id = '13500000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  test_group_id CONSTANT UUID := '13500000-0000-4000-8000-000000000010';
  owner_id CONSTANT UUID := '13500000-0000-4000-8000-000000000001';
  member_id CONSTANT UUID := '13500000-0000-4000-8000-000000000002';
  november CONSTANT UUID := '13500000-0000-4000-8000-000000000031';
  december CONSTANT UUID := '13500000-0000-4000-8000-000000000032';
  january CONSTANT UUID := '13500000-0000-4000-8000-000000000033';
  claim_id UUID;
  merge_id UUID;
BEGIN
  PERFORM pg_temp.assert_claim_test((SELECT count(*) = 1 FROM public.get_my_schedule_shifts()), 'legacy personal shift retained');
  PERFORM public.add_schedule_claim(december, 'Jason1.');
  PERFORM public.add_schedule_claim(january, 'Jason2.');
  PERFORM public.add_schedule_claim(december, 'Jason1.');
  PERFORM pg_temp.assert_claim_test(
    (SELECT jsonb_array_length(schedule_claims) = 3 AND claimed_name_on_schedule = 'Jason0'
     FROM public.get_group_member_profiles(test_group_id) WHERE user_id = owner_id),
    'three claims including the original, retry is idempotent, and profile is backward compatible');

  BEGIN
    PERFORM public.add_schedule_claim(january, 'Another');
    RAISE EXCEPTION 'fourth claim was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SCHEDULE_CLAIM_LIMIT' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_claim_test((SELECT count(*) = 5 FROM public.get_my_schedule_shift_matches()), 'all five matching source rows');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 AND count(DISTINCT start_time) = 2
     FROM public.get_my_schedule_shifts('2026-11-30', '2026-11-30')),
    'dedup same date, code and effective times; preserve a different time');
  PERFORM pg_temp.assert_claim_test((SELECT count(*) = 3 FROM public.get_my_schedule_shifts()), 'combine all three identities');

  PERFORM public.add_schedule_claim('13500000-0000-4000-8000-000000000035', 'Second group name');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 4 FROM public.group_member_claims c WHERE c.user_id = owner_id),
    'each group has its own limit');
  PERFORM public.unclaim_person_in_schedule('13500000-0000-4000-8000-000000000035');
  PERFORM pg_temp.assert_claim_test(
    EXISTS (SELECT 1 FROM public.get_group_schedule_claim_rows(test_group_id, ARRAY['2026-11', '2026-12'])
            WHERE name_on_schedule = 'Older upload kept' AND year_month = '2026-11'),
    'monthly picker includes names from multiple uploads');
  PERFORM pg_temp.assert_claim_test(
    NOT EXISTS (SELECT 1 FROM public.get_group_schedule_claim_rows(test_group_id, ARRAY['2026-11','2026-12'])
                WHERE year_month = '2027-01'),
    'monthly picker stays within the chosen months when they have records');

  merge_id := public.merge_roster_people('13500000-0000-4000-8000-000000000021',
                                          '13500000-0000-4000-8000-000000000022');
  PERFORM public.undo_roster_people_merge(merge_id);
  PERFORM pg_temp.assert_claim_test((SELECT count(*) = 3 FROM public.get_my_schedule_shifts()), 'new claims survive merge and undo');

  SELECT id INTO STRICT claim_id FROM public.group_member_claims c
  WHERE c.group_id = test_group_id AND user_id = owner_id AND name_on_schedule = 'Jason1.';
  PERFORM set_config('request.jwt.claim.sub', member_id::TEXT, true);
  PERFORM public.remove_schedule_claim(test_group_id, claim_id);
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 1 FROM public.group_member_claims c WHERE c.id = claim_id), 'cannot remove another member claim');
  PERFORM public.add_schedule_claim(december, 'Jason1.');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 FROM public.group_member_claims c WHERE c.group_id = test_group_id AND name_on_schedule = 'Jason1.'),
    'different members may share a roster row');
  UPDATE public.shifts SET end_time = '17:30' WHERE schedule_id = december AND start_time = '09:00';
  PERFORM pg_temp.assert_claim_test(FOUND, 'a secondary claim preserves shift edit rights');

  PERFORM public.add_schedule_claim(december, 'Alternate label');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 FROM public.group_member_claims c
     WHERE c.group_id = test_group_id AND user_id = member_id
       AND name_on_schedule IN ('Jason1.', 'Alternate label')),
    'different OCR labels with one person ID use separate slots');
  PERFORM public.remove_schedule_claim(test_group_id, (
    SELECT id FROM public.group_member_claims c
    WHERE c.group_id = test_group_id AND c.user_id = member_id AND name_on_schedule = 'Jason1.'
  ));
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 1 AND bool_and(name_on_schedule = 'Alternate label')
     FROM public.get_my_schedule_shift_matches('2026-11-30', '2026-12-01')),
    'removing a named claim does not follow its rows through another name sharing the same person ID');

  PERFORM set_config('request.jwt.claim.sub', owner_id::TEXT, true);
  PERFORM public.remove_schedule_claim(test_group_id, claim_id);
  PERFORM public.remove_schedule_claim(test_group_id, claim_id);
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 FROM public.get_my_schedule_shifts()), 'individual removal and idempotent repeat');
  PERFORM public.add_schedule_claim(december, 'Jason1.');

  PERFORM pg_temp.assert_claim_test(
    public.claim_person_in_schedule(p_schedule_id => january, p_name_on_schedule => 'Another') = 1,
    'legacy claim still accepts the shipped named arguments and returns a count');
  PERFORM pg_temp.assert_claim_test(
    (SELECT jsonb_array_length(schedule_claims) = 3 AND claimed_name_on_schedule = 'Another'
     FROM public.get_group_member_profiles(test_group_id) WHERE user_id = owner_id),
    'legacy replacement affects the primary claim only');
  PERFORM public.unclaim_person_in_schedule(p_schedule_id => november);
  PERFORM public.unclaim_person_in_schedule(p_schedule_id => november);
  PERFORM pg_temp.assert_claim_test(
    (SELECT jsonb_array_length(schedule_claims) = 0 AND claimed_name_on_schedule IS NULL
       AND claimed_person_id IS NULL
     FROM public.get_group_member_profiles(test_group_id) WHERE user_id = owner_id),
    'legacy unclaim and retry clear every claim in the group');
  PERFORM public.claim_person_in_schedule(p_schedule_id => december, p_name_on_schedule => 'Jason1.');
  PERFORM pg_temp.assert_claim_test(
    (SELECT jsonb_array_length(schedule_claims) = 1 AND claimed_name_on_schedule = 'Jason1.'
     FROM public.get_group_member_profiles(test_group_id) WHERE user_id = owner_id),
    'legacy claim after full unclaim creates the primary claim');

  PERFORM public.add_schedule_claim(november, 'Cross group A');
  PERFORM public.add_schedule_claim('13500000-0000-4000-8000-000000000035', 'Cross group B');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 AND array_agg(effective_start_time ORDER BY effective_start_time) = ARRAY['08:00'::TIME, '09:00'::TIME]
      AND bool_and(to_jsonb(details)->'shift_row'->>'shift_code' = 'GX')
     FROM public.get_my_schedule_shift_details('2026-11-26', '2026-11-26') details),
    'same date and code with distinct group timing defaults retains both shifts and serializes the shift row');
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 2 FROM public.get_my_schedule_shifts('2026-11-26','2026-11-26')),
    'legacy reader also retains both group timing variants');

  BEGIN
    DELETE FROM public.group_member_claims WHERE id = claim_id;
    RAISE EXCEPTION 'direct delete was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '13500000-0000-4000-8000-000000000004', true);
  PERFORM pg_temp.assert_claim_test(
    (SELECT count(*) = 0 FROM public.group_member_claims c WHERE c.group_id = test_group_id), 'outsider cannot read claims');
  BEGIN
    PERFORM public.add_schedule_claim(december, 'Jason1.');
    RAISE EXCEPTION 'outsider claim was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'NOT_GROUP_MEMBER' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_claim_test(
  NOT has_function_privilege('anon', 'public.add_schedule_claim(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_my_schedule_shift_matches(date,date)', 'EXECUTE'),
  'claim and match RPCs require authentication');

-- Deleting a roster person must not leave an empty claim shell.
DELETE FROM public.persons WHERE id = '13500000-0000-4000-8000-000000000024';
SELECT pg_temp.assert_claim_test(
  NOT EXISTS (SELECT 1 FROM public.group_member_claims WHERE person_id IS NULL AND name_on_schedule IS NULL),
  'ID-only claim removed with its person');
SELECT pg_temp.assert_claim_test(
  (SELECT claimed_person_id IS NULL AND claimed_name_on_schedule IS NULL FROM public.group_members
   WHERE user_id = '13500000-0000-4000-8000-000000000005' AND group_id = '13500000-0000-4000-8000-000000000010'),
  'legacy projection cleared with the ID-only claim');

ROLLBACK;
