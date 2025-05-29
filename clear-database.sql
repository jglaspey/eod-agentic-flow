-- Clear all temp upload data from the database
-- Run this in your Supabase SQL editor

-- Clear supplement items first (foreign key dependency)
DELETE FROM supplement_items;

-- Clear job data (foreign key dependency)
DELETE FROM job_data;

-- Clear jobs table
DELETE FROM jobs;

-- Reset any auto-increment sequences if needed
-- (Supabase uses UUIDs so this might not be necessary, but including for completeness)

-- Verify tables are empty
SELECT 'jobs' as table_name, COUNT(*) as count FROM jobs
UNION ALL
SELECT 'job_data' as table_name, COUNT(*) as count FROM job_data
UNION ALL
SELECT 'supplement_items' as table_name, COUNT(*) as count FROM supplement_items; 