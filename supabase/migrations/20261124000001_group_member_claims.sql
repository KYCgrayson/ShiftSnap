BEGIN;

-- Keep the first slot as the editable projection for clients with the old RPCs.
-- Fixed slots enforce the per-membership limit even outside the RPCs.
CREATE TABLE public.group_member_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  name_on_schedule TEXT CHECK (btrim(name_on_schedule) <> ''),
  follow_roster_identity BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, user_id) REFERENCES public.group_members(group_id, user_id) ON DELETE CASCADE,
  UNIQUE (group_id, user_id, slot),
  CONSTRAINT group_member_claims_identity_present CHECK (person_id IS NOT NULL OR name_on_schedule IS NOT NULL)
);

CREATE FUNCTION public.drop_id_only_schedule_claims() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    DELETE FROM public.group_member_claims
    WHERE person_id = OLD.id AND name_on_schedule IS NULL
    RETURNING group_id, user_id
  LOOP
    PERFORM public.refresh_legacy_schedule_claims(r.group_id, r.user_id);
  END LOOP;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.drop_id_only_schedule_claims() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER drop_id_only_schedule_claims BEFORE DELETE ON public.persons
FOR EACH ROW EXECUTE FUNCTION public.drop_id_only_schedule_claims();

-- Hold the membership table from concurrent writes through the compatibility
-- function swap. The whole file is one explicit transaction (BEGIN/COMMIT) so
-- LOCK TABLE also works under `supabase db push`, which does not open one.
LOCK TABLE public.group_members IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.group_member_claims (group_id, user_id, slot, person_id, name_on_schedule, follow_roster_identity)
SELECT gm.group_id, gm.user_id, 1,
       coalesce(original.person_id, gm.claimed_person_id), gm.claimed_name_on_schedule, true
FROM public.group_members gm
LEFT JOIN LATERAL (
  -- Older merges rewrote the primary claim. Recover the original identity
  -- when the retained label still identifies the moved person.
  SELECT history.previous_person_id AS person_id
  FROM public.roster_identity_merge_claim_movements history
  JOIN public.roster_identity_merges merge ON merge.id = history.merge_id
  JOIN public.persons person ON person.id = history.previous_person_id
  WHERE history.group_member_id = gm.id AND merge.undone_at IS NULL
    AND coalesce((SELECT p.canonical_person_id FROM public.persons p
                  WHERE p.id = merge.primary_person_id), merge.primary_person_id) = gm.claimed_person_id
    AND (gm.claimed_name_on_schedule IS NULL OR
         public.roster_normalize_name(person.name) = public.roster_normalize_name(gm.claimed_name_on_schedule))
  ORDER BY merge.created_at, merge.id
  LIMIT 1
) original ON true
WHERE gm.claimed_person_id IS NOT NULL OR gm.claimed_name_on_schedule IS NOT NULL;

ALTER TABLE public.group_member_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_member_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_member_claims TO authenticated;
CREATE POLICY group_member_claims_select ON public.group_member_claims FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm
  WHERE gm.group_id = group_member_claims.group_id AND gm.user_id = auth.uid()
));

-- Compatibility columns are a projection, never a source of authorization.
CREATE OR REPLACE FUNCTION public.enforce_controlled_schedule_claim_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.claimed_person_id IS NOT NULL OR NEW.claimed_name_on_schedule IS NOT NULL THEN
      RAISE EXCEPTION 'SCHEDULE_CLAIM_MUST_USE_RPC';
    END IF;
  ELSIF NEW.claimed_name_on_schedule IS DISTINCT FROM OLD.claimed_name_on_schedule
     OR NEW.claimed_person_id IS DISTINCT FROM OLD.claimed_person_id THEN
    -- Allow the persons foreign key to clear a deleted person.
    IF current_setting('ishift.schedule_claim_mutation', true) IS DISTINCT FROM 'on'
       AND NOT (OLD.claimed_person_id IS NOT NULL AND NEW.claimed_person_id IS NULL
                AND NEW.claimed_name_on_schedule IS NOT DISTINCT FROM OLD.claimed_name_on_schedule
                AND NOT EXISTS (SELECT 1 FROM public.persons WHERE id = OLD.claimed_person_id)) THEN
      RAISE EXCEPTION 'SCHEDULE_CLAIM_MUST_USE_RPC';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_controlled_schedule_claim_insert BEFORE INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_controlled_schedule_claim_update();

