-- Replace OCR-extracted shifts in one transaction. The schedule owner is the
-- only caller allowed to replace an upload; group targets must remain members
-- of that schedule's group. The caller cannot supply shift IDs or schedule IDs
-- inside the JSON payload.
-- These group_members RLS helpers are invoked while this RPC has an empty
-- search path. Harden the legacy SECURITY DEFINER helpers so they resolve
-- their table safely and do not inherit a caller-controlled path.
CREATE OR REPLACE FUNCTION public.get_user_group_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
  SELECT membership.group_id
  FROM public.group_members AS membership
  WHERE membership.user_id = uid;
$function$;

CREATE OR REPLACE FUNCTION public.is_group_admin(uid UUID, gid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS membership
    WHERE membership.user_id = uid
      AND membership.group_id = gid
      AND membership.role IN ('admin', 'site_manager')
  );
$function$;

CREATE OR REPLACE FUNCTION public.replace_schedule_shifts(
  p_schedule_id UUID,
  p_year_month TEXT,
  p_shifts JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_schedule public.schedules%ROWTYPE;
  v_date_text TEXT;
  v_user_id UUID;
  v_person_id UUID;
  v_shift_code TEXT;
  v_start_time TEXT;
  v_end_time TEXT;
  v_is_day_off BOOLEAN;
  v_source TEXT;
  v_name_on_schedule TEXT;
  v_shift_date DATE;
  v_target_user_ids UUID[] := ARRAY[auth.uid()]::UUID[];
  v_row_count INTEGER := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Schedule ID is required' USING ERRCODE = '22023';
  END IF;

  IF p_year_month IS NULL
    OR p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
    OR to_char(to_date(p_year_month || '-01', 'YYYY-MM-DD'), 'YYYY-MM') <> p_year_month
  THEN
    RAISE EXCEPTION 'Invalid schedule month' USING ERRCODE = '22023';
  END IF;

  IF p_shifts IS NULL OR jsonb_typeof(p_shifts) <> 'array' OR jsonb_array_length(p_shifts) = 0 THEN
    RAISE EXCEPTION 'At least one valid shift is required' USING ERRCODE = '22023';
  END IF;

  SELECT schedule.*
  INTO v_schedule
  FROM public.schedules AS schedule
  WHERE schedule.id = p_schedule_id
    AND schedule.owner_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found or caller is not its owner' USING ERRCODE = '42501';
  END IF;

  IF v_schedule.group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.group_members AS membership
    WHERE membership.group_id = v_schedule.group_id
      AND membership.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Caller is no longer a member of the schedule group' USING ERRCODE = '42501';
  END IF;

  -- Serialize different uploads that replace overlapping users in the same
  -- uploader/group/month. The schedule row lock above serializes retries of
  -- this exact upload; this advisory lock covers older sibling uploads.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_caller::TEXT || ':' || coalesce(v_schedule.group_id::TEXT, 'ungrouped') || ':' || p_year_month,
    0
  ));

  -- Validate every row before deleting anything. All JSON casts, date checks,
  -- and membership checks happen before destructive statements; a later
  -- database error still rolls the entire function call back atomically.
  FOR v_date_text, v_user_id, v_person_id, v_shift_code, v_start_time, v_end_time, v_is_day_off, v_source, v_name_on_schedule
  IN
    SELECT row_data.date, row_data.user_id, row_data.person_id,
           row_data.shift_code, row_data.start_time, row_data.end_time,
           row_data.is_day_off, row_data.source, row_data.name_on_schedule
    FROM jsonb_to_recordset(p_shifts) AS row_data(
      date TEXT,
      user_id UUID,
      person_id UUID,
      shift_code TEXT,
      start_time TEXT,
      end_time TEXT,
      is_day_off BOOLEAN,
      source TEXT,
      name_on_schedule TEXT
    )
  LOOP
    v_row_count := v_row_count + 1;

    IF v_date_text IS NULL OR v_date_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Invalid shift date' USING ERRCODE = '22023';
    END IF;
    v_shift_date := v_date_text::DATE;
    IF to_char(v_shift_date, 'YYYY-MM-DD') <> v_date_text
      OR to_char(v_shift_date, 'YYYY-MM') <> p_year_month
    THEN
      RAISE EXCEPTION 'Shift date must be a valid date in the selected month' USING ERRCODE = '22023';
    END IF;

    IF v_user_id IS NULL OR (v_user_id <> v_caller AND NOT EXISTS (
      SELECT 1
      FROM public.group_members AS target_member
      JOIN public.group_members AS caller_member
        ON caller_member.group_id = target_member.group_id
       AND caller_member.user_id = v_caller
      WHERE v_schedule.group_id IS NOT NULL
        AND target_member.group_id = v_schedule.group_id
        AND target_member.user_id = v_user_id
    )) THEN
      RAISE EXCEPTION 'Shift target must be the caller or a current member of this group' USING ERRCODE = '42501';
    END IF;

    IF v_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.persons AS person
      WHERE person.id = v_person_id
        AND (
          (v_schedule.group_id IS NOT NULL AND person.group_id = v_schedule.group_id)
          OR (v_schedule.group_id IS NULL AND person.group_id IS NULL AND person.owner_id = v_caller)
        )
    ) THEN
      RAISE EXCEPTION 'Person does not belong to this schedule scope' USING ERRCODE = '42501';
    END IF;

    IF nullif(btrim(v_shift_code), '') IS NULL THEN
      RAISE EXCEPTION 'Shift code is required' USING ERRCODE = '22023';
    END IF;
    IF v_source IS NULL OR v_source NOT IN ('self_scan', 'reference_scan') THEN
      RAISE EXCEPTION 'Invalid OCR shift source' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(v_start_time), '') IS NOT NULL THEN
      PERFORM v_start_time::TIME;
    END IF;
    IF nullif(btrim(v_end_time), '') IS NOT NULL THEN
      PERFORM v_end_time::TIME;
    END IF;

    IF NOT (v_user_id = ANY(v_target_user_ids)) THEN
      v_target_user_ids := array_append(v_target_user_ids, v_user_id);
    END IF;
  END LOOP;

  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'At least one valid shift is required' USING ERRCODE = '22023';
  END IF;

  -- Remove all prior rows attached to the upload being corrected, then only
  -- the uploader's own same-scope/month rows for users represented in this
  -- replacement. Never remove a sibling upload from another owner or group.
  DELETE FROM public.shifts AS old_shift
  WHERE old_shift.schedule_id = p_schedule_id;

  DELETE FROM public.shifts AS old_shift
  USING public.schedules AS old_schedule
  WHERE old_schedule.id = old_shift.schedule_id
    AND old_schedule.id <> p_schedule_id
    AND old_schedule.owner_id = v_caller
    AND old_schedule.group_id IS NOT DISTINCT FROM v_schedule.group_id
    AND old_schedule.year_month = p_year_month
    AND old_shift.date >= (p_year_month || '-01')::DATE
    AND old_shift.date < ((p_year_month || '-01')::DATE + INTERVAL '1 month')::DATE
    AND old_shift.user_id = ANY(v_target_user_ids);

  UPDATE public.schedules
  SET year_month = p_year_month,
      updated_at = now()
  WHERE id = p_schedule_id
    AND owner_id = v_caller;

  INSERT INTO public.shifts (
    schedule_id, user_id, person_id, date, shift_code, start_time, end_time,
    is_day_off, source, name_on_schedule, comparison_status
  )
  SELECT p_schedule_id,
         row_data.user_id,
         row_data.person_id,
         row_data.date::DATE,
         btrim(row_data.shift_code),
         nullif(btrim(row_data.start_time), '')::TIME,
         nullif(btrim(row_data.end_time), '')::TIME,
         coalesce(row_data.is_day_off, FALSE),
         row_data.source::public.shift_source,
         nullif(btrim(row_data.name_on_schedule), ''),
         'pending'::public.comparison_status
  FROM jsonb_to_recordset(p_shifts) AS row_data(
    date TEXT,
    user_id UUID,
    person_id UUID,
    shift_code TEXT,
    start_time TEXT,
    end_time TEXT,
    is_day_off BOOLEAN,
    source TEXT,
    name_on_schedule TEXT
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_schedule_shifts(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_schedule_shifts(UUID, TEXT, JSONB) TO authenticated;
