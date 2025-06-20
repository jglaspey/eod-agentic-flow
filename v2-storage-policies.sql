-- Storage Policies for job-files bucket
-- Run this in your Supabase SQL editor after creating the bucket

-- First, check if bucket exists
SELECT * FROM storage.buckets WHERE id = 'job-files';

-- Create RLS policies for the job-files bucket
-- These policies allow authenticated and anonymous access for development

-- Policy for uploading files
CREATE POLICY "Allow uploads to job-files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'job-files');

-- Policy for downloading files
CREATE POLICY "Allow downloads from job-files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'job-files');

-- Policy for updating files (for upsert)
CREATE POLICY "Allow updates to job-files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'job-files');

-- Policy for deleting files (for cleanup)
CREATE POLICY "Allow deletes from job-files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'job-files');

-- If the above policies are too open, you can use these more restrictive versions:
-- (Comment out the above and uncomment below)

/*
-- Only allow authenticated users
CREATE POLICY "Authenticated users can upload to job-files" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'job-files');

CREATE POLICY "Authenticated users can download from job-files" 
ON storage.objects 
FOR SELECT 
TO authenticated
USING (bucket_id = 'job-files');

CREATE POLICY "Authenticated users can update job-files" 
ON storage.objects 
FOR UPDATE 
TO authenticated
USING (bucket_id = 'job-files');

CREATE POLICY "Authenticated users can delete from job-files" 
ON storage.objects 
FOR DELETE 
TO authenticated
USING (bucket_id = 'job-files');
*/

-- Verify policies are created
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';