-- Storage policies for shift-images bucket (allow anonymous access for testing)

CREATE POLICY "Allow anonymous uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'shift-images');

CREATE POLICY "Allow anonymous reads"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'shift-images');