CREATE FUNCTION public.refresh_legacy_schedule_claims(p_group_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_previous_setting TEXT := current_setting('ishift.schedule_claim_mutation', true);
BEGIN
  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members gm
  SET claimed_person_id = projection.person_id, claimed_name_on_schedule = projection.name_on_schedule
  FROM (
    SELECT member.id, coalesce(p.canonical_person_id, c.person_id) AS person_id, c.name_on_schedule
    FROM public.group_members member
    LEFT JOIN public.group_member_claims c
      ON c.group_id = member.group_id AND c.user_id = member.user_id AND c.slot = 1
    LEFT JOIN public.persons p ON p.id = c.person_id
    WHERE member.group_id = p_group_id AND (p_user_id IS NULL OR member.user_id = p_user_id)
  ) projection
  WHERE gm.id = projection.id
    AND (gm.claimed_person_id, gm.claimed_name_on_schedule)
      IS DISTINCT FROM (projection.person_id, projection.name_on_schedule);
  PERFORM set_config('ishift.schedule_claim_mutation', coalesce(v_previous_setting, ''), true);
END;
$$;

CREATE FUNCTION public.lock_schedule_claim_membership(p_group_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  PERFORM 1 FROM public.group_members
  WHERE group_id = p_group_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_GROUP_MEMBER'; END IF;
END;
$$;

CREATE FUNCTION public.write_schedule_claim(p_schedule_id UUID, p_name_on_schedule TEXT, p_legacy BOOLEAN)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group_id UUID;
  v_name TEXT := btrim(coalesce(p_name_on_schedule, ''));
  v_count INTEGER;
  v_identity_count INTEGER;
  v_person_id UUID;
  v_existing_id UUID;
  v_slot SMALLINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND'; END IF;
  SELECT group_id INTO v_group_id FROM public.schedules WHERE id = p_schedule_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP'; END IF;
  PERFORM public.lock_schedule_claim_membership(v_group_id);

  SELECT count(*), count(DISTINCT coalesce(original.person_id, sh.person_id)) + CASE WHEN count(*) FILTER (
                               WHERE coalesce(original.person_id, sh.person_id) IS NULL
                             ) > 0 THEN 1 ELSE 0 END,
         min(coalesce(original.person_id, sh.person_id)::text)::UUID
  INTO v_count, v_identity_count, v_person_id
  FROM public.shifts sh
  LEFT JOIN LATERAL (
    -- A merged shift still carries its original OCR label. Preserve its
    -- underlying identity so a later undo follows the intended row.
    SELECT history.previous_person_id AS person_id
    FROM public.roster_identity_merge_shift_movements history
    JOIN public.roster_identity_merges merge ON merge.id = history.merge_id
    JOIN public.persons p ON p.id = history.previous_person_id
    WHERE history.shift_id = sh.id AND merge.undone_at IS NULL
      AND p.group_id = v_group_id AND p.canonical_person_id = sh.person_id
    ORDER BY merge.created_at, merge.id
    LIMIT 1
  ) original ON true
  WHERE sh.schedule_id = p_schedule_id AND lower(btrim(sh.name_on_schedule)) = lower(v_name);

  IF v_count = 0 THEN RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND'; END IF;
  IF v_identity_count > 1 THEN RAISE EXCEPTION 'AMBIGUOUS_SCHEDULE_ROW'; END IF;

  IF v_person_id IS NULL THEN
    SELECT canonical_person_id INTO v_person_id FROM public.person_aliases
    WHERE group_id = v_group_id AND normalized_alias = public.roster_normalize_name(v_name);
  END IF;
  -- Named claims follow distinct OCR labels even when those labels refer
  -- to the same roster person. An ID-only legacy claim can adopt a label.
  SELECT id, slot INTO v_existing_id, v_slot FROM public.group_member_claims
  WHERE group_id = v_group_id AND user_id = v_user_id
    AND (lower(btrim(name_on_schedule)) = lower(v_name)
         OR (name_on_schedule IS NULL AND person_id = v_person_id))
  ORDER BY name_on_schedule IS NULL, slot
  LIMIT 1;

  IF p_legacy THEN
    IF v_slot IS DISTINCT FROM 1 THEN
      DELETE FROM public.group_member_claims WHERE group_id = v_group_id AND user_id = v_user_id AND slot = 1;
      UPDATE public.group_member_claims SET slot = 1 WHERE id = v_existing_id;
    END IF;
    IF v_existing_id IS NOT NULL THEN
      UPDATE public.group_member_claims SET person_id = v_person_id, name_on_schedule = v_name,
        follow_roster_identity = true
      WHERE id = v_existing_id;
    END IF;
    v_slot := 1;
  ELSIF v_existing_id IS NULL THEN
    SELECT candidate INTO v_slot FROM generate_series(1, 3) AS candidate
    WHERE NOT EXISTS (
      SELECT 1 FROM public.group_member_claims
      WHERE group_id = v_group_id AND user_id = v_user_id AND slot = candidate
    )
    ORDER BY candidate
    LIMIT 1;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SCHEDULE_CLAIM_LIMIT'; END IF;
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.group_member_claims (group_id, user_id, slot, person_id, name_on_schedule, follow_roster_identity)
    VALUES (v_group_id, v_user_id, v_slot, v_person_id, v_name, p_legacy);
  ELSIF NOT p_legacy THEN
    UPDATE public.group_member_claims
    SET person_id = coalesce(person_id, v_person_id), name_on_schedule = coalesce(name_on_schedule, v_name)
    WHERE id = v_existing_id;
  END IF;
  PERFORM public.refresh_legacy_schedule_claims(v_group_id, v_user_id);
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.add_schedule_claim(p_schedule_id UUID, p_name_on_schedule TEXT)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.write_schedule_claim(p_schedule_id, p_name_on_schedule, false);
$$;

CREATE FUNCTION public.remove_schedule_claim(p_group_id UUID, p_claim_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_schedule_claim_membership(p_group_id);
  DELETE FROM public.group_member_claims
  WHERE id = p_claim_id AND group_id = p_group_id AND user_id = auth.uid();
  PERFORM public.refresh_legacy_schedule_claims(p_group_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_person_in_schedule(p_schedule_id UUID, p_name_on_schedule TEXT)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.write_schedule_claim(p_schedule_id, p_name_on_schedule, true);
$$;

CREATE OR REPLACE FUNCTION public.unclaim_person_in_schedule(p_schedule_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_group_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT group_id INTO v_group_id FROM public.schedules WHERE id = p_schedule_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP'; END IF;
  PERFORM public.lock_schedule_claim_membership(v_group_id);
  -- Old clients show a single claim; after their unclaim the member must have none.
  DELETE FROM public.group_member_claims WHERE group_id = v_group_id AND user_id = auth.uid();
  PERFORM public.refresh_legacy_schedule_claims(v_group_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_legacy_schedule_claims(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_schedule_claim_membership(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_schedule_claim(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_schedule_claim(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_schedule_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unclaim_person_in_schedule(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_schedule_claim(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_schedule_claim(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unclaim_person_in_schedule(UUID) TO authenticated;

-- Merges move roster data. Claims retain the original identity and resolve
-- through its current canonical person, including after undo.
CREATE OR REPLACE FUNCTION public.merge_roster_people(p_primary_person_id UUID, p_secondary_person_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_group_id UUID;
  v_primary UUID;
  v_secondary UUID;
  v_merge_id UUID;
  v_alias_ids UUID[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT group_id, canonical_person_id INTO v_group_id, v_primary FROM public.persons WHERE id = p_primary_person_id;
  SELECT canonical_person_id INTO v_secondary FROM public.persons WHERE id = p_secondary_person_id AND group_id = v_group_id;
  IF v_group_id IS NULL OR v_secondary IS NULL THEN RAISE EXCEPTION 'ROSTER_PERSON_NOT_IN_SAME_GROUP'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_group_id AND user_id = auth.uid() AND role IN ('admin', 'site_manager')) THEN RAISE EXCEPTION 'NOT_GROUP_MANAGER'; END IF;
  IF v_primary = v_secondary THEN RAISE EXCEPTION 'ROSTER_IDENTITIES_ALREADY_MERGED'; END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_alias_ids
  FROM public.person_aliases WHERE group_id = v_group_id AND canonical_person_id = v_secondary;
  INSERT INTO public.roster_identity_merges(group_id, primary_person_id, secondary_person_id, moved_alias_ids, created_by)
  VALUES (v_group_id, v_primary, v_secondary, v_alias_ids, auth.uid()) RETURNING id INTO v_merge_id;

  INSERT INTO public.roster_identity_merge_shift_movements(merge_id, shift_id, previous_person_id)
  SELECT v_merge_id, sh.id, sh.person_id FROM public.shifts sh JOIN public.schedules sc ON sc.id = sh.schedule_id
  WHERE sc.group_id = v_group_id AND sh.person_id = v_secondary;
  UPDATE public.shifts SET person_id = v_primary
  WHERE id IN (SELECT shift_id FROM public.roster_identity_merge_shift_movements WHERE merge_id = v_merge_id);

  UPDATE public.person_aliases SET canonical_person_id = v_primary WHERE id = ANY(v_alias_ids);
  INSERT INTO public.roster_identity_merge_person_movements(merge_id, person_id, previous_canonical_person_id)
  SELECT v_merge_id, id, canonical_person_id FROM public.persons WHERE canonical_person_id = v_secondary;
  UPDATE public.persons SET canonical_person_id = v_primary
  WHERE id IN (SELECT person_id FROM public.roster_identity_merge_person_movements WHERE merge_id = v_merge_id);
  PERFORM public.refresh_legacy_schedule_claims(v_group_id);
  RETURN v_merge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_roster_people_merge(p_merge_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_merge public.roster_identity_merges%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_merge FROM public.roster_identity_merges WHERE id = p_merge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROSTER_MERGE_NOT_FOUND'; END IF;
  IF v_merge.undone_at IS NOT NULL THEN RAISE EXCEPTION 'ROSTER_MERGE_ALREADY_UNDONE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_merge.group_id AND user_id = auth.uid() AND role IN ('admin', 'site_manager')) THEN RAISE EXCEPTION 'NOT_GROUP_MANAGER'; END IF;
  UPDATE public.shifts SET person_id = m.previous_person_id FROM public.roster_identity_merge_shift_movements m
  WHERE m.merge_id = p_merge_id AND shifts.id = m.shift_id AND shifts.person_id = v_merge.primary_person_id;
  UPDATE public.person_aliases SET canonical_person_id = v_merge.secondary_person_id WHERE id = ANY(v_merge.moved_alias_ids);
  UPDATE public.persons p SET canonical_person_id = m.previous_canonical_person_id
  FROM public.roster_identity_merge_person_movements m
  WHERE m.merge_id = p_merge_id AND p.id = m.person_id AND p.canonical_person_id = v_merge.primary_person_id;
  PERFORM public.refresh_legacy_schedule_claims(v_merge.group_id);
  UPDATE public.roster_identity_merges SET undone_at = now(), undone_by = auth.uid() WHERE id = p_merge_id;
END;
$$;

-- Raw matches let Calendar mark every matching shift as personal before
-- de-duplicating within the user's current calendar scope.
CREATE FUNCTION public.get_my_schedule_shift_matches(
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL
) RETURNS SETOF public.shifts
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT sh.*
  FROM public.shifts sh
  JOIN public.schedules sc ON sc.id = sh.schedule_id
  LEFT JOIN public.persons sp ON sp.id = sh.person_id
  LEFT JOIN public.groups g ON g.id = sc.group_id
  CROSS JOIN LATERAL (SELECT coalesce(g.settings->'roster_name_matching'->>'mode' = 'ignore_trailing_numbers', false) AS ignore_number) matching
  WHERE (p_start_date IS NULL OR sh.date >= p_start_date)
    AND (p_end_date IS NULL OR sh.date <= p_end_date)
    AND (
      EXISTS (
        SELECT 1 FROM public.group_member_claims c
        LEFT JOIN public.persons cp ON cp.id = c.person_id
        WHERE c.group_id = sc.group_id AND c.user_id = auth.uid()
          AND (
            (c.person_id IS NOT NULL AND (
              ((c.follow_roster_identity OR sh.name_on_schedule IS NULL)
                AND coalesce(sp.canonical_person_id, sh.person_id) = coalesce(cp.canonical_person_id, c.person_id))
              OR (c.follow_roster_identity AND EXISTS (
                SELECT 1 FROM public.person_aliases pa
                WHERE pa.group_id = c.group_id AND pa.canonical_person_id = coalesce(cp.canonical_person_id, c.person_id)
                  AND public.roster_normalize_name(pa.alias, matching.ignore_number)
                      = public.roster_normalize_name(sh.name_on_schedule, matching.ignore_number)
              ))
            ))
            OR (c.name_on_schedule IS NOT NULL AND (
              (c.follow_roster_identity AND public.roster_normalize_name(c.name_on_schedule, matching.ignore_number)
                   = public.roster_normalize_name(sh.name_on_schedule, matching.ignore_number))
              OR (NOT c.follow_roster_identity AND lower(btrim(c.name_on_schedule)) = lower(btrim(sh.name_on_schedule)))
            ))
          )
      )
      OR (sh.user_id = auth.uid() AND sh.source = 'self_scan' AND NOT EXISTS (
        SELECT 1 FROM public.group_member_claims c
        WHERE c.group_id = sc.group_id AND c.user_id = auth.uid()
          AND (c.person_id IS NOT NULL OR c.name_on_schedule IS NOT NULL)
      ))
    );
$$;

-- Resolve shift timing once using the source schedule's group. New clients
-- use it for Calendar, export and reminders so a shared code in a different
-- group cannot mask a separate shift with different times.
CREATE FUNCTION public.get_my_schedule_shift_details(
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL, p_include_duplicates BOOLEAN DEFAULT false
) RETURNS TABLE (shift_row public.shifts, effective_start_time TIME, effective_end_time TIME, effective_is_day_off BOOLEAN)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT selected.shift_row, selected.start_minute, selected.end_minute, selected.day_off
  FROM (
    SELECT sh AS shift_row, timing.start_minute, timing.end_minute, timing.day_off,
           row_number() OVER (
             PARTITION BY sh.date, sh.shift_code, timing.day_off, timing.start_minute, timing.end_minute
             ORDER BY sh.start_time IS NULL, sh.end_time IS NULL, sh.user_id <> auth.uid(), sh.created_at, sh.id
           ) AS duplicate_rank
    FROM public.get_my_schedule_shift_matches(p_start_date, p_end_date) sh
    JOIN public.schedules sc ON sc.id = sh.schedule_id
    LEFT JOIN LATERAL (
      SELECT codes.start_time, codes.end_time, codes.is_day_off
      FROM public.shift_codes codes
      WHERE codes.code = sh.shift_code
        AND (
          (codes.user_id = auth.uid() AND codes.group_id IS NULL)
          OR (codes.group_id = sc.group_id AND (
            codes.user_id = auth.uid()
            OR (codes.is_group_shared AND EXISTS (
              SELECT 1 FROM public.group_members gm WHERE gm.group_id = sc.group_id AND gm.user_id = auth.uid()
            ))
          ))
        )
      ORDER BY (codes.group_id = sc.group_id) DESC NULLS LAST, (codes.user_id = auth.uid()) DESC, codes.id
      LIMIT 1
    ) code ON true
    CROSS JOIN LATERAL (
      SELECT coalesce(sh.is_day_off, false) OR coalesce(code.is_day_off, false) AS day_off
    ) kind
    CROSS JOIN LATERAL (
      SELECT kind.day_off,
             CASE WHEN NOT kind.day_off THEN date_trunc('minute', DATE '2000-01-01' + coalesce(sh.start_time, code.start_time))::TIME END AS start_minute,
             CASE WHEN NOT kind.day_off THEN date_trunc('minute', DATE '2000-01-01' + coalesce(sh.end_time, code.end_time))::TIME END AS end_minute
    ) timing
  ) selected
  WHERE p_include_duplicates OR selected.duplicate_rank = 1
  ORDER BY (selected.shift_row).date, (selected.shift_row).created_at, (selected.shift_row).id;
$$;

CREATE OR REPLACE FUNCTION public.get_my_schedule_shifts(
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL
) RETURNS SETOF public.shifts
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT (details.shift_row).*
  FROM public.get_my_schedule_shift_details(p_start_date, p_end_date) details;
$$;

REVOKE ALL ON FUNCTION public.get_my_schedule_shift_matches(DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_schedule_shift_details(DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_shift_matches(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_shift_details(DATE, DATE, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) TO authenticated;

DROP POLICY shifts_update ON public.shifts;
CREATE POLICY shifts_update ON public.shifts FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    JOIN public.group_member_claims c ON c.group_id = sc.group_id AND c.user_id = auth.uid()
    LEFT JOIN public.persons p ON p.id = c.person_id
    WHERE sc.id = shifts.schedule_id
      AND (
        lower(btrim(shifts.name_on_schedule)) = lower(btrim(c.name_on_schedule))
        OR ((c.follow_roster_identity OR shifts.name_on_schedule IS NULL)
            AND shifts.person_id = coalesce(p.canonical_person_id, c.person_id))
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    WHERE sc.id = shifts.schedule_id
      AND (sc.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = sc.group_id AND gm.user_id = auth.uid()
          AND gm.role IN ('admin', 'site_manager')
      ))
  )
);

-- Older clients continue to receive the original profile columns.
DROP FUNCTION public.get_group_member_profiles(UUID);

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
  claimed_name_on_schedule TEXT,
  schedule_claims JSONB
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
    gm.claimed_name_on_schedule,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'person_id', c.person_id, 'name_on_schedule', c.name_on_schedule
      ) ORDER BY c.slot)
      FROM public.group_member_claims c
      WHERE c.group_id = gm.group_id AND c.user_id = gm.user_id
    ), '[]'::jsonb)
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

REVOKE ALL ON FUNCTION public.get_group_member_profiles(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_member_profiles(UUID) TO authenticated;

CREATE FUNCTION public.get_group_schedule_claim_rows(p_group_id UUID, p_year_months TEXT[])
RETURNS TABLE (schedule_id UUID, year_month TEXT, name_on_schedule TEXT, shift_count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  WITH group_schedules AS (
    SELECT sc.id, sc.year_month, sc.created_at
    FROM public.schedules sc
    WHERE sc.group_id = p_group_id
      AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.shifts sh WHERE sh.schedule_id = sc.id AND btrim(sh.name_on_schedule) <> '')
  ),
  candidate_months AS (
    SELECT unnest(p_year_months) AS month
    UNION ALL
    SELECT max(sc.year_month) FROM group_schedules sc
    WHERE NOT EXISTS (SELECT 1 FROM group_schedules recent WHERE recent.year_month = ANY(p_year_months))
  ),
  rows AS (
    SELECT sc.id, sc.year_month, sc.created_at, min(btrim(sh.name_on_schedule)) AS name,
           lower(btrim(sh.name_on_schedule)) AS name_key, count(*) AS shift_count,
           count(DISTINCT coalesce(sh.person_id::TEXT, 'unassigned')) > 1 AS ambiguous
    FROM group_schedules sc
    JOIN public.shifts sh ON sh.schedule_id = sc.id
    WHERE sc.year_month IN (SELECT month FROM candidate_months) AND btrim(sh.name_on_schedule) <> ''
    GROUP BY sc.id, sc.year_month, sc.created_at, lower(btrim(sh.name_on_schedule))
  )
  SELECT DISTINCT ON (r.year_month, r.name_key) r.id, r.year_month, r.name, r.shift_count
  FROM rows r
  ORDER BY r.year_month, r.name_key, r.ambiguous, r.created_at DESC, r.id;
$$;

REVOKE ALL ON FUNCTION public.get_group_schedule_claim_rows(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_schedule_claim_rows(UUID, TEXT[]) TO authenticated;

COMMIT;
