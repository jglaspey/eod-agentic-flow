# Storage Setup Instructions

## The Problem
The Vercel logs show "job-files bucket not found" errors despite the bucket existing in Supabase UI. This happens due to Row Level Security (RLS) policies preventing the application from listing/accessing the bucket.

## Quick Fix (Run This First)

1. Open Supabase SQL Editor
2. Run the `debug-storage-fix.sql` script:

```sql
-- This will create the bucket with proper permissions and RLS policies
```

## What the Fix Does

1. **Creates/Updates Bucket**: Ensures `job-files` bucket exists with proper settings
2. **Sets RLS Policies**: Creates policies allowing anonymous access (temporary for testing)
3. **Grants Permissions**: Allows the application to access storage functions
4. **Tests Access**: Verifies the bucket is accessible

## Expected Results

After running the script, you should see:
- ✅ Bucket created/updated successfully  
- ✅ RLS policies applied
- ✅ Storage access test passes
- ✅ Queue mode works without storage errors

## Alternative Manual Steps

If the script doesn't work, manually:

1. **In Supabase Dashboard > Storage**:
   - Ensure `job-files` bucket exists
   - Set it to Private (not Public)
   - File size limit: 10MB
   - Allowed types: PDF, JPG, PNG, TXT

2. **In Supabase SQL Editor**:
   ```sql
   -- Enable anonymous access to storage
   GRANT USAGE ON SCHEMA storage TO anon;
   GRANT SELECT ON storage.buckets TO anon;  
   GRANT INSERT, SELECT, DELETE ON storage.objects TO anon;
   ```

## Verification

Test storage access at: `/api/test-runner`
- Should show successful file upload/download tests
- Queue jobs should process without "bucket not found" errors

## Production Security Note

The current policies allow anonymous access for testing. In production, you should:
1. Implement proper authentication
2. Restrict access to authenticated users only
3. Add proper user-based access controls