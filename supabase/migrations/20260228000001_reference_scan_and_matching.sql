-- Add reference_scan to shift_source enum (if not already present)
DO $$ BEGIN
  ALTER TYPE shift_source ADD VALUE IF NOT EXISTS 'reference_scan';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Add name_on_schedule column to shifts (OCR detected person name, used for matching)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS name_on_schedule TEXT;
CREATE INDEX IF NOT EXISTS idx_shifts_name_on_schedule ON shifts(name_on_schedule);
CREATE INDEX IF NOT EXISTS idx_shifts_source ON shifts(source);
CREATE INDEX IF NOT EXISTS idx_shifts_person_id ON shifts(person_id);

-- Auto-match function: when a user confirms their schedule, look for reference_scan
-- shifts from other users and pair them if the same person name + date matches.
CREATE OR REPLACE FUNCTION auto_match_shifts(
  p_user_id UUID,
  p_year_month TEXT,
  p_person_name TEXT
) RETURNS void AS $$
DECLARE
  ref_shift RECORD;
  self_shift RECORD;
BEGIN
  FOR ref_shift IN
    SELECT s.id, s.user_id, s.date, s.shift_code
    FROM shifts s
    JOIN schedules sc ON s.schedule_id = sc.id
    WHERE s.source = 'reference_scan'
      AND s.user_id != p_user_id
      AND sc.year_month = p_year_month
      AND lower(trim(s.name_on_schedule)) = lower(trim(p_person_name))
      AND s.comparison_status = 'pending'
  LOOP
    SELECT id INTO self_shift
    FROM shifts
    WHERE user_id = p_user_id
      AND date = ref_shift.date
      AND source = 'self_scan'
      AND lower(trim(name_on_schedule)) = lower(trim(p_person_name))
    LIMIT 1;

    IF self_shift IS NOT NULL THEN
      UPDATE shifts SET
        paired_shift_id = self_shift.id,
        comparison_status = CASE
          WHEN shift_code = ref_shift.shift_code THEN 'matched'
          ELSE 'discrepancy'
        END
      WHERE id = ref_shift.id;

      UPDATE shifts SET
        paired_shift_id = ref_shift.id,
        comparison_status = CASE
          WHEN shift_code = (SELECT shift_code FROM shifts WHERE id = ref_shift.id)
          THEN 'matched' ELSE 'discrepancy'
        END
      WHERE id = self_shift.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
