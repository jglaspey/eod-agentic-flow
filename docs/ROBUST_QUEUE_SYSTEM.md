# Robust Queue System Architecture

## Overview

This document describes the production-ready queue system that eliminates hardcoded URLs and provides multiple layers of reliability. The system uses **Option 1 (Dynamic URL Detection) with Option 2 (Cron Backup)** for maximum robustness.

## Architecture Components

### 1. Dynamic URL Detection (`src/lib/url-utils.ts`)

**Problem Solved**: No more hardcoded URLs that break across environments.

**How it Works**:
- Automatically detects current deployment URL using Vercel environment variables
- Falls back to request headers if environment variables unavailable
- Works seamlessly across development, preview, and production environments

**Priority Order**:
1. `VERCEL_PROJECT_PRODUCTION_URL` (custom domain if available)
2. `VERCEL_URL` (current deployment URL)
3. `VERCEL_BRANCH_URL` (branch-specific URL)
4. Request headers (`host` + protocol)
5. Development fallback (`localhost:3000`)

**Key Functions**:
- `getDeploymentUrl(request?)` - Get current environment URL
- `createApiUrl(path, request?)` - Create absolute API URLs
- `triggerInternalApi(path, request?)` - Fire-and-forget API calls

### 2. Primary Processing (HTTP Triggering)

**How Queue Processing Works**:
1. Job uploaded → Files saved to storage → Job queued
2. `startRunnerIfNeeded()` checks if processing needed
3. Uses `triggerInternalApi('/api/queue/process')` to start processing
4. Each job processes in separate function (avoids timeouts)
5. Successful jobs trigger next job processing
6. Chain continues until queue empty

**Endpoints**:
- `/api/queue/process` - Process single job, chain to next
- `/api/queue/trigger` - Manual trigger for stuck jobs

### 3. Backup Processing (Cron Jobs)

**Vercel Cron Configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/queue/cron",
      "schedule": "* * * * *"
    }
  ]
}
```

**Backup System** (`/api/queue/cron`):
- Runs every minute as safety net
- Cleans up stuck jobs (processing > 5 minutes)
- Triggers processing for jobs waiting > 2 minutes
- Provides queue health monitoring
- Logs statistics for debugging

### 4. Safety Mechanisms

**Multiple Layers of Protection**:
1. **Rate Limiting**: Max 10 jobs per user
2. **Timeout Protection**: Each job gets fresh function instance
3. **Stuck Job Cleanup**: Cron job resets ancient processing jobs
4. **Failure Recovery**: Failed jobs don't block queue
5. **Chain Recovery**: Processing continues even after failures

**Monitoring & Debugging**:
- Queue status endpoints show real-time state
- Comprehensive logging with timestamps
- Health statistics logged every minute
- Environment info available for debugging

## Zero Configuration Setup

**What's Required**: Nothing! The system auto-configures.

**What's NOT Required**:
- ❌ Hardcoded URLs
- ❌ Manual environment variables
- ❌ Branch-specific configuration
- ❌ Complex deployment setup

**Automatic Features**:
- ✅ Works in development, preview, production
- ✅ Handles custom domains automatically
- ✅ Self-healing queue processing
- ✅ Environment-aware URL detection

## Usage Examples

### Basic Queue Operation
```typescript
// Jobs automatically queue and process
const result = await enqueueJob({
  estimateFile: file1,
  roofReportFile: file2,
  userId: 'user123'
});

// No manual triggers needed - processing starts automatically
```

### Manual Queue Management
```typescript
// Check queue status
const status = await getQueueStatus();

// Manually trigger if needed (rare)
await triggerInternalApi('/api/queue/process');

// Clean up stuck jobs
const cleaned = await cleanupStuckJobs();
```

### Environment Detection
```typescript
// Get current deployment URL (works everywhere)
const url = getDeploymentUrl(request);

// Create API URLs dynamically
const apiUrl = createApiUrl('/api/queue/status');

// Get environment info
const info = getEnvironmentInfo();
```

## Deployment Instructions

### 1. Enable Vercel Cron Jobs
- Cron jobs are automatically enabled with `vercel.json`
- No additional configuration required
- Free tier: 1 cron job (sufficient for our needs)

### 2. Enable Vercel Environment Variables (Optional)
In Vercel Dashboard:
1. Go to Project Settings → Environment Variables
2. Check "Automatically expose System Environment Variables"
3. This provides `VERCEL_URL`, `VERCEL_ENV`, etc.

**Note**: The system works without this - it's just extra reliability.

### 3. Deploy and Test
```bash
git push origin queue-mode  # Deploy to Vercel
```

**Testing**:
1. Submit job in queue mode
2. Should process automatically within seconds
3. If stuck, visit `/api/queue/trigger`
4. Check `/api/queue/cron` for health status

## Troubleshooting

### Queue Not Processing
1. **Check** `/api/queue/trigger` - manual trigger
2. **Check** `/api/queue/cron` - backup system status
3. **Check** Vercel function logs for errors
4. **Verify** storage bucket permissions

### Jobs Stuck in Processing
- Cron job automatically cleans up after 5 minutes
- Check function timeout limits in Vercel
- Verify file downloads from storage work

### Environment Issues
```typescript
// Debug current environment
const info = getEnvironmentInfo();
console.log('Environment info:', info);

// Test URL detection
const url = getDeploymentUrl();
console.log('Detected URL:', url);
```

## Performance Characteristics

**Response Times**:
- Job creation: <2 seconds (immediate queue)
- Processing start: <10 seconds (HTTP trigger)
- Backup trigger: <60 seconds (cron job)

**Reliability**:
- Primary: HTTP triggering (immediate)
- Backup: Cron monitoring (every minute)
- Recovery: Stuck job cleanup (5 minute timeout)

**Scalability**:
- Each job: Independent function instance
- No shared state or memory leaks
- Handles concurrent jobs efficiently
- Rate limiting prevents abuse

## Migration from Old System

**Removed**:
- `NEXT_PUBLIC_APP_URL` environment variable
- Hardcoded fallback URLs
- Branch-specific configuration

**Added**:
- Dynamic URL detection
- Cron job backup system
- Comprehensive monitoring
- Zero-configuration setup

**Benefits**:
- Works across all environments without changes
- Self-healing and reliable
- Better monitoring and debugging
- Production-ready architecture