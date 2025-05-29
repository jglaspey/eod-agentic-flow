-- Fix missing AI configurations for field extraction
-- This adds all the missing configurations that EstimateExtractorAgent needs

-- Clear existing incomplete configs
DELETE FROM ai_config WHERE step_name IN (
  'extract_estimate_address',
  'extract_estimate_claim', 
  'extract_estimate_carrier',
  'extract_estimate_rcv',
  'extract_estimate_acv',
  'extract_estimate_deductible',
  'extract_estimate_date_of_loss',
  'extract_line_items'
);

-- Insert complete AI configurations for all fields that EstimateExtractorAgent requires
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES

-- Property Address extraction
('extract_estimate_address', 'anthropic', 'claude-sonnet-4-20250514', 
'Extract the property address from this insurance estimate document. Look for the PROPERTY address where the damage occurred, not the insured''s mailing address. The property address should include street number, street name, city, state, and ZIP code. Return only the complete property address as a single string.', 0.1, 200),

-- Claim Number extraction  
('extract_estimate_claim', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the claim number from this insurance estimate document. Look for "Claim Number", "Claim #", or similar labels. The claim number may be alphanumeric and could span multiple lines. Return only the complete claim number, joining any parts with hyphens if split across lines.', 0.1, 100),

-- Insurance Carrier extraction
('extract_estimate_carrier', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the insurance carrier/company name from this insurance estimate document. Look for the insurance company name, which may appear in headers, logos, or company information sections. Return only the insurance company name.', 0.1, 100),

-- Total RCV extraction
('extract_estimate_rcv', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the total RCV (Replacement Cost Value) amount from this insurance estimate document. Look for "Total RCV", "Replacement Cost", "Total Estimate", or similar labels. This is usually the largest dollar amount in the document. Return only the numeric value without currency symbols, commas, or spaces.', 0.1, 100),

-- Total ACV extraction
('extract_estimate_acv', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the total ACV (Actual Cash Value) amount from this insurance estimate document. Look for "Total ACV", "Actual Cash Value", "Net Claim", or similar labels. This is often RCV minus depreciation. Return only the numeric value without currency symbols, commas, or spaces.', 0.1, 100),

-- Deductible extraction
('extract_estimate_deductible', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the deductible amount from this insurance estimate document. Look for "Deductible", "Ded", or similar labels. Return only the numeric value without currency symbols, commas, or spaces.', 0.1, 100),

-- Date of Loss extraction
('extract_estimate_date_of_loss', 'anthropic', 'claude-sonnet-4-20250514',
'Extract the date of loss from this insurance estimate document. Look for "Date of Loss", "Loss Date", "DOL", or similar labels. Return the date in YYYY-MM-DD format.', 0.1, 100),

-- Line Items extraction
('extract_line_items', 'anthropic', 'claude-sonnet-4-20250514',
'Extract all line items from this insurance estimate document. Each line item should include description, quantity, unit, and unit cost if available. Return as a JSON array where each item is an object with properties: {"description": "item description", "quantity": number, "unit": "unit type", "unitCost": number, "totalCost": number}. Focus on roofing-related items like shingles, felt, drip edge, gutters, etc.', 0.1, 2000);

-- Verify all configurations were inserted
SELECT step_name, provider, model FROM ai_config WHERE step_name LIKE 'extract_estimate_%' OR step_name = 'extract_line_items' ORDER BY step_name;