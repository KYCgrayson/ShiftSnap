-- Run in the restricted SQL editor AFTER deploying request-notifications and
-- setting its RESEND_API_KEY, REQUEST_MAIL_FROM and REQUEST_MAIL_WORKER_SECRET.
-- Provision Vault names ishift_request_mail_url and ishift_request_mail_secret
-- privately first. URL is the deployed Edge Function endpoint; secret must equal
-- REQUEST_MAIL_WORKER_SECRET. Never paste either secret into source control.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name IN ('ishift_request_mail_url', 'ishift_request_mail_secret')) <> 2 THEN
    RAISE EXCEPTION 'Configure the two private Vault entries before enabling mail';
  END IF;
END $$;

-- Named schedule replaces the same job instead of duplicating it.
SELECT cron.schedule('ishift-request-notifications', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ishift_request_mail_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-request-mail-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ishift_request_mail_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  WHERE EXISTS (
    SELECT 1 FROM request_mail.outbox
    WHERE (state='pending' AND available_at <= now())
       OR (state='sending' AND lease_until <= now())
  );
$job$);

-- Verify active=true. Inspect cron.job_run_details and net._http_response using
-- timestamps/status codes only; do not expose headers or Vault secrets.
SELECT jobname, schedule, active FROM cron.job
WHERE jobname='ishift-request-notifications';
