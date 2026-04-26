-- Looking up a group by its invite_code is required for the join flow,
-- but the groups_select RLS policy only lets members and creators read
-- their groups. A non-member who has the invite code therefore cannot
-- find the group at all and join always fails with INVALID_CODE.
--
-- Add a SECURITY DEFINER function that returns just the id when the
-- invite_code matches, bypassing RLS for this single narrow query.
-- Returning only the id (no name, no settings) keeps invite-code
-- guessing low-value: the attacker still needs to be added as a member
-- before they can read anything else about the group.

CREATE OR REPLACE FUNCTION public.find_group_by_invite_code(code TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.groups
  WHERE invite_code = upper(code)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_group_by_invite_code(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.find_group_by_invite_code(TEXT) TO authenticated;

-- Atomically join a group via invite_code: looks up the group bypassing
-- RLS, then inserts the caller into group_members. Returns the group id
-- on success or NULL when no group has that code. Existing membership
-- raises a unique-violation that the client surfaces as ALREADY_MEMBER.
CREATE OR REPLACE FUNCTION public.join_group_by_invite_code(code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  gid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT id INTO gid FROM public.groups WHERE invite_code = upper(code) LIMIT 1;
  IF gid IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (gid, auth.uid(), 'member');

  RETURN gid;
END;
$$;

REVOKE ALL ON FUNCTION public.join_group_by_invite_code(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite_code(TEXT) TO authenticated;
