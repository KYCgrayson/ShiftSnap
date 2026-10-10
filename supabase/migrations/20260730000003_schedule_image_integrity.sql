-- Make photo persistence observable. Existing rows are intentionally
-- unverified: their references may be valid, missing, or blocked by old RLS.
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_image_status_check;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_image_status_check
  CHECK (image_status IN ('pending', 'uploaded', 'failed', 'missing', 'unverified'));

-- The caller can inspect only schedule rows already visible through RLS. This
-- view never reads image content; it only compares stored references to object
-- metadata so an administrator can plan a safe repair/backfill.
CREATE OR REPLACE VIEW public.schedule_image_audit
WITH (security_invoker = true) AS
SELECT
  schedule.id AS schedule_id,
  schedule.owner_id,
  schedule.group_id,
  schedule.year_month,
  schedule.image_status,
  schedule.image_url,
  CASE
    WHEN btrim(coalesce(schedule.image_url, '')) = '' THEN 'missing_reference'
    WHEN schedule.image_url ~ '^https?://' THEN 'supabase_or_external_url'
    WHEN schedule.image_url ~ '^[^/]+/.+' THEN 'raw_storage_path'
    ELSE 'invalid_reference'
  END AS reference_kind,
  object.name IS NOT NULL AS storage_object_present,
  object.owner_id AS storage_owner_id
FROM public.schedules AS schedule
LEFT JOIN storage.objects AS object
  ON object.bucket_id = 'shift-images'
  AND (
    object.name = schedule.image_url
    OR right(split_part(schedule.image_url, '?', 1),
      length('/storage/v1/object/sign/shift-images/' || object.name)) =
      '/storage/v1/object/sign/shift-images/' || object.name
    OR right(split_part(schedule.image_url, '?', 1),
      length('/storage/v1/object/public/shift-images/' || object.name)) =
      '/storage/v1/object/public/shift-images/' || object.name
    OR right(split_part(schedule.image_url, '?', 1),
      length('/storage/v1/object/authenticated/shift-images/' || object.name)) =
      '/storage/v1/object/authenticated/shift-images/' || object.name
  );

-- Group membership, not legacy direct sharing, determines cross-account
-- access to roster originals. The uploader still has owner-folder access.
DROP POLICY IF EXISTS "shift_images_schedule_read" ON storage.objects;
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
      -- Historical uploads may not have owner metadata. Their first path
      -- segment remains a safe compatibility proof when it equals the
      -- schedule owner; exact schedule reference and group access are still
      -- required by the surrounding predicates.
      AND (
        storage.objects.owner_id = schedule.owner_id::text
        OR name LIKE schedule.owner_id::text || '/%'
      )
      AND (
        schedule.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_members AS membership
          WHERE membership.group_id = schedule.group_id
            AND membership.user_id = auth.uid()
        )
      )
  )
);

-- Required for moving a verified image after its OCR month is corrected.
DROP POLICY IF EXISTS "shift_images_owner_update" ON storage.objects;
CREATE POLICY "shift_images_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'shift-images' AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'shift-images' AND name LIKE auth.uid()::text || '/%');

DROP POLICY IF EXISTS "shift_images_owner_delete" ON storage.objects;
CREATE POLICY "shift_images_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'shift-images' AND owner_id = auth.uid()::text);
