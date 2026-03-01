-- Fix storage policies: replace anonymous access with authenticated-only

-- Drop anonymous policies
DROP POLICY IF EXISTS "Allow anonymous uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous reads" ON storage.objects;

-- Create authenticated-only policies for shift-images bucket
CREATE POLICY "Authenticated users can upload shift images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shift-images');

CREATE POLICY "Authenticated users can read shift images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'shift-images');

CREATE POLICY "Authenticated users can delete own shift images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'shift-images' AND (storage.foldername(name))[1] = auth.uid()::text);
