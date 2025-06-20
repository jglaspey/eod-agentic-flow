-- Clean up orphaned files in Supabase Storage
-- Run this AFTER deleting job data to remove uploaded files

-- First, see what's in storage
SELECT 
  name,
  bucket_id,
  created_at,
  metadata
FROM storage.objects 
WHERE bucket_id = 'job-files'
ORDER BY created_at DESC
LIMIT 20;

-- Count total files
SELECT 
  bucket_id,
  COUNT(*) as file_count
FROM storage.objects 
WHERE bucket_id = 'job-files'
GROUP BY bucket_id;

-- Delete all files in job-files bucket
-- UNCOMMENT WHEN READY:
/*
DELETE FROM storage.objects 
WHERE bucket_id = 'job-files';
*/

-- Verify cleanup
/*
SELECT 'Storage cleanup complete!' as result;
SELECT COUNT(*) as remaining_files 
FROM storage.objects 
WHERE bucket_id = 'job-files';
*/