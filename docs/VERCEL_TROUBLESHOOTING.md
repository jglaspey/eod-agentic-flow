# Vercel Deployment Troubleshooting Guide

## Issue: Job completes on backend but frontend hangs on Vercel

### Root Causes Identified

1. **ReadableStream Controller Errors**: The logs API was trying to close an already closed stream controller
2. **Database Replication Lag**: Supabase on Vercel may have replication delays between write and read operations
3. **EventSource Connection Issues**: SSE connections might be less reliable on Vercel's edge network
4. **Missing Error Handling**: The frontend wasn't handling connection failures gracefully

### Fixes Applied

#### 1. Fixed ReadableStream Controller (src/app/api/jobs/[id]/logs/route.ts)
- Added `isClosed` flag to prevent multiple close attempts
- Added proper error handling in the stream
- Added `cancel()` handler for client disconnections

#### 2. Enhanced Database Polling (src/app/results/[id]/page.tsx)
- Increased retry count to 10 for Vercel deployments
- Increased retry delay to 5 seconds for database replication
- Added 2-second delay on first attempt for completed jobs
- Added 3-second delay after job completion signal before fetching data
- Better error handling and user feedback

#### 3. Improved LogTerminal Component (src/components/LogTerminal.tsx)
- Added EventSource connection error handling
- Implemented automatic reconnection on failure
- Added fallback polling mechanism using new `/api/jobs/[id]/status` endpoint
- Visual feedback for connection issues
- Prevents duplicate `onComplete` calls with `completedRef`

#### 4. Backend Improvements (src/app/api/process/route.ts)
- Moved `job-completed` event to finally block to ensure it's always sent
- Added 1-second delay after database update to ensure transaction commits
- Better error logging for database update failures

#### 5. Created Status Endpoint (src/app/api/jobs/[id]/status/route.ts)
- Simple endpoint for polling job status
- Used as fallback when EventSource fails

### Environment Variables Checklist for Vercel

Ensure these are set in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` (if using Anthropic)
- `OPENAI_API_KEY` (if using OpenAI)

### Debugging on Vercel

1. **Check Vercel Function Logs**:
   - Go to Vercel Dashboard → Functions tab
   - Look for errors in `api/process` and `api/jobs/[id]/logs`

2. **Check Browser Console**:
   - Look for EventSource connection errors
   - Check for "Fallback polling" messages
   - Monitor network tab for failed requests

3. **Database Timing Issues**:
   - If job shows completed but no data appears, it's likely replication lag
   - The frontend will retry automatically with the fixes applied

### Additional Recommendations

1. **Consider using Vercel KV or Redis** for real-time status updates instead of relying on Supabase for polling

2. **Add monitoring** with tools like Sentry to track errors in production

3. **Test with Vercel CLI** locally:
   ```bash
   vercel dev
   ```

4. **Enable Vercel Edge Config** for faster configuration updates without redeployment

### Testing the Fixes

1. Deploy to Vercel
2. Upload test files
3. Watch the browser console for:
   - "EventSource connected successfully"
   - "Job completed, waiting for database replication..."
   - Successful data loading after completion

If issues persist, check:
- Supabase connection pooling settings
- Vercel function timeout limits (default 10s for hobby, 60s for pro)
- Browser network throttling or corporate firewalls blocking SSE 