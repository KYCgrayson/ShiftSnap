-- Group-scoped roster identities. OCR text is preserved in shifts.name_on_schedule;
-- this layer only records which labels are known aliases of one canonical person.

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS canonical_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_persons_canonical_person ON public.persons(canonical_person_id);

-- Existing records are their own canonical identity until a user explicitly merges them.
UPDATE public.persons SET canonical_person_id = id WHERE canonical_person_id IS NULL;
-- PostgreSQL cannot point a new row at itself until it has an id. The resolver
-- fills this column in the same transaction immediately after insert.
ALTER TABLE public.persons ALTER COLUMN canonical_person_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_person_canonical_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.canonical_person_id IS NULL THEN
    UPDATE public.persons SET canonical_person_id = NEW.id WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_person_canonical_identity_after_insert ON public.persons;
CREATE TRIGGER set_person_canonical_identity_after_insert
  AFTER INSERT ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.set_person_canonical_identity();

CREATE TABLE IF NOT EXISTS public.person_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  canonical_person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_person_aliases_canonical ON public.person_aliases(group_id, canonical_person_id);

-- One row per merge gives users a safe, reversible history. Movement tables make
-- undo exact even when the primary identity already had historical shifts.
CREATE TABLE IF NOT EXISTS public.roster_identity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  primary_person_id UUID NOT NULL REFERENCES public.persons(id),
  secondary_person_id UUID NOT NULL REFERENCES public.persons(id),
  moved_alias_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (primary_person_id <> secondary_person_id)
);
CREATE INDEX IF NOT EXISTS idx_roster_identity_merges_group ON public.roster_identity_merges(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.roster_identity_merge_shift_movements (
  merge_id UUID NOT NULL REFERENCES public.roster_identity_merges(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  previous_person_id UUID NOT NULL REFERENCES public.persons(id),
  PRIMARY KEY (merge_id, shift_id)
);
CREATE TABLE IF NOT EXISTS public.roster_identity_merge_person_movements (
  merge_id UUID NOT NULL REFERENCES public.roster_identity_merges(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  previous_canonical_person_id UUID NOT NULL REFERENCES public.persons(id),
  PRIMARY KEY (merge_id, person_id)
);
CREATE TABLE IF NOT EXISTS public.roster_identity_merge_claim_movements (
  merge_id UUID NOT NULL REFERENCES public.roster_identity_merges(id) ON DELETE CASCADE,
  group_member_id UUID NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  previous_person_id UUID NOT NULL REFERENCES public.persons(id),
  PRIMARY KEY (merge_id, group_member_id)
);

CREATE OR REPLACE FUNCTION public.roster_normalize_name(p_name TEXT, p_ignore_trailing_number BOOLEAN DEFAULT false)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_ignore_trailing_number
    THEN regexp_replace(lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', '', 'g')), '[0-9０-９]+$', '')
    ELSE lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', '', 'g'))
  END;
$$;

-- Seed aliases from pre-existing people. A collision remains separate until a
-- manual merge, so existing exact-mode behavior is never silently changed.
INSERT INTO public.person_aliases (group_id, canonical_person_id, alias, normalized_alias, created_by)
SELECT p.group_id, p.canonical_person_id, p.name, public.roster_normalize_name(p.name), p.owner_id
FROM public.persons p
WHERE p.group_id IS NOT NULL AND btrim(p.name) <> ''
ON CONFLICT (group_id, normalized_alias) DO NOTHING;

ALTER TABLE public.person_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_identity_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_identity_merge_shift_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_identity_merge_person_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_identity_merge_claim_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY person_aliases_select_group_member ON public.person_aliases FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = person_aliases.group_id AND gm.user_id = auth.uid())
);
CREATE POLICY roster_identity_merges_select_group_member ON public.roster_identity_merges FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = roster_identity_merges.group_id AND gm.user_id = auth.uid())
);

-- A direct delete must not silently erase a canonical identity that has a
-- user-managed alias or reversible merge history. Simple one-name people can
-- still be removed by their owner.
DROP POLICY IF EXISTS persons_delete ON public.persons;
CREATE POLICY persons_delete ON public.persons FOR DELETE USING (
  auth.uid() = owner_id
  AND NOT EXISTS (
    SELECT 1 FROM public.person_aliases pa
    WHERE pa.canonical_person_id = persons.id
    GROUP BY pa.canonical_person_id HAVING count(*) > 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.roster_identity_merges rm
    WHERE rm.undone_at IS NULL AND (rm.primary_person_id = persons.id OR rm.secondary_person_id = persons.id)
  )
);

CREATE OR REPLACE FUNCTION public.set_group_roster_name_matching(
  p_group_id UUID,
  p_mode TEXT,
  p_sensitivity TEXT DEFAULT 'standard'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_mode NOT IN ('exact', 'ignore_trailing_numbers', 'fuzzy_suggestions')
     OR p_sensitivity NOT IN ('strict', 'standard', 'loose') THEN
    RAISE EXCEPTION 'INVALID_ROSTER_MATCHING_SETTING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = auth.uid() AND role IN ('admin', 'site_manager')) THEN
    RAISE EXCEPTION 'NOT_GROUP_MANAGER';
  END IF;
  UPDATE public.groups
  SET settings = jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{roster_name_matching}',
    jsonb_build_object('mode', p_mode, 'sensitivity', p_sensitivity), true
  )
  WHERE id = p_group_id;
