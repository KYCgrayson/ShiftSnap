-- If the demo account exists but its email was never confirmed (e.g. it
-- was created by an in-app first-run signup before the seed migration
-- ran), confirm it now so signInWithEmail succeeds.
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email = 'demo@ishift.app'
  AND email_confirmed_at IS NULL;
