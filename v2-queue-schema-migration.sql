-- V2 Queue System Database Migration
-- This file adds the necessary schema changes for the async job queue system

-- 1. Add missing job_logs table (referenced by SSE endpoint but not in current schema)
CREATE TABLE IF NOT EXISTS job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  ts TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'success', 'error', 'debug', 'ai-prompt', 'ai-response')),
  step VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add source attribution fields to supplement_items (mentioned in docs as existing)
ALTER TABLE supplement_items 
ADD COLUMN IF NOT EXISTS source_system VARCHAR(20) CHECK (source_system IN ('business_rule', 'ai_suggestion')),
ADD COLUMN IF NOT EXISTS business_rule_applied TEXT[],
ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) CHECK (validation_status IN ('pending', 'validated', 'rejected'));

-- 3. Extend jobs table status enum to include 'queued'
-- Note: PostgreSQL doesn't allow direct ALTER TYPE with CHECK constraints, so we drop and recreate
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

-- 4. Add queue management fields to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS queue_position INTEGER,
ADD COLUMN IF NOT EXISTS file_urls JSONB,
ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'anonymous',
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 2;

-- 5. Create indexes for queue performance
CREATE INDEX IF NOT EXISTS idx_jobs_queue_status ON jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_jobs_queue_position ON jobs(queue_position) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_jobs_processing_timeout ON jobs(processing_started_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_jobs_user_queue ON jobs(user_id, status) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id_ts ON job_logs(job_id, ts);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(level);

-- 6. Enable RLS for new table
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for job_logs" ON job_logs FOR ALL USING (true);

-- 7. Add queue management SQL function for atomic job claiming
CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS TABLE(
  job_id UUID,
  file_urls_data JSONB
) 
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job_id UUID;
  claimed_file_urls JSONB;
BEGIN
  -- Atomically claim the next job in queue using FOR UPDATE SKIP LOCKED
  UPDATE jobs 
  SET 
    status = 'processing',
    processing_started_at = NOW(),
    queue_position = NULL
  WHERE id = (
    SELECT id 
    FROM jobs 
    WHERE status = 'queued' 
    ORDER BY queue_position ASC NULLS LAST, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, file_urls INTO claimed_job_id, claimed_file_urls;
  
  -- Return the claimed job details
  job_id := claimed_job_id;
  file_urls_data := claimed_file_urls;
  
  -- Only return if we actually claimed a job
  IF claimed_job_id IS NOT NULL THEN
    RETURN NEXT;
  END IF;
END;
$$;

-- 8. Add function to update queue positions when jobs are added
CREATE OR REPLACE FUNCTION update_queue_positions()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update queue positions for all queued jobs
  WITH ordered_jobs AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_position
    FROM jobs 
    WHERE status = 'queued'
  )
  UPDATE jobs 
  SET queue_position = ordered_jobs.new_position
  FROM ordered_jobs
  WHERE jobs.id = ordered_jobs.id;
END;
$$;

-- 9. Add function to cleanup stuck jobs (processing longer than timeout)
CREATE OR REPLACE FUNCTION cleanup_stuck_jobs(timeout_minutes INTEGER DEFAULT 65)
RETURNS TABLE(
  cleaned_job_id UUID,
  stuck_duration_minutes INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
  timeout_threshold TIMESTAMP WITH TIME ZONE;
BEGIN
  timeout_threshold := NOW() - (timeout_minutes || ' minutes')::INTERVAL;
  
  -- Find and reset stuck jobs
  UPDATE jobs 
  SET 
    status = 'failed',
    error_message = COALESCE(error_message || '; ', '') || 'Job timed out after ' || timeout_minutes || ' minutes',
    processing_time_ms = EXTRACT(EPOCH FROM (NOW() - processing_started_at)) * 1000
  WHERE status = 'processing' 
    AND processing_started_at < timeout_threshold
  RETURNING 
    id, 
    EXTRACT(EPOCH FROM (NOW() - processing_started_at)) / 60 
  INTO cleaned_job_id, stuck_duration_minutes;
  
  -- Return results if any jobs were cleaned
  IF cleaned_job_id IS NOT NULL THEN
    RETURN NEXT;
  END IF;
END;
$$;

-- 10. Create storage bucket policy for file uploads (this should be run in Supabase dashboard)
-- Note: This is a comment for manual execution in Supabase dashboard:
-- 
-- -- Create storage bucket
-- INSERT INTO storage.buckets (id, name, public) VALUES ('job-files', 'job-files', false);
-- 
-- -- Create policy for file access
-- CREATE POLICY "Enable all access for job files" ON storage.objects FOR ALL USING (bucket_id = 'job-files');