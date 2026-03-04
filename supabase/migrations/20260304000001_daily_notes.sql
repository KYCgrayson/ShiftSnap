CREATE TABLE daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;

-- 僅自己可見
CREATE POLICY daily_notes_select ON daily_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY daily_notes_insert ON daily_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY daily_notes_update ON daily_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY daily_notes_delete ON daily_notes FOR DELETE USING (auth.uid() = user_id);
