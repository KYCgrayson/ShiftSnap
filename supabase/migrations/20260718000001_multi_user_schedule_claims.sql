-- One personal schedule identity per member, per group
--
-- A group member stores exactly one claimed roster name. Multiple members may
-- store the same name, so an uploader and their spouse can both view and sync
-- one canonical row without transferring or duplicating the underlying shifts.

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS claimed_name_on_schedule TEXT;

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_claimed_name_not_blank
  CHECK (
    claimed_name_on_schedule IS NULL
    OR btrim(claimed_name_on_schedule) <> ''
  );

-- Preserve the best available identity from the previous ownership-transfer
-- implementation. Prefer the existing person link, then the member's latest
-- self-scan row in the group.
WITH claim_candidates AS (
  SELECT
    gm.id AS membership_id,
    btrim(sh.name_on_schedule) AS claimed_name,
    sh.person_id,
    row_number() OVER (
      PARTITION BY gm.id
      ORDER BY
        CASE
          WHEN gm.claimed_person_id IS NOT NULL
            AND sh.person_id = gm.claimed_person_id THEN 0
          ELSE 1
        END,
        sc.created_at DESC,
        sh.created_at DESC
    ) AS candidate_rank
  FROM public.group_members gm
  JOIN public.schedules sc ON sc.group_id = gm.group_id
  JOIN public.shifts sh ON sh.schedule_id = sc.id
  WHERE btrim(coalesce(sh.name_on_schedule, '')) <> ''
    AND (
      (
        gm.claimed_person_id IS NOT NULL
        AND sh.person_id = gm.claimed_person_id
      )
      OR (
        sh.user_id = gm.user_id
        AND sh.source = 'self_scan'
      )
    )
)
UPDATE public.group_members gm
SET
  claimed_name_on_schedule = cc.claimed_name,
  claimed_person_id = coalesce(gm.claimed_person_id, cc.person_id)
FROM claim_candidates cc
WHERE cc.membership_id = gm.id
  AND cc.candidate_rank = 1
  AND gm.claimed_name_on_schedule IS NULL;

-- A row tagged to a group member during upload becomes that member's one
-- personal schedule identity. A later tag for a different name replaces only
-- that member's identity; other members who chose either row are untouched.
CREATE OR REPLACE FUNCTION public.set_member_schedule_identity_from_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id UUID;
  v_name TEXT := btrim(coalesce(NEW.name_on_schedule, ''));
BEGIN
  IF NEW.source <> 'self_scan' OR v_name = '' THEN
    RETURN NEW;
  END IF;

  SELECT group_id
  INTO v_group_id
  FROM public.schedules
  WHERE id = NEW.schedule_id;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.group_members
  SET
    claimed_name_on_schedule = v_name,
    claimed_person_id = NEW.person_id
  WHERE group_id = v_group_id
    AND user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_member_schedule_identity_after_shift_write ON public.shifts;
CREATE TRIGGER set_member_schedule_identity_after_shift_write
  AFTER INSERT OR UPDATE OF user_id, person_id, source, name_on_schedule
  ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_schedule_identity_from_shift();

-- Claiming updates one scalar field on the caller's membership. It never
-- rewrites shifts.user_id, so the same canonical roster row can be claimed by
-- any number of members while each member still has only one selection.
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
  v_person_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND';
  END IF;

  SELECT group_id
  INTO v_group_id
  FROM public.schedules
  WHERE id = p_schedule_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = v_group_id
      AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  SELECT count(*)::INTEGER, max(person_id::text)::UUID
  INTO v_shift_count, v_person_id
  FROM public.shifts
  WHERE schedule_id = p_schedule_id
    AND lower(btrim(coalesce(name_on_schedule, ''))) = lower(v_name);

  IF v_shift_count = 0 THEN
    RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND';
  END IF;

  UPDATE public.group_members
  SET
    claimed_name_on_schedule = v_name,
    claimed_person_id = v_person_id
  WHERE group_id = v_group_id
    AND user_id = v_caller;

  RETURN v_shift_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) TO authenticated;

-- Personal views use the member's claim when one exists. If no identity has
-- been selected for that group yet, the member's own self-scan remains the
-- fallback. Schedules outside a group keep the original self-scan behavior.
CREATE OR REPLACE FUNCTION public.get_my_schedule_shifts(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS SETOF public.shifts
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT sh.*
  FROM public.shifts sh
  JOIN public.schedules sc ON sc.id = sh.schedule_id
  WHERE (p_start_date IS NULL OR sh.date >= p_start_date)
    AND (p_end_date IS NULL OR sh.date <= p_end_date)
    AND (
      EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = sc.group_id
          AND gm.user_id = auth.uid()
          AND btrim(coalesce(gm.claimed_name_on_schedule, '')) <> ''
          AND (
            lower(btrim(coalesce(sh.name_on_schedule, '')))
              = lower(btrim(gm.claimed_name_on_schedule))
            OR (
              gm.claimed_person_id IS NOT NULL
              AND sh.person_id = gm.claimed_person_id
            )
          )
      )
      OR (
        sh.user_id = auth.uid()
        AND sh.source = 'self_scan'
        AND NOT EXISTS (
          SELECT 1
          FROM public.group_members gm
          WHERE gm.group_id = sc.group_id
            AND gm.user_id = auth.uid()
            AND btrim(coalesce(gm.claimed_name_on_schedule, '')) <> ''
        )
      )
    )
  ORDER BY sh.date ASC, sh.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) TO authenticated;

-- A claimant may correct the canonical row they follow. The edit is visible
-- to all claimants because there is still only one shift record.
DROP POLICY IF EXISTS shifts_update ON public.shifts;
CREATE POLICY shifts_update ON public.shifts
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.schedules sc
      JOIN public.group_members gm
        ON gm.group_id = sc.group_id
       AND gm.user_id = auth.uid()
      WHERE sc.id = shifts.schedule_id
        AND btrim(coalesce(gm.claimed_name_on_schedule, '')) <> ''
        AND (
          lower(btrim(coalesce(shifts.name_on_schedule, '')))
            = lower(btrim(gm.claimed_name_on_schedule))
          OR (
            gm.claimed_person_id IS NOT NULL
            AND shifts.person_id = gm.claimed_person_id
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.schedules sc
      WHERE sc.id = shifts.schedule_id
        AND (
          sc.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = sc.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('admin', 'site_manager')
          )
        )
    )
  );

-- Return the one claimed identity with each membership so every client can
-- show who follows a row. Adding a return column is backward compatible for
-- existing clients, which simply ignore fields they do not read.
DROP FUNCTION IF EXISTS public.get_group_member_profiles(UUID);

CREATE OR REPLACE FUNCTION public.get_group_member_profiles(gid UUID)
RETURNS TABLE (
  membership_id UUID,
  user_id UUID,
  role public.group_role,
  nickname TEXT,
  color TEXT,
  is_visible BOOLEAN,
  joined_at TIMESTAMPTZ,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  claimed_person_id UUID,
  claimed_name_on_schedule TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    gm.id AS membership_id,
    gm.user_id,
    gm.role,
    gm.nickname,
    gm.color,
    gm.is_visible,
    gm.joined_at,
    u.display_name,
    u.email,
    u.avatar_url,
    gm.claimed_person_id,
    gm.claimed_name_on_schedule
  FROM public.group_members gm
  JOIN public.users u ON u.id = gm.user_id
  WHERE gm.group_id = gid
    AND EXISTS (
      SELECT 1
      FROM public.group_members me
      WHERE me.group_id = gid
        AND me.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.get_group_member_profiles(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_group_member_profiles(UUID) TO authenticated;
