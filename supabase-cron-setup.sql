-- Supabase Cron Setup for Queue Processing
-- Run this in your Supabase SQL editor

-- 1. Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Create a function that triggers your Vercel processing endpoint
CREATE OR REPLACE FUNCTION trigger_queue_processing()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  response_status INTEGER;
  response_body TEXT;
BEGIN
  -- Use pg_net to make HTTP request to your processing endpoint
  -- Replace YOUR_VERCEL_URL with your actual deployment URL
  SELECT status, body 
  INTO response_status, response_body
  FROM http_post(
    'https://YOUR_VERCEL_URL/api/jobs/process',
    '{}',
    'application/json'
  );
  
  -- Log the result
  INSERT INTO job_logs (job_id, level, step, message, data)
  VALUES (
    NULL, 
    CASE WHEN response_status = 200 THEN 'info' ELSE 'error' END,
    'cron-trigger',
    'Queue processing triggered via Supabase cron',
    jsonb_build_object(
      'status', response_status,
      'response', response_body,
      'triggered_at', NOW()
    )
  );
END;
$$;

-- 4. Alternative: Process jobs directly in the database
CREATE OR REPLACE FUNCTION process_queue_directly()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  job_record RECORD;
  jobs_processed INTEGER := 0;
BEGIN
  -- Process up to 5 jobs per cron run
  FOR job_record IN 
    SELECT * FROM claim_next_job() 
    LIMIT 5
  LOOP
    -- Since we can't process the actual job in SQL, 
    -- we'll use pg_net to trigger your API
    PERFORM net.http_post(
      url := 'https://YOUR_VERCEL_URL/api/queue/process-single',
      body := jsonb_build_object('jobId', job_record.job_id)
    );
    
    jobs_processed := jobs_processed + 1;
  END LOOP;
  
  -- Log cron run
  INSERT INTO job_logs (job_id, level, step, message, data)
  VALUES (
    NULL, 
    'info',
    'cron-direct',
    format('Cron triggered processing for %s jobs', jobs_processed),
    jsonb_build_object('jobs_triggered', jobs_processed, 'run_at', NOW())
  );
END;
$$;

-- 5. Schedule the cron job to run every minute
SELECT cron.schedule(
  'process-queue',           -- job name
  '* * * * *',              -- every minute
  'SELECT process_queue_directly();'  -- command to run
);

-- 6. View scheduled jobs
SELECT * FROM cron.job;

-- 7. To remove the cron job later:
-- SELECT cron.unschedule('process-queue');

-- 8. Alternative using Supabase Edge Functions
-- If you have Supabase Edge Functions, you can trigger those instead:
/*
CREATE OR REPLACE FUNCTION trigger_edge_function()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trigger your Supabase Edge Function
  PERFORM net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;
*/