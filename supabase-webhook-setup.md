# Supabase Webhook Setup for Queue Processing

## Option 1: Database Webhooks (Recommended)

Supabase Database Webhooks can trigger your Vercel endpoint when jobs are inserted:

1. Go to your Supabase Dashboard
2. Navigate to Database → Webhooks
3. Create a new webhook:
   - **Name**: `process-new-jobs`
   - **Table**: `jobs`
   - **Events**: `INSERT`
   - **URL**: `https://YOUR_VERCEL_URL/api/jobs/process`
   - **HTTP Method**: `POST`
   - **Headers**: Add any auth headers if needed

This will trigger processing whenever a new job is created!

## Option 2: Supabase Edge Functions with Cron

Create a Supabase Edge Function that runs on a schedule:

```typescript
// supabase/functions/process-queue/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Claim and process jobs
  const { data: job } = await supabase.rpc('claim_next_job')
  
  if (job) {
    // Trigger your Vercel endpoint
    await fetch('https://YOUR_VERCEL_URL/api/queue/process-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.job_id })
    })
  }

  return new Response(JSON.stringify({ processed: !!job }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Then schedule it with cron:
```bash
supabase functions deploy process-queue
supabase functions create-cron process-queue --schedule "* * * * *"
```

## Option 3: Simple Polling from Frontend

If webhooks/cron don't work, implement simple polling:

```typescript
// In your frontend code
useEffect(() => {
  const interval = setInterval(async () => {
    // Check for queued jobs and trigger processing
    await fetch('/api/queue/trigger', { method: 'POST' })
  }, 30000) // Every 30 seconds
  
  return () => clearInterval(interval)
}, [])