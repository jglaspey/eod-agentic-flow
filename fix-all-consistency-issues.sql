-- Complete fix for all consistency issues
-- Run this script in your Supabase SQL editor

-- 1. Fix date of loss prompt to return only the date value
UPDATE ai_config 
SET prompt = 'Extract the date of loss from this insurance estimate document. 

IMPORTANT: Return ONLY the date in YYYY-MM-DD format with no explanation, no markdown, no additional text.

Examples:
- If you find "Date of Loss: 5/20/2024", return: 2024-05-20
- If you find "Loss Date: March 15, 2023", return: 2023-03-15

Return only the date value, nothing else.

{{TEXT_CONTENT}}'
WHERE step_name = 'extract_estimate_date_of_loss';

-- 2. Fix line items prompt to request clean JSON without markdown
UPDATE ai_config 
SET prompt = 'Extract line items from this insurance estimate document.

IMPORTANT: Return ONLY a valid JSON array with no markdown formatting, no code blocks, no explanations.

Format each line item as:
{
  "description": "item description",
  "quantity": number_or_0,
  "unit": "unit_of_measure_or_NA",
  "unitPrice": price_or_null,
  "totalPrice": total_or_null
}

Return only the JSON array starting with [ and ending with ]. No other text.

{{TEXT_CONTENT}}'
WHERE step_name = 'extract_line_items';

-- 3. Fix roof extraction prompt to request clean JSON without markdown
UPDATE ai_config 
SET prompt = 'Extract roof measurement details from this text.

IMPORTANT: Return ONLY a valid JSON object with no markdown formatting, no code blocks, no explanations.

Required format:
{
  "totalRoofArea": number_or_null,
  "eaveLength": number_or_null,
  "rakeLength": number_or_null,
  "ridgeHipLength": number_or_null,
  "valleyLength": number_or_null,
  "stories": number_or_null,
  "pitch": "string_or_null",
  "facets": number_or_null
}

Return only the JSON object starting with { and ending with }. No other text.

{{TEXT_CONTENT}}'
WHERE step_name = 'extract_roof_measurements';

-- 4. Verify all updates
SELECT 
    step_name, 
    temperature,
    LEFT(prompt, 100) as prompt_preview
FROM ai_config 
WHERE step_name IN (
    'extract_estimate_date_of_loss', 
    'extract_line_items', 
    'extract_roof_measurements'
)
ORDER BY step_name;