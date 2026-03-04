-- Fix infinite recursion in group_members RLS policies (v2)
-- A SECURITY DEFINER function bypasses RLS, breaking the recursion cycle.

-- Helper function: get group IDs for a user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_group_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT group_id FROM group_members WHERE user_id = uid;
$$;

-- Helper function: check if user is admin of a group (bypasses RLS)
CREATE OR REPLACE FUNCTION is_group_admin(uid UUID, gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = uid AND group_id = gid AND role IN ('admin', 'site_manager')
  );
$$;

-- Drop all existing group_members policies
DROP POLICY IF EXISTS group_members_select ON group_members;
DROP POLICY IF EXISTS group_members_insert ON group_members;
DROP POLICY IF EXISTS group_members_update ON group_members;
DROP POLICY IF EXISTS group_members_delete ON group_members;

-- SELECT: user can see members of groups they belong to
CREATE POLICY group_members_select ON group_members
    FOR SELECT USING (
        group_id IN (SELECT get_user_group_ids(auth.uid()))
    );

-- INSERT: user can add themselves, or admins can add others
CREATE POLICY group_members_insert ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR is_group_admin(auth.uid(), group_id)
    );

-- UPDATE: user can update own membership, or admins can update
CREATE POLICY group_members_update ON group_members
    FOR UPDATE USING (
        auth.uid() = user_id
        OR is_group_admin(auth.uid(), group_id)
    );

-- DELETE: user can remove themselves, or admins can remove
CREATE POLICY group_members_delete ON group_members
    FOR DELETE USING (
        auth.uid() = user_id
        OR is_group_admin(auth.uid(), group_id)
    );
