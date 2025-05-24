-- Setup script for Roofing Estimate Analyzer
-- Run this in your Supabase SQL Editor

-- First, clear any existing AI config data
DELETE FROM ai_config;

-- Insert updated AI configurations with latest models
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES
('extract_estimate_address', 'anthropic', 'claude-sonnet-4-20250514', 'Extract the property address from this insurance estimate document. Look for the property address, which may be different from the insured''s mailing address. Return only the full property address as a single string.', 0.1, 200),
('extract_estimate_claim', 'anthropic', 'claude-sonnet-4-20250514', 'Extract the claim number from this insurance estimate document. Look for "Claim Number" or similar labels. The claim number may span multiple lines. Return the complete claim number only, joining any parts with hyphens if split across lines.', 0.1, 100),
('extract_estimate_carrier', 'anthropic', 'claude-sonnet-4-20250514', 'Extract the insurance carrier/company name from this insurance estimate document. Return only the company name.', 0.1, 100),
('extract_estimate_rcv', 'anthropic', 'claude-sonnet-4-20250514', 'Extract the total RCV (Replacement Cost Value) amount from this insurance estimate document. Return only the numeric value without currency symbols or commas.', 0.1, 100),
('extract_roof_measurements', 'anthropic', 'claude-sonnet-4-20250514', 'Extract all roof measurements from this inspection report including: total roof area in squares, eave length, rake length, ridge/hip length, valley length, number of stories, and predominant pitch. Return the values in a structured format with clear labels.', 0.3, 500),
('analyze_line_items', 'anthropic', 'claude-sonnet-4-20250514', 'Analyze the provided estimate and roof data to identify missing items or discrepancies. Focus on standard roofing components like drip edge, gutter apron, ice & water barrier, and other items that should be included based on the roof measurements. Return a structured analysis.', 0.5, 1000);

-- Verify the configuration was inserted
SELECT step_name, provider, model FROM ai_config ORDER BY step_name; 