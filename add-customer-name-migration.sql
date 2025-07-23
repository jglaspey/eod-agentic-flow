-- Add customer_name field to job_data table
ALTER TABLE job_data ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Add AI config for customer name extraction
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES
('extract_estimate_customer', 'anthropic', 'claude-sonnet-4-20250514', 'Extract the customer or insured name from this insurance estimate document. Look for "Insured", "Customer", "Property Owner", or similar labels. Return only the full name as a single string. If multiple names are present, return the primary insured/customer name.', 0.1, 100)
ON CONFLICT (step_name) DO UPDATE SET 
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  prompt = EXCLUDED.prompt,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  updated_at = NOW();

-- Create storage bucket for PDFs if it doesn't exist
-- Note: This needs to be run through Supabase dashboard or using their CLI
-- as storage bucket creation is not available through SQL
-- INSERT INTO storage.buckets (id, name, public) VALUES ('job-pdfs', 'job-pdfs', false) ON CONFLICT DO NOTHING;