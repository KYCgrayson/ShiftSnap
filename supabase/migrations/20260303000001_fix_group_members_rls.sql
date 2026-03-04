-- Fix infinite recursion in group_members RLS policies
-- The SELECT policy was querying group_members itself, causing infinite recursion.
-- Fix: allow users to see group_members rows where they are a member (by user_id directly).

-- Drop all existing group_members policies
DROP POLICY IF EXISTS group_members_select ON group_members;
DROP POLICY IF EXISTS group_members_insert ON group_members;
DROP POLICY IF EXISTS group_members_update ON group_members;
DROP POLICY IF EXISTS group_members_delete ON group_members;

-- SELECT: user can see members of groups they belong to
-- Use a direct check on user_id to avoid recursion
CREATE POLICY group_members_select ON group_members
    FOR SELECT USING (
        auth.uid() = user_id
        OR group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid())
    );

-- INSERT: user can add themselves, or admins can add others
CREATE POLICY group_members_insert ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

-- UPDATE: user can update own membership, or admins can update
CREATE POLICY group_members_update ON group_members
    FOR UPDATE USING (
        auth.uid() = user_id
        OR group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

-- DELETE: user can remove themselves, or admins can remove
CREATE POLICY group_members_delete ON group_members
    FOR DELETE USING (
        auth.uid() = user_id
        OR group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );
