# Queue System Fixes

## Issues Fixed

### 1. Queue Runner Not Auto-Starting
**Problem**: Jobs stayed in "queued" status until manually triggering `/api/test-runner`
**Cause**: `setImmediate()` doesn't work in Vercel's serverless environment - the function terminates before the runner starts
**Fix**: Replace with HTTP trigger to `/api/queue/process`

### 2. Jobs Stuck in Processing
**Problem**: Jobs stay in "processing" forever even though work is happening
**Cause**: Vercel functions timeout (10-60 seconds) but job takes longer
**Fix**: Process one job at a time, chain processing via HTTP calls

## New Endpoints

- `/api/queue/process` - Processes a single job (auto-chains if more jobs exist)
- `/api/queue/trigger` - Manually trigger queue processing

## Required Setup

1. **Add Environment Variable in Vercel**:
   ```
   NEXT_PUBLIC_APP_URL=https://eod-agentic-flow-queue-mode.vercel.app
   ```
   (Replace with your actual deployment URL)

2. **For stuck jobs**, visit:
   - `/api/queue/trigger` - Starts processing
   - `/api/test-runner` - Shows queue status

## How It Works Now

1. Job uploaded → Files saved to storage → Job queued
2. Queue system triggers `/api/queue/process` via HTTP
3. Process ONE job (avoids timeout)
4. If more jobs exist, trigger next processing round
5. Chain continues until queue is empty

## Testing

1. Upload a job in queue mode
2. Job should automatically start processing within seconds
3. Check `/api/queue/trigger` if it doesn't start
4. Monitor progress on the results page

## Important Notes

- Each job processes in its own function invocation (no timeouts)
- Processing chains automatically via HTTP calls
- Manual trigger available as backup
- Storage must be properly configured (bucket permissions)