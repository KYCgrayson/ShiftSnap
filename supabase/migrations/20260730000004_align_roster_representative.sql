-- Keep the numeric-code representative consistent across database resolution,
-- Settings, and Calendar. Existing aliases were backfilled in one transaction,
-- so alias.created_at is not a reliable ordering key; persons.created_at is.

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
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER';
  END IF;

  SELECT coalesce(settings->'roster_name_matching'->>'mode', 'exact')
  INTO v_mode
  FROM public.groups
  WHERE id = p_group_id;
  IF v_mode NOT IN ('exact', 'ignore_trailing_numbers', 'fuzzy_suggestions') THEN
    v_mode := 'exact';
  END IF;

  v_key := public.roster_normalize_name(
    v_name,
    v_mode = 'ignore_trailing_numbers'
  );

  SELECT count(DISTINCT pa.canonical_person_id)
  INTO v_count
  FROM public.person_aliases pa
  WHERE pa.group_id = p_group_id
    AND public.roster_normalize_name(
      pa.alias,
      v_mode = 'ignore_trailing_numbers'
    ) = v_key;

  IF v_count = 1 THEN
    SELECT pa.canonical_person_id
    INTO v_person_id
    FROM public.person_aliases pa
    JOIN public.persons canonical
      ON canonical.id = pa.canonical_person_id
    WHERE pa.group_id = p_group_id
      AND public.roster_normalize_name(
        pa.alias,
        v_mode = 'ignore_trailing_numbers'
      ) = v_key
    ORDER BY canonical.created_at, canonical.id
    LIMIT 1;
  ELSIF v_count > 1 AND v_mode = 'ignore_trailing_numbers' THEN
    SELECT pa.canonical_person_id
    INTO v_person_id
    FROM public.person_aliases pa
    JOIN public.persons canonical
      ON canonical.id = pa.canonical_person_id
    WHERE pa.group_id = p_group_id
      AND public.roster_normalize_name(pa.alias, true) = v_key
    ORDER BY canonical.created_at, canonical.id
    LIMIT 1;
    v_count := 1;
  END IF;

  IF v_count = 1 THEN
    INSERT INTO public.person_aliases(
      group_id,
      canonical_person_id,
      alias,
      normalized_alias,
      created_by
    )
    VALUES (
      p_group_id,
      v_person_id,
      v_name,
      public.roster_normalize_name(v_name),
      auth.uid()
    )
    ON CONFLICT (group_id, normalized_alias) DO NOTHING;
    RETURN v_person_id;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'ROSTER_NAME_AMBIGUOUS';
  END IF;

  INSERT INTO public.persons(
    owner_id,
    group_id,
    name,
    color,
    canonical_person_id
  )
  VALUES (
    auth.uid(),
    p_group_id,
    v_name,
    coalesce(nullif(p_color, ''), '#4F6BFF'),
    NULL
  )
  RETURNING id INTO v_person_id;

  UPDATE public.persons
  SET canonical_person_id = id
  WHERE id = v_person_id;

  INSERT INTO public.person_aliases(
    group_id,
    canonical_person_id,
    alias,
    normalized_alias,
    created_by
  )
  VALUES (
    p_group_id,
    v_person_id,
    v_name,
    public.roster_normalize_name(v_name),
    auth.uid()
  )
  ON CONFLICT (group_id, normalized_alias) DO NOTHING;

  RETURN v_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_roster_person(UUID, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_roster_person(UUID, TEXT, TEXT) TO authenticated;
