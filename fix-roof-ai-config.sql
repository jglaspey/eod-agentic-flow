-- Fix AI configuration for roof report extraction
-- The RoofReportExtractorAgent is looking for 'extract_roof_measurements_text' 
-- but the database only has 'extract_roof_measurements'

-- Add the missing AI configuration
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES
('extract_roof_measurements_text', 'anthropic', 'claude-sonnet-4-20250514', 
'Extract all roof measurements from this roof inspection report text. Look for:
- Total roof area (in squares or square feet)
- Eave length (linear feet)
- Rake length (linear feet) 
- Ridge and hip length (linear feet)
- Valley length (linear feet)
- Number of stories
- Roof pitch (e.g., 4/12, 6/12)
- Number of roof facets/sections

Replace {{TEXT_CONTENT}} in prompts will be replaced with the actual extracted text.

Return the measurements in JSON format with these exact field names:
{
  "totalRoofArea": number_in_squares,
  "eaveLength": number_in_linear_feet,
  "rakeLength": number_in_linear_feet,
  "ridgeHipLength": number_in_linear_feet,
  "valleyLength": number_in_linear_feet,
  "stories": integer_number,
  "pitch": "string_like_4/12",
  "facets": integer_number
}

Use null for any measurements not found.

{{TEXT_CONTENT}}', 0.3, 1000)
ON CONFLICT (step_name) DO UPDATE SET
  prompt = EXCLUDED.prompt,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens;