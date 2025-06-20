-- Debug and Fix Storage Access Issues
-- Run this in Supabase SQL Editor to fix bucket access problems

-- 1. Check if bucket exists
SELECT 'Current Buckets:' as info;
SELECT id, name, public, created_at 
FROM storage.buckets 
ORDER BY created_at DESC;

-- 2. Create bucket if it doesn't exist (with proper settings)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-files',
  'job-files', 
  false,  -- Keep private for security
  10485760,  -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Enable RLS on storage.objects (should already be enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Create comprehensive storage policies
-- Policy for authenticated uploads
CREATE POLICY "Enable upload for job-files bucket" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'job-files' AND 
  auth.role() = 'anon'  -- Allow anonymous uploads for now
);

-- Policy for authenticated downloads  
CREATE POLICY "Enable download for job-files bucket" ON storage.objects
FOR SELECT USING (
  bucket_id = 'job-files' AND
  auth.role() = 'anon'  -- Allow anonymous downloads for now
);

-- Policy for file deletion (cleanup)
CREATE POLICY "Enable delete for job-files bucket" ON storage.objects
FOR DELETE USING (
  bucket_id = 'job-files' AND
  auth.role() = 'anon'  -- Allow anonymous deletes for now
);

-- 5. Grant necessary permissions on storage schema
-- Allow anon to access storage functions
GRANT USAGE ON SCHEMA storage TO anon;
GRANT SELECT ON storage.buckets TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE ON storage.objects TO anon;

-- 6. Test bucket access
SELECT 'Testing bucket access...' as info;
SELECT 
  b.id,
  b.name,
  b.public,
  COUNT(o.id) as file_count
FROM storage.buckets b
LEFT JOIN storage.objects o ON b.id = o.bucket_id
WHERE b.id = 'job-files'
GROUP BY b.id, b.name, b.public;

-- 7. Show current storage policies
SELECT 'Current Storage Policies:' as info;
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

SELECT 'Storage setup complete! 🎉' as result;