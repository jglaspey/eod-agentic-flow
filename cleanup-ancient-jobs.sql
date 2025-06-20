-- Clean up ancient jobs stuck in processing status
-- These are blocking the queue runner from starting

-- First, see what we have
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM jobs 
GROUP BY status
ORDER BY status;

-- Show the old stuck processing jobs
SELECT 
  id,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_old
FROM jobs 
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at ASC;

-- Mark ancient processing jobs (older than 2 hours) as failed
UPDATE jobs 
SET 
  status = 'failed',
  error_message = 'Job timed out - stuck in processing status for too long',
  processing_time_ms = EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000
WHERE status = 'processing' 
  AND created_at < NOW() - INTERVAL '2 hours';

-- Show results after cleanup
SELECT 
  status,
  COUNT(*) as count
FROM jobs 
GROUP BY status
ORDER BY status;