-- Add extraction_notes field to job_data table
-- This field will store accumulated notes from AI extraction when fields are uncertain or problematic
ALTER TABLE job_data ADD COLUMN IF NOT EXISTS extraction_notes TEXT;

-- Add index for faster queries on jobs with notes
CREATE INDEX IF NOT EXISTS idx_job_data_extraction_notes ON job_data(extraction_notes) WHERE extraction_notes IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN job_data.extraction_notes IS 'Accumulated notes from AI extraction process when fields are uncertain, contain best guesses, or have parsing issues';

-- Update AI configuration prompts to handle uncertainty
UPDATE ai_config SET 
  prompt = 'Extract the property address from this insurance estimate document. Look for the physical property address where damage occurred, not mailing addresses. 

**UNCERTAINTY HANDLING:**
- If you cannot find the address at all: Return "N/A" and note the issue
- If you can make a reasonable guess but aren''t certain: Return your best guess followed by "*" and note the uncertainty
- If the address is clearly visible: Return the address normally

Return ONLY the address value or "N/A". Do not include explanations in the main response.',
  updated_at = NOW()
WHERE step_name = 'extract_estimate_property_address';

UPDATE ai_config SET 
  prompt = 'Extract the customer or insured name from this insurance estimate document. Look for "Insured", "Customer", "Property Owner", or similar labels.

**UNCERTAINTY HANDLING:**
- If you cannot find a customer name at all: Return "N/A" and note the issue
- If you can make a reasonable guess but aren''t certain: Return your best guess followed by "*" and note the uncertainty  
- If the name is clearly visible: Return the name normally

Return ONLY the customer name or "N/A". Do not include explanations in the main response.',
  updated_at = NOW()
WHERE step_name = 'extract_estimate_customer';

UPDATE ai_config SET 
  prompt = 'Extract the claim number from this insurance estimate document. Look for "Claim Number", "Claim #", or similar labels.

**UNCERTAINTY HANDLING:**
- If you cannot find a claim number at all: Return "N/A" and note the issue
- If you can make a reasonable guess but aren''t certain: Return your best guess followed by "*" and note the uncertainty
- If the claim number is clearly visible: Return the number normally

Return ONLY the claim number or "N/A". Do not include explanations in the main response.',
  updated_at = NOW()
WHERE step_name = 'extract_estimate_claim_number';

UPDATE ai_config SET 
  prompt = 'Extract the insurance carrier/company name from this insurance estimate document.

**UNCERTAINTY HANDLING:**
- If you cannot find the insurance carrier at all: Return "N/A" and note the issue
- If you can make a reasonable guess but aren''t certain: Return your best guess followed by "*" and note the uncertainty
- If the carrier name is clearly visible: Return the name normally

Return ONLY the insurance carrier name or "N/A". Do not include explanations in the main response.',
  updated_at = NOW()
WHERE step_name = 'extract_estimate_insurance_carrier';