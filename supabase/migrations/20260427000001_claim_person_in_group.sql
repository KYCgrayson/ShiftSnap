-- Claim-person-in-group migration
--
-- Lets a group member declare "this person row in a shared schedule is me",
-- so a schedule the uploader corrected on someone else's behalf becomes
-- the claimer's own self schedule (today/upcoming/calendar).
--
-- Two flows:
--   (1) Forward: during upload review, the uploader can tag a coworker row
--       to a group member; shifts are inserted directly with that user_id.
--       The relaxed shifts INSERT policy below permits this.
--   (2) Backfill: after joining a group, a member can claim a person in
--       the latest schedule via the claim_person_in_schedule RPC, which
--       bulk-rewrites those shifts' user_id to the claimer.

-- ============================================
-- 1. Track which person each member has claimed (per group)
-- ============================================

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS claimed_person_id UUID REFERENCES persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_members_claimed_person
  ON group_members(claimed_person_id);

-- ============================================
-- 2. Relax shifts INSERT/UPDATE/DELETE RLS
-- ============================================
--
-- INSERT: any group member may insert a shift attributed to another
-- group member of the same group, when the shift's schedule belongs to
-- that group. Self-inserts (auth.uid() = user_id) remain allowed.
--
-- UPDATE/DELETE: in addition to owning the shift, the schedule's owner
-- (uploader) and group admins/site_managers can mutate. Plain members
-- cannot edit shifts they don't own — ownership transfer is done via
-- the SECURITY DEFINER RPC below, not via direct UPDATE.

DROP POLICY IF EXISTS shifts_insert ON shifts;
CREATE POLICY shifts_insert ON shifts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM schedules s
      JOIN group_members gm_caller
        ON gm_caller.group_id = s.group_id AND gm_caller.user_id = auth.uid()
      JOIN group_members gm_target
        ON gm_target.group_id = s.group_id AND gm_target.user_id = shifts.user_id
      WHERE s.id = shifts.schedule_id
    )
  );

DROP POLICY IF EXISTS shifts_update ON shifts;
CREATE POLICY shifts_update ON shifts
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = shifts.schedule_id
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = s.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('admin', 'site_manager')
          )
        )
    )
  );

DROP POLICY IF EXISTS shifts_delete ON shifts;
CREATE POLICY shifts_delete ON shifts
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = shifts.schedule_id
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = s.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('admin', 'site_manager')
          )
        )
    )
  );

-- ============================================
-- 3. Claim RPC (backfill flow)
-- ============================================
--
-- The caller (typically a freshly-joined member) takes ownership of the
-- shifts attached to (schedule_id, person_id). They become self_scan with
-- the caller's user_id, so the wife's calendar/today/upcoming behave like
-- her own scan — even though her husband uploaded and corrected it.
--
-- Bypasses RLS on purpose: a plain member is normally blocked from
-- updating shifts owned by someone else. Validation is explicit:
--   * caller must be a member of the schedule's group
--   * the (schedule, person) pair must have shifts in that group

-- Identifies the row by name_on_schedule rather than person_id because
-- the row a user wants to claim may have been uploaded under either:
--   (a) a coworker entry (person_id is set, reference_scan), or
--   (b) the uploader's "self" row in step 1 of review (person_id is NULL,
--       self_scan), which is exactly what happens when a husband
--       uploads his wife's schedule under his own account.
-- name_on_schedule is populated for both cases.
CREATE OR REPLACE FUNCTION public.claim_person_in_schedule(
  p_schedule_id UUID,
  p_name_on_schedule TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_group_id UUID;
  v_updated INTEGER := 0;
  v_person_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT group_id INTO v_group_id FROM public.schedules WHERE id = p_schedule_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  -- Take ownership of every shift on the matching row of this schedule.
  -- Switching to self_scan + claimer's user_id makes them behave like
  -- a fresh self-scan in the claimer's calendar/today/upcoming views.
  -- person_id is intentionally preserved (when set) so the uploader
  -- still sees a coworker bar with the right color — ownership
  -- transfers, identity does not.
  UPDATE public.shifts
  SET user_id = v_caller,
      source = 'self_scan'
  WHERE schedule_id = p_schedule_id
    AND name_on_schedule = p_name_on_schedule;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Best-effort: pick any non-null person_id from the matched rows so
  -- group settings can show a stable "claimed: <person>" reference.
  -- Uploader-self rows have NULL person_id; that's fine.
  SELECT person_id INTO v_person_id
  FROM public.shifts
  WHERE schedule_id = p_schedule_id
    AND name_on_schedule = p_name_on_schedule
    AND person_id IS NOT NULL
  LIMIT 1;

  UPDATE public.group_members
  SET claimed_person_id = v_person_id
  WHERE group_id = v_group_id AND user_id = v_caller;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) TO authenticated;

-- ============================================
-- 4. Expose claimed_person_id via the existing member profile RPC
-- ============================================

DROP FUNCTION IF EXISTS public.get_group_member_profiles(UUID);

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
  avatar_url TEXT,
  claimed_person_id UUID
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
    u.avatar_url,
    gm.claimed_person_id
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
