-- Fix roof_area_squares values that are in square feet instead of squares
-- This script converts values > 100 from square feet to squares by dividing by 100
-- Roofing squares: 1 square = 100 sq ft
-- Most residential roofs are 10-50 squares, so values > 100 are likely in sq ft

-- First, let's see what needs to be fixed
SELECT 
    job_id,
    property_address,
    roof_area_squares,
    CASE 
        WHEN roof_area_squares > 100 THEN roof_area_squares / 100.0
        ELSE roof_area_squares 
    END as corrected_roof_area_squares,
    CASE 
        WHEN roof_area_squares > 100 THEN 'NEEDS CORRECTION'
        ELSE 'OK' 
    END as status
FROM job_data 
WHERE roof_area_squares IS NOT NULL
ORDER BY roof_area_squares DESC;

-- Update records where roof_area_squares > 100 (likely in sq ft instead of squares)
UPDATE job_data 
SET roof_area_squares = roof_area_squares / 100.0
WHERE roof_area_squares > 100;

-- Show the results after correction
SELECT 
    job_id,
    property_address,
    roof_area_squares,
    'CORRECTED' as status
FROM job_data 
WHERE roof_area_squares IS NOT NULL
ORDER BY roof_area_squares DESC; 