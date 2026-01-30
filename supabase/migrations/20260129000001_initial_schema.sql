-- ShiftSnap Initial Database Schema
-- Version: 1.0.0
-- Date: January 2026

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE share_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE group_role AS ENUM ('member', 'site_manager', 'admin');
CREATE TYPE schedule_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE shift_source AS ENUM ('self_scan', 'manager_distributed');
CREATE TYPE comparison_status AS ENUM ('pending', 'matched', 'discrepancy', 'resolved');

-- ============================================
-- TABLES
-- ============================================

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    locale TEXT DEFAULT 'en' CHECK (locale IN ('en', 'zh-TW', 'zh-CN', 'ja')),
    timezone TEXT DEFAULT 'Asia/Taipei',
    default_alarm_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Persons table (multi-person support)
CREATE TABLE persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4A9DAD',
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Schedule sharing
CREATE TABLE schedule_sharing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT UNIQUE NOT NULL,
    invite_url TEXT,
    status share_status DEFAULT 'pending' NOT NULL,
    color TEXT,
    nickname TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Groups
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Group members
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role group_role DEFAULT 'member' NOT NULL,
    nickname TEXT,
    color TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(group_id, user_id)
);

-- Schedules
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    year_month TEXT NOT NULL, -- Format: 2026-02
    raw_ocr_result JSONB,
    status schedule_status DEFAULT 'draft' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Shifts
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    shift_code TEXT NOT NULL,
    start_time TIME,
    end_time TIME,
    is_day_off BOOLEAN DEFAULT FALSE,
    source shift_source DEFAULT 'self_scan' NOT NULL,
    comparison_status comparison_status DEFAULT 'pending',
    paired_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    calendar_event_id TEXT,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Shift codes
CREATE TABLE shift_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    person_id UUID REFERENCES persons(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    meaning TEXT NOT NULL,
    start_time TIME,
    end_time TIME,
    is_day_off BOOLEAN DEFAULT FALSE,
    is_confirmed BOOLEAN DEFAULT FALSE,
    is_group_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Unique constraint: one code per user (optionally scoped to person or group)
    UNIQUE(user_id, code, COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_persons_owner ON persons(owner_id);
CREATE INDEX idx_schedule_sharing_from ON schedule_sharing(from_user_id);
CREATE INDEX idx_schedule_sharing_to ON schedule_sharing(to_user_id);
CREATE INDEX idx_schedule_sharing_code ON schedule_sharing(invite_code);
CREATE INDEX idx_groups_invite ON groups(invite_code);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_schedules_owner ON schedules(owner_id);
CREATE INDEX idx_schedules_year_month ON schedules(year_month);
CREATE INDEX idx_shifts_schedule ON shifts(schedule_id);
CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shift_codes_user ON shift_codes(user_id);
CREATE INDEX idx_shift_codes_code ON shift_codes(code);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_persons_updated_at
    BEFORE UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_shift_codes_updated_at
    BEFORE UPDATE ON shift_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_codes ENABLE ROW LEVEL SECURITY;

-- Users: only own record
CREATE POLICY users_select ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update ON users
    FOR UPDATE USING (auth.uid() = id);

-- Persons: only owner can access
CREATE POLICY persons_all ON persons
    FOR ALL USING (auth.uid() = owner_id);

-- Schedule sharing: from_user or to_user can access
CREATE POLICY schedule_sharing_select ON schedule_sharing
    FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY schedule_sharing_insert ON schedule_sharing
    FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY schedule_sharing_update ON schedule_sharing
    FOR UPDATE USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY schedule_sharing_delete ON schedule_sharing
    FOR DELETE USING (auth.uid() = from_user_id);

-- Groups: members only
CREATE POLICY groups_select ON groups
    FOR SELECT USING (
        auth.uid() = created_by OR
        EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
    );

CREATE POLICY groups_insert ON groups
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY groups_update ON groups
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role IN ('admin', 'site_manager'))
    );

CREATE POLICY groups_delete ON groups
    FOR DELETE USING (auth.uid() = created_by);

-- Group members: group members can view, admins can manage
CREATE POLICY group_members_select ON group_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
    );

CREATE POLICY group_members_insert ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

CREATE POLICY group_members_update ON group_members
    FOR UPDATE USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

CREATE POLICY group_members_delete ON group_members
    FOR DELETE USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

-- Schedules: owner or shared with
CREATE POLICY schedules_select ON schedules
    FOR SELECT USING (
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM schedule_sharing WHERE from_user_id = schedules.owner_id AND to_user_id = auth.uid() AND status = 'accepted') OR
        EXISTS (SELECT 1 FROM group_members WHERE group_id = schedules.group_id AND user_id = auth.uid())
    );

CREATE POLICY schedules_insert ON schedules
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY schedules_update ON schedules
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY schedules_delete ON schedules
    FOR DELETE USING (auth.uid() = owner_id);

-- Shifts: own, shared, or group member
CREATE POLICY shifts_select ON shifts
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM schedule_sharing WHERE from_user_id = shifts.user_id AND to_user_id = auth.uid() AND status = 'accepted') OR
        EXISTS (SELECT 1 FROM schedules s JOIN group_members gm ON s.group_id = gm.group_id WHERE s.id = shifts.schedule_id AND gm.user_id = auth.uid())
    );

CREATE POLICY shifts_insert ON shifts
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM schedules s JOIN group_members gm ON s.group_id = gm.group_id WHERE s.id = shifts.schedule_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

CREATE POLICY shifts_update ON shifts
    FOR UPDATE USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM schedules s JOIN group_members gm ON s.group_id = gm.group_id WHERE s.id = shifts.schedule_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

CREATE POLICY shifts_delete ON shifts
    FOR DELETE USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM schedules s JOIN group_members gm ON s.group_id = gm.group_id WHERE s.id = shifts.schedule_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'site_manager'))
    );

-- Shift codes: own or group shared
CREATE POLICY shift_codes_select ON shift_codes
    FOR SELECT USING (
        auth.uid() = user_id OR
        (is_group_shared = TRUE AND EXISTS (SELECT 1 FROM group_members WHERE group_id = shift_codes.group_id AND user_id = auth.uid()))
    );

CREATE POLICY shift_codes_insert ON shift_codes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY shift_codes_update ON shift_codes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY shift_codes_delete ON shift_codes
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Create storage buckets (run via Supabase dashboard or CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('schedule-images', 'schedule-images', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies will be set up via Supabase dashboard
