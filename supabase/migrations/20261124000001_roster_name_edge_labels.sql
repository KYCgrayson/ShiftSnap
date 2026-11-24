CREATE OR REPLACE FUNCTION public.roster_normalize_name(p_name TEXT, p_ignore_trailing_number BOOLEAN DEFAULT false)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH normalized AS (
    SELECT CASE WHEN p_ignore_trailing_number THEN
      -- Match the ECMAScript whitespace removed by normalizeRosterName.
      lower(regexp_replace(
        coalesce(p_name, '') COLLATE "C",
        U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', '', 'g'
      ) COLLATE "default")
    ELSE lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', '', 'g'))
    END AS name
  )
  SELECT CASE WHEN p_ignore_trailing_number THEN
    coalesce(
      nullif(btrim(name, '0123456789０１２３４５６７８９.。．_-'), ''),
      nullif(regexp_replace(name COLLATE "C", '[0-9０-９]+$', ''), ''),
      name
    )
  ELSE name
  END
  FROM normalized;
$$;
