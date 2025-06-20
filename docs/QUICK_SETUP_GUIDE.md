# Quick Setup Guide - Robust Queue System

## What Changed

✅ **Fixed**: No more hardcoded URLs that break across environments  
✅ **Fixed**: Queue auto-starts without manual triggers  
✅ **Added**: Cron job backup system for reliability  
✅ **Added**: Zero-configuration setup  

## New Architecture

**Option 1 (Primary)**: Dynamic URL detection using Vercel environment variables + request headers  
**Option 2 (Backup)**: Cron job runs every minute to catch stuck jobs  

## Setup Instructions

### 1. Deploy the Changes
```bash
# Changes are already committed to queue-mode branch
git push origin queue-mode
```

Vercel will automatically deploy with the new queue system.

### 2. Storage Setup (If Not Done)
If you haven't set up storage bucket permissions yet:
1. Go to Supabase Dashboard → Storage → job-files bucket
2. Make sure the bucket has policies allowing anonymous access
3. See `/docs/manual-bucket-setup.md` for detailed instructions

### 3. Test the System
1. **Submit a job** in queue mode
2. **Should process automatically** within 10 seconds
3. **If stuck**, visit `/api/queue/trigger` to manually trigger
4. **Monitor health** at `/api/queue/cron`

## What You Don't Need Anymore

❌ **No more** `NEXT_PUBLIC_APP_URL` environment variable  
❌ **No more** hardcoded URLs  
❌ **No more** branch-specific configuration  
❌ **No more** manual triggers (usually)  

## How It Works Now

### Primary Processing (Option 1)
1. Job submitted → Queued in database
2. System detects current URL automatically
3. Triggers `/api/queue/process` via HTTP
4. Each job processes in fresh function instance
5. Automatically chains to next job if any exist

### Backup Processing (Option 2)
1. Cron job runs every minute
2. Checks for jobs waiting > 2 minutes
3. Cleans up stuck jobs (> 5 minutes in processing)
4. Triggers processing if primary system failed
5. Logs health statistics

## Monitoring Endpoints

- `/api/queue/trigger` - Manual trigger + status
- `/api/queue/cron` - Backup system health
- `/api/test-runner` - Legacy status check

## Environment Detection

The system automatically detects:
- **Development**: `localhost:3000`
- **Preview**: `your-app-git-branch-user.vercel.app`
- **Production**: `your-custom-domain.com` or `your-app.vercel.app`

No configuration needed!

## Troubleshooting

### Jobs Not Processing
1. Check storage bucket permissions (most common issue)
2. Visit `/api/queue/trigger` to manually start
3. Check Vercel function logs for errors
4. Wait up to 1 minute for cron backup to kick in

### Want to See What's Happening
```bash
# Check queue status
curl https://your-app.vercel.app/api/queue/trigger

# Check cron health
curl https://your-app.vercel.app/api/queue/cron

# Check environment detection
# (Add debug endpoint if needed)
```

## Documentation

All documentation is now organized in `/docs/`:
- `ROBUST_QUEUE_SYSTEM.md` - Complete architecture details
- `manual-bucket-setup.md` - Storage setup guide
- `QUEUE_FIXES.md` - Previous troubleshooting (legacy)
- And more...

## Success Metrics

You'll know it's working when:
- ✅ Jobs submit in <2 seconds
- ✅ Processing starts automatically within 10 seconds
- ✅ No manual triggers needed
- ✅ Works consistently across environments
- ✅ Cron job shows healthy status every minute

The system is now production-ready and self-healing! 🎉