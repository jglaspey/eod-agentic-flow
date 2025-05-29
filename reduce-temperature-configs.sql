-- Reduce AI temperature settings for more consistent outputs
-- This updates all AI configurations to use very low temperatures

UPDATE ai_config SET temperature = 0.05 WHERE step_name IN (
  'extract_estimate_address',
  'extract_estimate_claim', 
  'extract_estimate_carrier',
  'extract_estimate_rcv',
  'extract_estimate_acv',
  'extract_estimate_deductible',
  'extract_estimate_date_of_loss',
  'extract_line_items',
  'extract_roof_measurements',
  'analyze_line_items'
);

-- Verify the temperature changes
SELECT step_name, temperature FROM ai_config ORDER BY step_name;