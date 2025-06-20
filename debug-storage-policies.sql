-- Debug Storage Policies and Bucket Access Issues
-- Run this in your Supabase SQL Editor

-- 1. Check if job-files bucket exists
SELECT 'Checking if job-files bucket exists:' as debug_step;
SELECT id, name, owner, public, avif_autodetection, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id = 'job-files';

-- 2. Check all buckets
SELECT 'All buckets:' as debug_step;
SELECT id, name, owner, public, created_at 
FROM storage.buckets 
ORDER BY created_at DESC;

-- 3. Check RLS policies on storage.buckets
SELECT 'RLS policies on storage.buckets:' as debug_step;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'buckets';

-- 4. Check if RLS is enabled on storage.buckets
SELECT 'RLS status on storage.buckets:' as debug_step;
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'buckets';

-- 5. Check RLS policies on storage.objects
SELECT 'RLS policies on storage.objects:' as debug_step;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- 6. Check objects in job-files bucket (if any)
SELECT 'Objects in job-files bucket:' as debug_step;
SELECT name, bucket_id, owner, created_at, updated_at, last_accessed_at, metadata
FROM storage.objects 
WHERE bucket_id = 'job-files' 
ORDER BY created_at DESC 
LIMIT 10;

-- 7. Attempt to create the bucket manually
SELECT 'Attempting to create job-files bucket manually:' as debug_step;
INSERT INTO storage.buckets (id, name, owner, public, avif_autodetection, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'job-files',
  'job-files', 
  (SELECT auth.uid()),
  false,
  false,
  5242880, -- 5MB
  ARRAY['application/pdf'::text],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 8. Verify the bucket was created
SELECT 'Bucket after creation attempt:' as debug_step;
SELECT id, name, owner, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id = 'job-files';

-- 9. Create storage policies if they don't exist
SELECT 'Creating storage policies:' as debug_step;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow uploads to job-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow downloads from job-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to job-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from job-files" ON storage.objects;

-- Create new policies
CREATE POLICY "Allow uploads to job-files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'job-files');

CREATE POLICY "Allow downloads from job-files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'job-files');

CREATE POLICY "Allow updates to job-files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'job-files');

CREATE POLICY "Allow deletes from job-files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'job-files');

-- 10. Final verification
SELECT 'Final bucket check:' as debug_step;
SELECT id, name, owner, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id = 'job-files';

SELECT 'Storage policies verification:' as debug_step;
SELECT policyname, cmd, roles
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%job-files%';