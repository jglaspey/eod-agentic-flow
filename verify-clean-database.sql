-- Verify Clean Database State
-- Run this after cleanup to ensure everything is ready

-- Check all job tables are empty
SELECT 'Job Tables Status:' as info;
SELECT 
  'jobs' as table_name, COUNT(*) as row_count FROM jobs
UNION ALL
SELECT 'job_data', COUNT(*) FROM job_data
UNION ALL  
SELECT 'supplement_items', COUNT(*) FROM supplement_items
UNION ALL
SELECT 'job_reports', COUNT(*) FROM job_reports
UNION ALL
SELECT 'job_logs', COUNT(*) FROM job_logs;

-- Verify AI config is still there
SELECT 'AI Config Preserved:' as info;
SELECT step_name, provider, model FROM ai_config;

-- Check storage is clean
SELECT 'Storage Files:' as info;
SELECT COUNT(*) as file_count FROM storage.objects WHERE bucket_id = 'job-files';

-- Test that queue functions still work
SELECT 'Testing queue functions:' as info;
SELECT update_queue_positions(); -- Should return without error

-- Check bucket exists
SELECT 'Storage Bucket Status:' as info;
SELECT id, name, public FROM storage.buckets WHERE id = 'job-files';

SELECT 'Database is clean and ready for testing!' as result;