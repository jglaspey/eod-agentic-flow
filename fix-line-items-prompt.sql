-- Fix line items prompt to request clean JSON without markdown
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

-- Verify the update
SELECT step_name, LEFT(prompt, 200) as prompt_preview FROM ai_config WHERE step_name = 'extract_line_items';