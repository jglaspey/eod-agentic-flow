-- Fix roof extraction prompt to request clean JSON without markdown
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

-- Verify the update
SELECT step_name, LEFT(prompt, 200) as prompt_preview FROM ai_config WHERE step_name = 'extract_roof_measurements';