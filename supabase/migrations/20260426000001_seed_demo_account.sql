-- Seed the shared demo account so the in-app "Log in as Demo Account"
-- button and the auto-promote-from-guest invite flow both work without
-- any dashboard configuration. Idempotent: only inserts when missing.
--
-- Credentials are intentionally public and must match DEMO_EMAIL /
-- DEMO_PASSWORD in apps/mobile/src/stores/authStore.ts.

-- Required for crypt()/gen_salt(); already enabled on hosted Supabase.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  demo_email TEXT := 'demo@ishift.app';
  demo_password TEXT := 'DemoIShift2026!';
  demo_user_id UUID;
BEGIN
  -- Skip if the user already exists.
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = demo_email) THEN
    RETURN;
  END IF;

  demo_user_id := gen_random_uuid();

  -- Insert directly into auth.users with a pre-confirmed email so the
  -- account can be signed in immediately. The password is bcrypt-hashed
  -- via crypt(), which Supabase Auth understands.
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    demo_user_id,
    'authenticated',
    'authenticated',
    demo_email,
    crypt(demo_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo User"}'::jsonb,
    FALSE,
    '',
    '',
    '',
    ''
  );

  -- handle_new_user() trigger on auth.users fires on this INSERT and
  -- creates the public.users profile, the default group, and the admin
  -- membership, so we do not need to insert those rows here.
END $$;
