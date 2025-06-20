-- Safe Job Data Cleanup Script
-- This will delete ALL job data but preserve schema and ai_config

-- STEP 1: Show what will be deleted (run this first to confirm)
SELECT 'BEFORE CLEANUP - Row counts:' as info;
SELECT 
  'jobs' as table_name, COUNT(*) as row_count FROM jobs
UNION ALL
SELECT 'job_data', COUNT(*) FROM job_data
UNION ALL  
SELECT 'supplement_items', COUNT(*) FROM supplement_items
UNION ALL
SELECT 'job_reports', COUNT(*) FROM job_reports
UNION ALL
SELECT 'job_logs', COUNT(*) FROM job_logs
UNION ALL
SELECT 'ai_config (WILL KEEP)', COUNT(*) FROM ai_config;

-- STEP 2: Delete job data in correct order (child tables first)
-- Uncomment these DELETE statements when ready:

/*
-- Delete child tables first (due to foreign key constraints)
DELETE FROM job_logs;
DELETE FROM job_reports; 
DELETE FROM supplement_items;
DELETE FROM job_data;

-- Delete parent table last
DELETE FROM jobs;
*/

-- STEP 3: Reset any sequences if needed
-- This ensures new jobs start with clean IDs
-- (No sequences to reset since we use UUIDs)

-- STEP 4: Verify cleanup (run after deletes)
/*
SELECT 'AFTER CLEANUP - Row counts:' as info;
SELECT 
  'jobs' as table_name, COUNT(*) as row_count FROM jobs
UNION ALL
SELECT 'job_data', COUNT(*) FROM job_data
UNION ALL  
SELECT 'supplement_items', COUNT(*) FROM supplement_items
UNION ALL
SELECT 'job_reports', COUNT(*) FROM job_reports
UNION ALL
SELECT 'job_logs', COUNT(*) FROM job_logs
UNION ALL
SELECT 'ai_config (KEPT)', COUNT(*) FROM ai_config;

SELECT 'Database cleaned! Schema and ai_config preserved.' as result;
*/