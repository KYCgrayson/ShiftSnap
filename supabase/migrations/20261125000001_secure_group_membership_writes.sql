-- ops #136: close two membership escalation paths.
--
-- 1. INSERT: the policy allowed `auth.uid() = user_id`, so any signed-in user
--    could insert themselves into ANY group with ANY role (including admin).
--    Joining by invite already goes through the SECURITY DEFINER RPC
--    join_group_by_invite_code. The only legitimate direct self-insert is the
--    shipped client's "create default group" flow: create a group, then add
--    yourself as its first member (admin).
-- 2. UPDATE: the policy allowed members to update their own row with no column
--    restriction, so a member (or site_manager) could promote themselves to
--    admin, or move their membership row to another group.
--
-- Profile fields (nickname, colour, visibility) stay directly editable.

-- Creator bootstrap: the caller created the group and it has no members yet.
CREATE OR REPLACE FUNCTION public.can_bootstrap_group_membership(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = p_group_id AND g.created_by = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = p_group_id);
$$;
REVOKE ALL ON FUNCTION public.can_bootstrap_group_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_group_membership(UUID) TO authenticated;

-- Strict admin check (site_manager is NOT enough to grant roles).
CREATE OR REPLACE FUNCTION public.is_group_owner_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_group_owner_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_owner_admin(UUID) TO authenticated;

DROP POLICY IF EXISTS group_members_insert ON public.group_members;
CREATE POLICY group_members_insert ON public.group_members
  FOR INSERT WITH CHECK (
    (auth.uid() = user_id AND public.can_bootstrap_group_membership(group_id))
    OR public.is_group_admin(auth.uid(), group_id)
  );

-- Role and identity rules for client (JWT) writes. Writes with no JWT subject
-- (migrations, auth triggers such as handle_new_user, service role) are trusted.
CREATE OR REPLACE FUNCTION public.enforce_group_membership_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'member' THEN
      IF NOT (
        (NEW.user_id = v_caller AND NEW.role = 'admin' AND public.can_bootstrap_group_membership(NEW.group_id))
        OR (NEW.user_id <> v_caller AND public.is_group_owner_admin(NEW.group_id))
      ) THEN
        RAISE EXCEPTION 'GROUP_ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'GROUP_MEMBERSHIP_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.user_id = v_caller OR NOT public.is_group_owner_admin(NEW.group_id) THEN
      RAISE EXCEPTION 'GROUP_ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_group_membership_role_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_group_membership_role_rules ON public.group_members;
CREATE TRIGGER enforce_group_membership_role_rules
  BEFORE INSERT OR UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_membership_role_rules();

-- 3. groups.created_by drives the bootstrap rule above and grants read/delete
--    on the group, so clients must not be able to change it (review finding:
--    a site_manager could set created_by to self, empty the group, then
--    bootstrap as admin; an admin could hand group delete rights to anyone).
CREATE OR REPLACE FUNCTION public.enforce_group_identity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'GROUP_OWNER_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_group_identity_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_group_identity_immutable ON public.groups;
CREATE TRIGGER enforce_group_identity_immutable BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_identity_immutable();

-- 4. Only an admin may remove another admin's membership. The table policy
--    let a site_manager delete any row, bypassing remove_group_member's own
--    refusal. Leaving yourself and cascades from a deleted group still work.
CREATE OR REPLACE FUNCTION public.enforce_admin_membership_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.role = 'admin'
     AND OLD.user_id <> auth.uid()
     AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = OLD.group_id)
     AND NOT public.is_group_owner_admin(OLD.group_id) THEN
    RAISE EXCEPTION 'GROUP_ADMIN_REMOVAL_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_admin_membership_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_admin_membership_delete ON public.group_members;
CREATE TRIGGER enforce_admin_membership_delete BEFORE DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_membership_delete();
