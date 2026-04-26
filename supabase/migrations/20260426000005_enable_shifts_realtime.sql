-- Supabase only broadcasts realtime postgres_changes for tables
-- explicitly added to the supabase_realtime publication. Without this
-- the in-app banner never fires for cross-device shift edits because
-- the subscriber side gets nothing from the server even though the
-- UPDATE itself succeeded.
--
-- Also set REPLICA IDENTITY FULL so UPDATE / DELETE payloads include
-- the full pre-image of the row, which the notification handler reads
-- (user_id, date) to format the banner.

ALTER TABLE public.shifts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts';
  END IF;
END $$;
