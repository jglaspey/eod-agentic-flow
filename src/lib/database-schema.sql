-- Database schema for roofing estimate analyzer

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  estimate_pdf_url TEXT,
  roof_report_pdf_url TEXT,
  processing_time_ms INTEGER
);

-- Extracted data table
CREATE TABLE job_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  property_address TEXT,
  claim_number TEXT,
  insurance_carrier TEXT,
  date_of_loss DATE,
  total_rcv DECIMAL(10,2),
  roof_area_squares DECIMAL(10,2),
  eave_length DECIMAL(10,2),
  rake_length DECIMAL(10,2),
  ridge_hip_length DECIMAL(10,2),
  valley_length DECIMAL(10,2),
  stories INTEGER,
  pitch VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplement items table
CREATE TABLE supplement_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  line_item TEXT NOT NULL,
  xactimate_code VARCHAR(20),
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(10) NOT NULL,
  reason TEXT NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  calculation_details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI processing config table
CREATE TABLE ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_name VARCHAR(100) UNIQUE NOT NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.1 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default AI configurations with latest models
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES
('extract_estimate_address', 'openai', 'gpt-4o', 'Extract the property address from this insurance estimate document. Look for the property address, which may be different from the insured''s mailing address. Return only the full property address as a single string.', 0.1, 200),
('extract_estimate_claim', 'openai', 'gpt-4o', 'Extract the claim number from this insurance estimate document. Look for "Claim Number" or similar labels. The claim number may span multiple lines. Return the complete claim number only, joining any parts with hyphens if split across lines.', 0.1, 100),
('extract_estimate_carrier', 'openai', 'gpt-4o', 'Extract the insurance carrier/company name from this insurance estimate document. Return only the company name.', 0.1, 100),
('extract_estimate_rcv', 'openai', 'gpt-4o', 'Extract the total RCV (Replacement Cost Value) amount from this insurance estimate document. Return only the numeric value without currency symbols or commas.', 0.1, 100),
('extract_roof_measurements', 'anthropic', 'claude-sonnet-4-20250514', 'Extract all roof measurements from this inspection report including: total roof area in squares, eave length, rake length, ridge/hip length, valley length, number of stories, and predominant pitch. Return the values in a structured format with clear labels.', 0.3, 500),
('analyze_line_items', 'anthropic', 'claude-sonnet-4-20250514', 'Analyze the provided estimate and roof data to identify missing items or discrepancies. Focus on standard roofing components like drip edge, gutter apron, ice & water barrier, and other items that should be included based on the roof measurements. Return a structured analysis.', 0.5, 1000);

-- Create indexes for better performance
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_job_data_job_id ON job_data(job_id);
CREATE INDEX idx_supplement_items_job_id ON supplement_items(job_id);
CREATE INDEX idx_ai_config_step_name ON ai_config(step_name);

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

-- Create policies (for now, allow all access since this is single-tenant MVP)
CREATE POLICY "Enable all access for jobs" ON jobs FOR ALL USING (true);
CREATE POLICY "Enable all access for job_data" ON job_data FOR ALL USING (true);
CREATE POLICY "Enable all access for supplement_items" ON supplement_items FOR ALL USING (true);
CREATE POLICY "Enable all access for ai_config" ON ai_config FOR ALL USING (true);