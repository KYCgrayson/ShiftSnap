-- ops #136 regression. Run against a disposable LOCAL database with all
-- migrations applied (including 20261125000001):
-- psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/group_membership_security.sql
BEGIN;

CREATE FUNCTION pg_temp.assert_ok(ok BOOLEAN, message TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Membership test: %', message; END IF;
END;
$$;

-- Seed as a trusted writer (no JWT subject).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('13600000-0000-4000-8000-000000000001', 'm-admin@example.test', '{}'),
       ('13600000-0000-4000-8000-000000000002', 'm-member@example.test', '{}'),
       ('13600000-0000-4000-8000-000000000003', 'm-manager@example.test', '{}'),
       ('13600000-0000-4000-8000-000000000004', 'm-outsider@example.test', '{}'),
       ('13600000-0000-4000-8000-000000000005', 'm-invitee@example.test', '{}'),
       ('13600000-0000-4000-8000-000000000006', 'm-added@example.test', '{}');

INSERT INTO public.groups (id, name, invite_code, created_by)
VALUES ('13600000-0000-4000-8000-000000000010', 'Target group', 'QM0136', '13600000-0000-4000-8000-000000000001');
INSERT INTO public.group_members (group_id, user_id, role)
VALUES ('13600000-0000-4000-8000-000000000010', '13600000-0000-4000-8000-000000000001', 'admin'),
       ('13600000-0000-4000-8000-000000000010', '13600000-0000-4000-8000-000000000002', 'member'),
       ('13600000-0000-4000-8000-000000000010', '13600000-0000-4000-8000-000000000003', 'site_manager');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  target UUID := '13600000-0000-4000-8000-000000000010';
  admin_id UUID := '13600000-0000-4000-8000-000000000001';
  member_id UUID := '13600000-0000-4000-8000-000000000002';
  manager_id UUID := '13600000-0000-4000-8000-000000000003';
  outsider_id UUID := '13600000-0000-4000-8000-000000000004';
  invitee_id UUID := '13600000-0000-4000-8000-000000000005';
  added_id UUID := '13600000-0000-4000-8000-000000000006';
  new_group UUID := '13600000-0000-4000-8000-000000000020';
  joined UUID;
BEGIN
  -- Outsider cannot insert themselves into someone else's group (any role).
  PERFORM set_config('request.jwt.claim.sub', outsider_id::TEXT, true);
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (target, outsider_id, 'admin');
    RAISE EXCEPTION 'outsider self-insert as admin was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (target, outsider_id, 'member');
    RAISE EXCEPTION 'outsider self-insert as member was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Shipped "create default group" flow still works: create group, add self as admin.
  INSERT INTO public.groups (id, name, invite_code, created_by) VALUES (new_group, 'My Team', 'QN0136', outsider_id);
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_group, outsider_id, 'admin');
  PERFORM pg_temp.assert_ok(public.is_group_owner_admin(new_group), 'creator bootstrap as admin');

  -- Invite-code join still works and always yields role member.
  PERFORM set_config('request.jwt.claim.sub', invitee_id::TEXT, true);
  joined := public.join_group_by_invite_code('qm0136');
  PERFORM pg_temp.assert_ok(joined = target, 'join by invite code');
  -- Once a member, a second bootstrap into the creator's new group is refused.
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_group, invitee_id, 'admin');
    RAISE EXCEPTION 'bootstrap into a group with members was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Member cannot promote self, nor move the row to another group.
  PERFORM set_config('request.jwt.claim.sub', member_id::TEXT, true);
  BEGIN
    UPDATE public.group_members SET role = 'admin' WHERE group_id = target AND user_id = member_id;
    RAISE EXCEPTION 'member self-promotion was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.group_members SET group_id = new_group WHERE group_id = target AND user_id = member_id;
    RAISE EXCEPTION 'membership row move was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Ordinary profile edits still allowed (any non-role column the client edits).
  UPDATE public.group_members SET nickname = 'Nick', color = '#00aa00', is_visible = false WHERE group_id = target AND user_id = member_id;

  -- site_manager cannot promote self or others to admin, nor add an admin.
  PERFORM set_config('request.jwt.claim.sub', manager_id::TEXT, true);
  BEGIN
    UPDATE public.group_members SET role = 'admin' WHERE group_id = target AND user_id = manager_id;
    RAISE EXCEPTION 'site_manager self-promotion was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.group_members SET role = 'admin' WHERE group_id = target AND user_id = member_id;
    RAISE EXCEPTION 'site_manager promoting others was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (target, added_id, 'admin');
    RAISE EXCEPTION 'site_manager adding an admin was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.groups SET created_by = manager_id WHERE id = target;
    RAISE EXCEPTION 'site_manager changing created_by was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.group_members WHERE group_id = target AND user_id = admin_id;
    RAISE EXCEPTION 'site_manager removing the admin was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- site_manager can still add plain members (existing behaviour).
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (target, added_id, 'member');

  -- Admin can change other members' roles, but not their own.
  PERFORM set_config('request.jwt.claim.sub', admin_id::TEXT, true);
  UPDATE public.groups SET name = 'Renamed' WHERE id = target;
  BEGIN
    UPDATE public.groups SET created_by = member_id WHERE id = target;
    RAISE EXCEPTION 'admin changing created_by was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Creator cannot re-bootstrap into their own group while it has members.
  PERFORM set_config('request.jwt.claim.sub', invitee_id::TEXT, true);
  PERFORM public.join_group_by_invite_code('QN0136');
  PERFORM set_config('request.jwt.claim.sub', outsider_id::TEXT, true);
  DELETE FROM public.group_members WHERE group_id = new_group AND user_id = outsider_id;
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_group, outsider_id, 'admin');
    RAISE EXCEPTION 'creator re-bootstrap into a non-empty group was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', admin_id::TEXT, true);
  UPDATE public.group_members SET role = 'site_manager' WHERE group_id = target AND user_id = member_id;
  BEGIN
    UPDATE public.group_members SET role = 'member' WHERE group_id = target AND user_id = admin_id;
    RAISE EXCEPTION 'admin changing own role was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_ok(
  (SELECT role = 'site_manager' FROM public.group_members
   WHERE group_id = '13600000-0000-4000-8000-000000000010' AND user_id = '13600000-0000-4000-8000-000000000002'),
  'admin role change persisted');
SELECT pg_temp.assert_ok(
  NOT EXISTS (SELECT 1 FROM public.group_members
              WHERE group_id = '13600000-0000-4000-8000-000000000010' AND user_id = '13600000-0000-4000-8000-000000000004'),
  'outsider never joined');
SELECT pg_temp.assert_ok(
  (SELECT role = 'member' FROM public.group_members
   WHERE group_id = '13600000-0000-4000-8000-000000000010' AND user_id = '13600000-0000-4000-8000-000000000005'),
  'invitee joined as member');

ROLLBACK;
