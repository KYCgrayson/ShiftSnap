-- Daily-note photo attachments. Notes can have 0..N attached images,
-- stored in the note-images bucket and referenced by their public URL
-- in daily_notes.image_urls.
--
-- The path layout is `{user_id}/{filename}`, which lets per-user RLS
-- on storage.objects enforce that each user can only write into their
-- own folder. We give the bucket public read so the app can display
-- thumbnails without juggling signed-URL refresh; UUID filenames make
-- guessing impractical.

ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'note-images',
  'note-images',
  TRUE,
  10485760,                       -- 10MB after compression should be plenty
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Owner-folder INSERT: only the user can upload into their own folder.
DROP POLICY IF EXISTS "note_images_owner_insert" ON storage.objects;
CREATE POLICY "note_images_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'note-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owner-folder DELETE: only the user can remove their own attachments.
DROP POLICY IF EXISTS "note_images_owner_delete" ON storage.objects;
CREATE POLICY "note_images_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'note-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Public SELECT so the app can render the public URL; combined with
-- UUID filenames + nested user-id folders the URLs are unguessable.
DROP POLICY IF EXISTS "note_images_public_read" ON storage.objects;
CREATE POLICY "note_images_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'note-images');
