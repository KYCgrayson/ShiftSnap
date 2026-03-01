-- Group Foundation Migration
-- Auto-creates a group for each user on signup, adds group_id to persons,
-- updates RLS for group-scoped access, and backfills existing users.

-- ============================================
-- 1. Add group_id to persons
-- ============================================

ALTER TABLE persons ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_persons_group ON persons(group_id);

-- ============================================
-- 2. Add name_on_schedule to shifts (for reference_scan source)
-- ============================================

-- Already exists if reference_scan_and_matching migration ran; safe to skip via IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'name_on_schedule'
  ) THEN
    ALTER TABLE shifts ADD COLUMN name_on_schedule TEXT;
  END IF;
END $$;

-- Add 'reference_scan' to shift_source enum if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'reference_scan' AND enumtypid = 'shift_source'::regtype) THEN
    ALTER TYPE shift_source ADD VALUE 'reference_scan';
  END IF;
END $$;

-- ============================================
-- 3. Update handle_new_user() to auto-create group + membership
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_group_id UUID;
  invite TEXT;
BEGIN
  -- Create user profile
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- Generate a random 6-char invite code
  invite := upper(substr(md5(random()::text), 1, 6));

  -- Auto-create a default group for the user
  INSERT INTO public.groups (id, name, invite_code, created_by)
  VALUES (uuid_generate_v4(), COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)) || '''s Team', invite, NEW.id)
  RETURNING id INTO new_group_id;

  -- Add user as admin of the new group
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Backfill: create groups for existing users without one
-- ============================================

DO $$
DECLARE
  u RECORD;
  new_group_id UUID;
  invite TEXT;
BEGIN
  FOR u IN
    SELECT id, email, display_name FROM public.users
    WHERE NOT EXISTS (
      SELECT 1 FROM public.group_members gm WHERE gm.user_id = users.id
    )
  LOOP
    invite := upper(substr(md5(random()::text || u.id::text), 1, 6));
    new_group_id := uuid_generate_v4();

    INSERT INTO public.groups (id, name, invite_code, created_by)
    VALUES (new_group_id, COALESCE(u.display_name, split_part(u.email, '@', 1)) || '''s Team', invite, u.id);

    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (new_group_id, u.id, 'admin');
  END LOOP;
END $$;

-- ============================================
-- 5. Update persons RLS: allow group member SELECT access
-- ============================================

-- Drop the existing all-in-one policy and replace with separate ones
DROP POLICY IF EXISTS persons_all ON persons;

CREATE POLICY persons_select ON persons
  FOR SELECT USING (
    auth.uid() = owner_id
    OR (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members WHERE group_id = persons.group_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY persons_insert ON persons
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY persons_update ON persons
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY persons_delete ON persons
  FOR DELETE USING (auth.uid() = owner_id);
