# Manual Bucket Setup (Recommended)

Since we're hitting permissions issues with SQL, let's set up the bucket manually:

## Step 1: Create Bucket in UI
1. Go to **Supabase Dashboard > Storage**
2. Click **"New Bucket"**
3. Settings:
   - **Name**: `job-files`
   - **Public**: ❌ **OFF** (keep it private)
   - **File size limit**: `10 MB`
   - **Allowed MIME types**: 
     - `application/pdf`
     - `image/jpeg`
     - `image/png`
     - `text/plain`

## Step 2: Test Storage Access
Try submitting a job in queue mode. The updated `verifyStorageAccess()` function will:
1. Skip the problematic bucket listing
2. Test actual file upload/download
3. Should work if bucket exists

## Step 3: If Still Failing
If you still get errors, the issue might be that the bucket needs to be **public** for anonymous access. Try:

1. **In Supabase Dashboard > Storage > job-files bucket**
2. **Settings > Make Public** ✅
3. Test queue mode again

## Why This Works
- Manual bucket creation bypasses RLS policy issues
- Updated verification function tests actual operations
- Public bucket allows anonymous access (temporary for testing)

## Security Note
Making the bucket public is for testing only. In production, implement proper authentication and make it private again.