-- Shift roster images are private records.  Access to an object is granted
-- only through a schedule row that the current user may view.

UPDATE storage.buckets
SET public = FALSE
WHERE id = 'shift-images';

-- Remove the historical bucket-wide policies before replacing them with
-- owner-folder uploads and schedule-bound reads.
DROP POLICY IF EXISTS "Allow anonymous uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous reads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shift images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read shift images" ON storage.objects;
DROP POLICY IF EXISTS "shift_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "shift_images_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "shift_images_schedule_read" ON storage.objects;

CREATE POLICY "shift_images_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shift-images'
  AND name LIKE auth.uid()::text || '/%'
);

-- Upload requests use INSERT ... RETURNING, so permit the uploader to read
-- only their freshly uploaded, owner-prefixed objects before a schedule exists.
CREATE POLICY "shift_images_owner_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shift-images'
  AND owner_id = auth.uid()::text
  AND name LIKE auth.uid()::text || '/%'
);

-- This covers raw paths and historical Supabase URLs. The object owner must
-- match the schedule owner so a user cannot forge a schedule reference to
-- another user's guessed object path.
CREATE POLICY "shift_images_schedule_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shift-images'
  AND EXISTS (
    SELECT 1
    FROM public.schedules AS schedule
    WHERE (
        schedule.image_url = name
        OR right(split_part(schedule.image_url, '?', 1),
          length('/storage/v1/object/sign/shift-images/' || name)) =
          '/storage/v1/object/sign/shift-images/' || name
        OR right(split_part(schedule.image_url, '?', 1),
          length('/storage/v1/object/public/shift-images/' || name)) =
          '/storage/v1/object/public/shift-images/' || name
        OR right(split_part(schedule.image_url, '?', 1),
          length('/storage/v1/object/authenticated/shift-images/' || name)) =
          '/storage/v1/object/authenticated/shift-images/' || name
      )
      AND storage.objects.owner_id = schedule.owner_id::text
      AND (
        schedule.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.schedule_sharing AS sharing
          WHERE sharing.from_user_id = schedule.owner_id
            AND sharing.to_user_id = auth.uid()
            AND sharing.status = 'accepted'
        )
        OR EXISTS (
          SELECT 1
          FROM public.group_members AS membership
          WHERE membership.group_id = schedule.group_id
            AND membership.user_id = auth.uid()
        )
      )
  )
);
