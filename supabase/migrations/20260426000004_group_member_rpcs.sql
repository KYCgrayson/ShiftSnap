-- The users table RLS policy `users_select` only lets a caller read their
-- own profile (auth.uid() = id), so the previous fetchMembers query
-- (group_members + nested users join) returned NULL display_name and
-- email for every other group member. The admin UI therefore showed
-- blank names for everyone but themselves.
--
-- Add a SECURITY DEFINER RPC that returns minimal profile data for the
-- members of a single group, and only when the caller is itself a member
-- of that group. This bypasses the users_select RLS for the targeted
-- read without exposing other users' data globally.
CREATE OR REPLACE FUNCTION public.get_group_member_profiles(gid UUID)
RETURNS TABLE (
  membership_id UUID,
  user_id UUID,
  role group_role,
  nickname TEXT,
  color TEXT,
  is_visible BOOLEAN,
  joined_at TIMESTAMPTZ,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    gm.id          AS membership_id,
    gm.user_id,
    gm.role,
    gm.nickname,
    gm.color,
    gm.is_visible,
    gm.joined_at,
    u.display_name,
    u.email,
    u.avatar_url
  FROM public.group_members gm
  JOIN public.users u ON u.id = gm.user_id
  WHERE gm.group_id = gid
    AND EXISTS (
      SELECT 1 FROM public.group_members me
      WHERE me.group_id = gid AND me.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.get_group_member_profiles(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_group_member_profiles(UUID) TO authenticated;

-- Admin / site_manager removal of another member. Refuses to act when
-- the caller is not an admin of the group, when targeting an admin
-- (admins can only leave on their own), or when targeting self (use the
-- existing leave-group flow instead).
CREATE OR REPLACE FUNCTION public.remove_group_member(gid UUID, target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role group_role;
  target_role group_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF';
  END IF;

  SELECT role INTO caller_role FROM public.group_members
  WHERE group_id = gid AND user_id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'site_manager') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT role INTO target_role FROM public.group_members
  WHERE group_id = gid AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_ADMIN';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = gid AND user_id = target_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;