END;
$$;

-- Resolve an OCR label to an existing canonical identity. Fuzzy mode is exact
-- only: fuzzy candidates must be explicitly confirmed through merge_roster_people.
CREATE OR REPLACE FUNCTION public.resolve_roster_person(
  p_group_id UUID,
  p_name TEXT,
  p_color TEXT DEFAULT '#4F6BFF'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
  v_mode TEXT;
  v_key TEXT;
  v_person_id UUID;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'ROSTER_NAME_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;
  SELECT coalesce(settings->'roster_name_matching'->>'mode', 'exact') INTO v_mode
  FROM public.groups WHERE id = p_group_id;
  IF v_mode NOT IN ('exact', 'ignore_trailing_numbers', 'fuzzy_suggestions') THEN v_mode := 'exact'; END IF;
  v_key := public.roster_normalize_name(v_name, v_mode = 'ignore_trailing_numbers');

  SELECT count(DISTINCT pa.canonical_person_id)
  INTO v_count
  FROM public.person_aliases pa
  WHERE pa.group_id = p_group_id
    AND public.roster_normalize_name(pa.alias, v_mode = 'ignore_trailing_numbers') = v_key;

  -- With explicit numeric-code mode, old "Name0" / "Name1" records can
  -- coexist. Choose the oldest canonical for new scans without rewriting
  -- history; the query layer groups existing aliases by the enabled rule.
  IF v_count = 1 THEN
    SELECT pa.canonical_person_id INTO v_person_id
    FROM public.person_aliases pa
    WHERE pa.group_id = p_group_id
      AND public.roster_normalize_name(pa.alias, v_mode = 'ignore_trailing_numbers') = v_key
    ORDER BY pa.created_at, pa.canonical_person_id
    LIMIT 1;
  ELSIF v_count > 1 AND v_mode = 'ignore_trailing_numbers' THEN
    SELECT pa.canonical_person_id INTO v_person_id
    FROM public.person_aliases pa
    WHERE pa.group_id = p_group_id
      AND public.roster_normalize_name(pa.alias, true) = v_key
    ORDER BY pa.created_at, pa.canonical_person_id
    LIMIT 1;
    v_count := 1;
  END IF;

  IF v_count = 1 THEN
    INSERT INTO public.person_aliases(group_id, canonical_person_id, alias, normalized_alias, created_by)
    VALUES (p_group_id, v_person_id, v_name, public.roster_normalize_name(v_name), auth.uid())
    ON CONFLICT (group_id, normalized_alias) DO NOTHING;
    RETURN v_person_id;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'ROSTER_NAME_AMBIGUOUS';
  END IF;

  INSERT INTO public.persons(owner_id, group_id, name, color, canonical_person_id)
  VALUES (auth.uid(), p_group_id, v_name, coalesce(nullif(p_color, ''), '#4F6BFF'), NULL)
  RETURNING id INTO v_person_id;
  UPDATE public.persons SET canonical_person_id = id WHERE id = v_person_id;
  INSERT INTO public.person_aliases(group_id, canonical_person_id, alias, normalized_alias, created_by)
  VALUES (p_group_id, v_person_id, v_name, public.roster_normalize_name(v_name), auth.uid())
  ON CONFLICT (group_id, normalized_alias) DO NOTHING;
  RETURN v_person_id;
END;
$$;

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

  INSERT INTO public.roster_identity_merge_claim_movements(merge_id, group_member_id, previous_person_id)
  SELECT v_merge_id, id, claimed_person_id FROM public.group_members
  WHERE group_id = v_group_id AND claimed_person_id = v_secondary;
  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members SET claimed_person_id = v_primary
  WHERE id IN (SELECT group_member_id FROM public.roster_identity_merge_claim_movements WHERE merge_id = v_merge_id);
  UPDATE public.person_aliases SET canonical_person_id = v_primary WHERE id = ANY(v_alias_ids);
  INSERT INTO public.roster_identity_merge_person_movements(merge_id, person_id, previous_canonical_person_id)
  SELECT v_merge_id, id, canonical_person_id FROM public.persons WHERE canonical_person_id = v_secondary;
  UPDATE public.persons SET canonical_person_id = v_primary
  WHERE id IN (SELECT person_id FROM public.roster_identity_merge_person_movements WHERE merge_id = v_merge_id);
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
  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members gm SET claimed_person_id = m.previous_person_id FROM public.roster_identity_merge_claim_movements m
  WHERE m.merge_id = p_merge_id AND gm.id = m.group_member_id AND gm.claimed_person_id = v_merge.primary_person_id;
  UPDATE public.person_aliases SET canonical_person_id = v_merge.secondary_person_id WHERE id = ANY(v_merge.moved_alias_ids);
  UPDATE public.persons p SET canonical_person_id = m.previous_canonical_person_id
  FROM public.roster_identity_merge_person_movements m
  WHERE m.merge_id = p_merge_id AND p.id = m.person_id AND p.canonical_person_id = v_merge.primary_person_id;
  UPDATE public.roster_identity_merges SET undone_at = now(), undone_by = auth.uid() WHERE id = p_merge_id;
END;
$$;

-- Claims and personal views resolve through canonical identity rather than the
-- raw month-specific OCR label. The original claimed_name_on_schedule remains
-- untouched for audit/display.
CREATE OR REPLACE FUNCTION public.claim_person_in_schedule(p_schedule_id UUID, p_name_on_schedule TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_group_id UUID; v_name TEXT := btrim(coalesce(p_name_on_schedule, '')); v_count INTEGER; v_person UUID; v_canonical UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND'; END IF;
  SELECT group_id INTO v_group_id FROM public.schedules WHERE id = p_schedule_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'SCHEDULE_NOT_IN_GROUP'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_group_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'NOT_GROUP_MEMBER'; END IF;
  SELECT count(*), max(person_id::text)::UUID INTO v_count, v_person FROM public.shifts
  WHERE schedule_id = p_schedule_id AND lower(btrim(coalesce(name_on_schedule, ''))) = lower(v_name);
  IF v_count = 0 THEN RAISE EXCEPTION 'SCHEDULE_ROW_NOT_FOUND'; END IF;
  SELECT canonical_person_id INTO v_canonical FROM public.persons WHERE id = v_person;
  IF v_canonical IS NULL THEN
    SELECT canonical_person_id INTO v_canonical FROM public.person_aliases
    WHERE group_id = v_group_id AND normalized_alias = public.roster_normalize_name(v_name);
  END IF;
  PERFORM set_config('ishift.schedule_claim_mutation', 'on', true);
  UPDATE public.group_members SET claimed_name_on_schedule = v_name, claimed_person_id = v_canonical
  WHERE group_id = v_group_id AND user_id = auth.uid();
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_schedule_shifts(p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL)
RETURNS SETOF public.shifts LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT sh.* FROM public.shifts sh JOIN public.schedules sc ON sc.id = sh.schedule_id
  LEFT JOIN public.persons sp ON sp.id = sh.person_id
  WHERE (p_start_date IS NULL OR sh.date >= p_start_date)
    AND (p_end_date IS NULL OR sh.date <= p_end_date)
    AND (
      EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = sc.group_id AND gm.user_id = auth.uid()
          AND (
            (gm.claimed_person_id IS NOT NULL AND (sp.canonical_person_id = gm.claimed_person_id OR EXISTS (
            SELECT 1 FROM public.person_aliases pa
            WHERE pa.group_id = sc.group_id AND pa.canonical_person_id = gm.claimed_person_id
              AND public.roster_normalize_name(pa.alias, coalesce((SELECT settings->'roster_name_matching'->>'mode' = 'ignore_trailing_numbers' FROM public.groups WHERE id = sc.group_id), false))
                = public.roster_normalize_name(sh.name_on_schedule, coalesce((SELECT settings->'roster_name_matching'->>'mode' = 'ignore_trailing_numbers' FROM public.groups WHERE id = sc.group_id), false))
            )))
            -- Legacy rows can have no person id. Preserve the original claim
            -- name fallback, including 0/1 matching only when enabled.
            OR (btrim(coalesce(gm.claimed_name_on_schedule, '')) <> '' AND
              public.roster_normalize_name(gm.claimed_name_on_schedule, coalesce((SELECT settings->'roster_name_matching'->>'mode' = 'ignore_trailing_numbers' FROM public.groups WHERE id = sc.group_id), false))
                = public.roster_normalize_name(sh.name_on_schedule, coalesce((SELECT settings->'roster_name_matching'->>'mode' = 'ignore_trailing_numbers' FROM public.groups WHERE id = sc.group_id), false))
            )
          )
      )
      OR (sh.user_id = auth.uid() AND sh.source = 'self_scan' AND NOT EXISTS (
        SELECT 1 FROM public.group_members gm WHERE gm.group_id = sc.group_id AND gm.user_id = auth.uid()
          AND (gm.claimed_person_id IS NOT NULL OR btrim(coalesce(gm.claimed_name_on_schedule, '')) <> '')
      ))
    ) ORDER BY sh.date ASC, sh.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.set_group_roster_name_matching(UUID, TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.resolve_roster_person(UUID, TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.merge_roster_people(UUID, UUID) FROM public;
REVOKE ALL ON FUNCTION public.undo_roster_people_merge(UUID) FROM public;
REVOKE ALL ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) FROM public;
REVOKE ALL ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.set_group_roster_name_matching(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_roster_person(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_roster_people(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_roster_people_merge(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_person_in_schedule(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_shifts(DATE, DATE) TO authenticated;
