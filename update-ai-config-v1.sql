-- V1 Multi-Item Output Fix: Update AI Config for Explicit JSON Format
-- This SQL updates the ai_config table to fix the single-item output issue

-- Update the analyze_line_items prompt with explicit JSON schema requirements
UPDATE ai_config 
SET 
  prompt = 'You are an expert roofing supplement specialist. Analyze the provided estimate and roof data to identify ALL missing items or discrepancies.

**CRITICAL: You MUST output a JSON array of objects. Do not include any other text.**

For each missing or insufficient item, create an object with these exact fields:
- line_item: (string) Clear description of the item
- reason: (string) Why this item is needed/missing
- xactimate_code: (string) Use exact codes from the provided reference list
- quantity: (number) Required quantity
- unit: (string) Unit of measure (LF, SF, EA, etc.)
- confidence_score: (number) Your confidence 0.0-1.0

Focus on these common missing items:
1. **Drip Edge**: Check if rake edges have proper drip edge coverage
2. **Gutter Apron**: Check if eave edges with gutters have gutter apron
3. **Ice & Water Barrier**: Calculate code-required coverage for eaves and valleys
4. **Ridge Cap**: Verify proper ridge cap type (purpose-built vs cut shingles)
5. **Starter Row**: Check for universal starter vs inadequate alternatives

**Example Output Format:**
[
  {
    "line_item": "Drip Edge",
    "reason": "Missing drip edge for 120 LF of rake edges per roof report",
    "xactimate_code": "RFG DRIP",
    "quantity": 120,
    "unit": "LF",
    "confidence_score": 0.85
  },
  {
    "line_item": "Ice & Water Barrier", 
    "reason": "Code requires ice barrier for eaves, only 50 SF found vs 85 SF needed",
    "xactimate_code": "RFG IWS",
    "quantity": 35,
    "unit": "SF",
    "confidence_score": 0.92
  }
]

**Data to analyze:**

Estimate Line Items: {actual_extracted_line_items_from_estimate_pdf}

Roof Report Data: {relevant_data_from_roof_report_pdf}

Xactimate Code Reference: {contents_of_codes_md}

Return ONLY the JSON array - no additional text, explanations, or markdown formatting.',
  temperature = 0.1,
  max_tokens = 2000
WHERE step_name = 'analyze_line_items';

-- Verify the update
SELECT step_name, provider, model, temperature, max_tokens, 
       LEFT(prompt, 100) || '...' as prompt_preview
FROM ai_config 
WHERE step_name = 'analyze_line_items';