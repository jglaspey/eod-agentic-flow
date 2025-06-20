# Queue Processing Solution for Vercel + Supabase

## The Problem
- Vercel serverless functions can't trigger each other due to SSO authentication
- Cron jobs don't work reliably on Vercel
- Fire-and-forget patterns fail in serverless environments
- Jobs get stuck in "queued" status with no processing

## The Solution: Supabase Database Webhooks

### Step 1: Set up Supabase Database Webhook

1. Go to your Supabase Dashboard
2. Navigate to **Database → Webhooks**
3. Create a new webhook with these settings:

```
Name: process-queue-on-job-change
Table: jobs
Events: INSERT, UPDATE
Method: POST
URL: [We'll create a special endpoint - see below]
Headers: 
  Content-Type: application/json
  X-Webhook-Secret: [generate a secret key]
```

### Step 2: Create a Webhook Handler Endpoint

This endpoint will be triggered by Supabase whenever a job is created or updated:

```typescript
// src/app/api/webhook/process-queue/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Verify webhook signature
  const signature = headers().get('x-supabase-signature');
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!verifySignature(await request.text(), signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const payload = await request.json();
  
  // Only process if job was just created or moved to queued
  if (payload.type === 'INSERT' || 
      (payload.type === 'UPDATE' && payload.record.status === 'queued')) {
    
    // Check if any jobs are currently processing
    const { getQueueStatus } = await import('@/lib/queue');
    const status = await getQueueStatus();
    
    if (status.processingJobs === 0) {
      // Start processing by calling your internal processing function
      const { claimNextJob, processJob, markJobCompleted, markJobFailed } = await import('@/lib/queue');
      
      const job = await claimNextJob();
      if (job) {
        try {
          await processJob(job.jobId, job.fileUrls);
          await markJobCompleted(job.jobId);
        } catch (error) {
          await markJobFailed(job.jobId, error.message);
        }
      }
    }
  }
  
  return NextResponse.json({ success: true });
}
```

### Step 3: Alternative - Use Supabase Edge Functions

If webhooks to Vercel don't work, create a Supabase Edge Function:

```typescript
// supabase/functions/process-queue/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Claim next job
  const { data: job } = await supabase.rpc('claim_next_job')
  
  if (!job) {
    return new Response(JSON.stringify({ message: 'No jobs to process' }))
  }

  // Call your Vercel processing endpoint
  // Since this is server-to-server, you can add a secret header
  const response = await fetch('YOUR_VERCEL_URL/api/webhook/process-single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Process-Secret': Deno.env.get('PROCESS_SECRET')
    },
    body: JSON.stringify({ jobId: job.job_id, fileUrls: job.file_urls_data })
  })

  return new Response(JSON.stringify({ 
    processed: true, 
    jobId: job.job_id 
  }))
})
```

Then trigger this with a database webhook or Supabase cron.

### Step 4: Simplest Solution - Frontend Polling

If all else fails, implement simple frontend polling:

```typescript
// In your UploadInterface component
useEffect(() => {
  const interval = setInterval(async () => {
    // Check if any jobs need processing
    const response = await fetch('/api/jobs/status');
    const data = await response.json();
    
    if (data.queuedJobs > 0 && data.processingJobs === 0) {
      // Trigger processing
      await fetch('/api/jobs/process', { method: 'POST' });
    }
  }, 10000); // Check every 10 seconds
  
  return () => clearInterval(interval);
}, []);
```

## Recommendation

Given the constraints:
1. **First choice**: Supabase Database Webhook → Supabase Edge Function → Process jobs
2. **Second choice**: Frontend polling (simple and reliable)
3. **Third choice**: Direct processing in job creation (what we tried, but causes UI blocking)

The key insight is that **Vercel's authentication is blocking server-to-server communication**, so we need to either:
- Use Supabase as the orchestrator (webhooks + edge functions)
- Use the frontend as the orchestrator (polling)
- Accept synchronous processing (UI blocking)