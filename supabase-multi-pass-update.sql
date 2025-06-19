-- Multi-Pass Supplement Generation System: Supabase Database Updates
-- Run this SQL in the Supabase SQL Editor to update the database for the new multi-pass system
-- Version: 1.0
-- Date: 2025-06-19

-- =============================================
-- 1. UPDATE AI CONFIG FOR MULTI-PASS SYSTEM
-- =============================================

-- Update the main analyze_line_items prompt for enhanced JSON output
UPDATE ai_config 
SET 
  prompt = 'You are an expert roofing supplement specialist with extensive knowledge of Xactimate codes and roofing industry standards. Analyze the provided estimate and roof data to identify ALL missing items or discrepancies.

**CRITICAL OUTPUT REQUIREMENTS:**
- Output MUST be a valid JSON array of objects
- Include multiple items when appropriate (2-5+ items common)
- Do not include any text outside the JSON array
- Each object must have ALL required fields

**JSON Schema - Each object must contain:**
{
  "line_item": "string - Clear, specific description",
  "reason": "string - Detailed justification with measurements/calculations", 
  "xactimate_code": "string - Exact code from reference list",
  "quantity": number - Required quantity based on measurements,
  "unit": "string - LF/SF/SQ/EA etc.",
  "confidence_score": number - 0.0 to 1.0
}

**ANALYSIS PRIORITIES (Check ALL categories):**

1. **Drip Edge & Gutter Apron**
   - Rake edges: Need drip edge for water shedding
   - Eave edges with gutters: Need gutter apron for fascia protection
   - Calculate based on actual roof perimeter measurements

2. **Ice & Water Barrier**
   - Code requirement: 2 courses (6 ft width) along all eaves
   - Valley coverage: 36" width for full valley length
   - Calculate: (eave_length × 6) + (valley_length × 3) = total SF

3. **Ridge Cap Quality**
   - Check if ridge cap is purpose-built vs cut from 3-tab shingles
   - Purpose-built required for wind resistance per ASTM standards
   - Quantity should match ridge/hip length from roof report

4. **Starter Row**
   - Universal starter strips required (not cut shingles)
   - Check if listed as "included in waste" (inadequate)
   - Should be separate line item with proper adhesive strips

5. **Additional Roofing Components**
   - Step flashing around penetrations
   - Pipe boot flashing for roof penetrations
   - Valley metal if open valleys
   - High roof/steep roof charges if applicable

**CALCULATION EXAMPLES:**
- Drip Edge: rake_length from roof report
- Ice Barrier: (200 LF eaves × 6 ft) + (40 LF valleys × 3 ft) = 1320 SF
- Ridge Cap: ridge_hip_length from roof report
- Starter: eave_length from roof report

**VALIDATION CHECKS:**
- Cross-reference against existing estimate items
- Ensure quantities are reasonable for roof size
- Verify Xactimate codes exist in reference list
- Check units match item type (LF for linear, SF for area)

**OUTPUT FORMAT EXAMPLE:**
[
  {
    "line_item": "Drip Edge",
    "reason": "Missing drip edge for 158 LF of rake edges per roof report. Required for proper water shedding and fascia protection.",
    "xactimate_code": "RFG DRIP", 
    "quantity": 158,
    "unit": "LF",
    "confidence_score": 0.89
  },
  {
    "line_item": "Ice & Water Barrier",
    "reason": "Code requires ice barrier coverage. Calculation: 200 LF eaves × 6 ft + 40 LF valleys × 3 ft = 1320 SF total needed.",
    "xactimate_code": "RFG IWS",
    "quantity": 1320, 
    "unit": "SF",
    "confidence_score": 0.94
  },
  {
    "line_item": "Universal Starter Row",
    "reason": "No proper starter row found in estimate. Universal starter required for 200 LF of eave edges per wind resistance standards.",
    "xactimate_code": "RFG STARTER",
    "quantity": 200,
    "unit": "LF", 
    "confidence_score": 0.87
  }
]

**INPUT DATA:**

Estimate Line Items:
{actual_extracted_line_items_from_estimate_pdf}

Roof Measurements:
{relevant_data_from_roof_report_pdf}

Xactimate Reference Codes:
{contents_of_codes_md}

**Return only the JSON array with no additional text, markdown formatting, or explanations.**',
  temperature = 0.05,  -- Lower temperature for more consistent JSON output
  max_tokens = 3000,   -- Increased for multiple items
  updated_at = NOW()
WHERE step_name = 'analyze_line_items';

-- =============================================
-- 2. ADD LOGGING ENHANCEMENTS 
-- =============================================

-- Check if job_logs table exists for enhanced logging (used by multi-pass system)
-- If it doesn't exist, create it
CREATE TABLE IF NOT EXISTS job_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    agent_type TEXT,
    log_level TEXT NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for efficient log querying by job_id
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);

-- =============================================
-- 3. SUPPLEMENT ITEMS TABLE ENHANCEMENTS
-- =============================================

-- Add any missing columns to supplement_items table for multi-pass system
ALTER TABLE supplement_items 
ADD COLUMN IF NOT EXISTS calculation_details TEXT,
ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'multi_pass_v1',
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS business_rule_applied TEXT[];

-- Update existing supplement items to have source_system
UPDATE supplement_items 
SET source_system = 'legacy_v0' 
WHERE source_system IS NULL;

-- =============================================
-- 4. PERFORMANCE OPTIMIZATIONS
-- =============================================

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_supplement_items_job_id ON supplement_items(job_id);
CREATE INDEX IF NOT EXISTS idx_supplement_items_created_at ON supplement_items(created_at);
CREATE INDEX IF NOT EXISTS idx_supplement_items_source_system ON supplement_items(source_system);

-- =============================================
-- 5. VERIFICATION QUERIES
-- =============================================

-- Verify the AI config update
SELECT 
    step_name,
    provider, 
    model,
    temperature,
    max_tokens,
    LEFT(prompt, 150) || '...' as prompt_preview,
    updated_at
FROM ai_config 
WHERE step_name = 'analyze_line_items';

-- Check supplement_items table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'supplement_items' 
ORDER BY ordinal_position;

-- Check job_logs table
SELECT COUNT(*) as existing_log_count FROM job_logs;

-- =============================================
-- 6. OPTIONAL: CLEAN UP OLD DATA (COMMENT OUT IF NOT NEEDED)
-- =============================================

-- Uncomment these lines if you want to clean up old supplement data before testing
-- DELETE FROM supplement_items WHERE created_at < NOW() - INTERVAL '7 days';
-- DELETE FROM job_logs WHERE created_at < NOW() - INTERVAL '7 days';

-- =============================================
-- SUMMARY OF CHANGES
-- =============================================

SELECT 'Multi-Pass System Database Update Complete' as status,
       NOW() as updated_at,
       (SELECT COUNT(*) FROM ai_config WHERE step_name = 'analyze_line_items') as ai_configs_updated,
       (SELECT COUNT(*) FROM supplement_items) as total_supplement_items,
       (SELECT COUNT(*) FROM job_logs) as total_job_logs;