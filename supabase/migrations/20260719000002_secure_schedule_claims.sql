-- Secure the explicit schedule-claim model.
--
-- A member can have one current claim per group, while many members may claim
-- the same canonical roster row. Claims are deliberately changed only through
-- the validated SECURITY DEFINER RPCs below; ordinary membership profile
-- fields (nickname, colour and visibility) remain directly editable.

-- The previous upload-time trigger could silently replace a member's chosen
-- claim when another member uploaded a shift attributed to them. Claims must
-- now always be an explicit action by the member.
DROP TRIGGER IF EXISTS set_member_schedule_identity_after_shift_write ON public.shifts;
DROP FUNCTION IF EXISTS public.set_member_schedule_identity_from_shift();

-- PostgREST table updates must not be able to grant claim-derived access to a
-- different roster row. The transaction-local flag is set only by the two
-- SECURITY DEFINER RPCs in this migration; there is intentionally no RPC that
-- exposes the flag itself.
CREATE OR REPLACE FUNCTION public.enforce_controlled_schedule_claim_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.claimed_name_on_schedule IS DISTINCT FROM OLD.claimed_name_on_schedule
     OR NEW.claimed_person_id IS DISTINCT FROM OLD.claimed_person_id THEN
    IF current_setting('ishift.schedule_claim_mutation', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'SCHEDULE_CLAIM_MUST_USE_RPC';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_controlled_schedule_claim_update ON public.group_members;
CREATE TRIGGER enforce_controlled_schedule_claim_update
  BEFORE UPDATE OF claimed_name_on_schedule, claimed_person_id
  ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_controlled_schedule_claim_update();

-- Set the caller's one claim for this group. The upload must contain exactly
-- one person identity for the requested display name. A mixture of person IDs
-- (including assigned and unassigned rows) is ambiguous and is rejected rather
-- than merging several roster rows into one claim. Rows that are all unassigned
-- remain supported for the self-scan flow; duplicate all-unassigned names need
-- OCR correction because the legacy schema has no separate roster-row ID.
CREATE OR REPLACE FUNCTION public.claim_person_in_schedule(
  p_schedule_id UUID,
  p_name_on_schedule TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_group_id UUID;
  v_name TEXT := btrim(coalesce(p_name_on_schedule, ''));
  v_shift_count INTEGER := 0;
  v_person_identity_count INTEGER := 0;
  v_person_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND';
  END IF;

  SELECT group_id INTO v_group_id
  FROM public.schedules
  WHERE id = p_schedule_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(DISTINCT coalesce(person_id::text, '__unassigned__'))::INTEGER,
    max(person_id::text)::UUID
  INTO v_shift_count, v_person_identity_count, v_person_id
  FROM public.shifts
  WHERE schedule_id = p_schedule_id
    AND lower(btrim(coalesce(name_on_schedule, ''))) = lower(v_name);

  IF v_shift_count = 0 THEN
    RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND';
  END IF;

  IF v_person_identity_count <> 1 THEN
    RAISE EXCEPTION 'AMBIGUOUS_SCHEDULE_ROW';
  END IF;

  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members
  SET claimed_name_on_schedule = v_name,
      claimed_person_id = v_person_id
  WHERE group_id = v_group_id AND user_id = v_caller;

  RETURN v_shift_count;
END;
$$;

-- Clear only the caller's current claim for the group containing the supplied
-- schedule. This never deletes canonical shifts or device-calendar events.
CREATE OR REPLACE FUNCTION public.unclaim_person_in_schedule(
  p_schedule_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_group_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT group_id INTO v_group_id
  FROM public.schedules
  WHERE id = p_schedule_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members
  SET claimed_name_on_schedule = NULL,
      claimed_person_id = NULL
  WHERE group_id = v_group_id AND user_id = v_caller;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.unclaim_person_in_schedule(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.unclaim_person_in_schedule(UUID) TO authenticated;
