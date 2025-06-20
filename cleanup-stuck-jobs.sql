-- Clean up stuck jobs in queue
-- Run this in your Supabase SQL Editor to clear the queue

-- First, let's see what jobs are stuck
SELECT 
  id, 
  status, 
  created_at,
  queue_position,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_old
FROM jobs 
WHERE status = 'queued'
ORDER BY created_at ASC;

-- Mark jobs older than 10 minutes as failed
UPDATE jobs 
SET 
  status = 'failed',
  error_message = 'Job cleared from queue due to extended wait time'
WHERE status = 'queued' 
  AND created_at < NOW() - INTERVAL '10 minutes';

-- Reset queue positions for remaining jobs
UPDATE jobs 
SET queue_position = NULL 
WHERE status = 'queued';

-- Update queue positions using the stored function
SELECT update_queue_positions();

-- Show the cleaned up queue
SELECT 
  id, 
  status, 
  created_at,
  queue_position,
  error_message
FROM jobs 
WHERE status IN ('queued', 'failed')
ORDER BY created_at DESC
LIMIT 10;