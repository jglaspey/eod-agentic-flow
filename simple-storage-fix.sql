-- Simple Storage Fix (No Admin Rights Required)
-- Run this in Supabase SQL Editor to fix bucket access

-- 1. Just check if bucket exists first
SELECT 'Current bucket status:' as info;
SELECT id, name, public, created_at 
FROM storage.buckets 
WHERE id = 'job-files';

-- 2. If no results above, the bucket doesn't exist. Create it:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-files',
  'job-files', 
  false,
  10485760,  -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Create basic storage policies (these should work without admin rights)
-- Policy for uploads
CREATE POLICY "Allow job file uploads" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'job-files' 
);

-- Policy for downloads
CREATE POLICY "Allow job file downloads" ON storage.objects
FOR SELECT USING (
  bucket_id = 'job-files'
);

-- Policy for deletes (cleanup)
CREATE POLICY "Allow job file deletes" ON storage.objects
FOR DELETE USING (
  bucket_id = 'job-files'
);

-- 4. Verify setup
SELECT 'Setup verification:' as info;
SELECT 
  b.id as bucket_id,
  b.name,
  b.public,
  COUNT(o.id) as file_count
FROM storage.buckets b
LEFT JOIN storage.objects o ON b.id = o.bucket_id
WHERE b.id = 'job-files'
GROUP BY b.id, b.name, b.public;

-- 5. Show policies created
SELECT 'Storage policies:' as info;
SELECT policyname, cmd, roles
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'
AND policyname LIKE '%job%';

SELECT 'Simple storage setup complete!' as result;