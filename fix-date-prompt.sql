-- Fix date of loss prompt to return only the date value
UPDATE ai_config 
SET prompt = 'Extract the date of loss from this insurance estimate document. 

IMPORTANT: Return ONLY the date in YYYY-MM-DD format with no explanation, no markdown, no additional text.

Examples:
- If you find "Date of Loss: 5/20/2024", return: 2024-05-20
- If you find "Loss Date: March 15, 2023", return: 2023-03-15

Return only the date value, nothing else.

{{TEXT_CONTENT}}'
WHERE step_name = 'extract_estimate_date_of_loss';

-- Verify the update
SELECT step_name, prompt FROM ai_config WHERE step_name = 'extract_estimate_date_of_loss';