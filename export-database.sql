-- Export Database Schema and Data
-- Run this in Supabase SQL Editor to backup your data

-- 1. Export all table structures (schema)
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Export row counts for each table
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
SELECT 'ai_config', COUNT(*) FROM ai_config;

-- 3. Export non-job data that we want to keep (ai_config)
SELECT 'AI Config Export:' as info;
SELECT * FROM ai_config;

-- 4. Export a sample of each job table to see what we're deleting
SELECT 'Jobs Sample:' as info;
SELECT id, status, created_at FROM jobs LIMIT 5;

SELECT 'Job Data Sample:' as info;  
SELECT id, job_id, property_address, insurance_carrier FROM job_data LIMIT 5;

SELECT 'Supplement Items Sample:' as info;
SELECT id, job_id, line_item, quantity, unit FROM supplement_items LIMIT 5;