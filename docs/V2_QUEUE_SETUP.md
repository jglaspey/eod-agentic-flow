# V2 Queue System Setup Guide

## Overview
The V2 Queue System allows users to submit jobs quickly (<2s) and have them processed in the background. This guide explains how to set it up.

## Prerequisites
- Supabase project with Storage enabled
- Database migrations applied
- Environment variables configured

## Setup Steps

### 1. Run Database Migrations
Execute the following SQL files in your Supabase SQL editor:

```sql
-- First, run the main migration
-- File: v2-queue-schema-migration.sql

-- Then, run the storage policies
-- File: v2-storage-policies.sql
```

### 2. Create Storage Bucket
In your Supabase dashboard:
1. Go to Storage section
2. Create a new bucket named `job-files`
3. Set it as private (not public)
4. Set file size limit to 5MB
5. Allow only PDF mime types

Or run this SQL:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-files', 
  'job-files', 
  false,
  5242880, -- 5MB
  ARRAY['application/pdf']
);
```

### 3. Configure Environment Variables
Add to your `.env.local`:

```bash
# Enable queue mode (set to false for development without storage)
NEXT_PUBLIC_ENABLE_QUEUE_MODE=true

# Ensure these are set correctly
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Apply Storage Policies
The storage policies allow file uploads and downloads. Run the SQL from `v2-storage-policies.sql`.

## Development Without Storage

If you're developing locally without Supabase Storage:

1. Set in `.env.local`:
```bash
NEXT_PUBLIC_ENABLE_QUEUE_MODE=false
```

2. The app will only show Direct Mode (synchronous processing)

## Testing the Queue System

1. **With Queue Mode Enabled**:
   - Upload files with Queue Mode toggle ON
   - Should get immediate response (<2s)
   - Job appears as "Queued" in the dashboard
   - Background processing starts automatically

2. **Direct Mode (Fallback)**:
   - Upload files with Queue Mode toggle OFF
   - Wait ~60s for processing
   - Job appears as "Processing" immediately

## Troubleshooting

### "Storage system not available" Error
1. Check browser console for detailed errors
2. Verify storage bucket exists in Supabase
3. Ensure RLS policies are applied
4. Check environment variables are loaded

### Jobs Stuck in Queue
1. Run maintenance endpoint: `POST /api/jobs/maintenance`
   ```json
   { "operation": "cleanup-stuck" }
   ```
2. Check queue health: `GET /api/jobs/maintenance`

### Local Development Issues
- Set `NEXT_PUBLIC_ENABLE_QUEUE_MODE=false` to bypass storage
- Use Direct Mode for testing without Supabase Storage

## Production Deployment

1. Ensure all migrations are run on production database
2. Create storage bucket with proper policies
3. Set environment variables in your hosting platform
4. Monitor queue health regularly

## API Endpoints

- `POST /api/jobs/create` - Queue mode job creation
- `POST /api/process` - Direct mode (original)
- `GET /api/jobs/maintenance` - Queue health status
- `POST /api/jobs/maintenance` - Run maintenance operations