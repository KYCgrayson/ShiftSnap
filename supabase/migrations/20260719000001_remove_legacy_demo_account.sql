-- Remove the legacy shared demo identity. Dependent public records cascade
-- through public.users when the auth identity is deleted.
DELETE FROM auth.users
WHERE email = 'demo@ishift.app';
