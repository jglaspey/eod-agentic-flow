# Roofing Estimate Analyzer

An AI-powered application for analyzing roofing insurance estimates and generating supplement recommendations.

## Quick Setup Guide

### Prerequisites

1. **Supabase Account**: Sign up at [supabase.com](https://supabase.com)
2. **OpenAI API Key**: Get from [platform.openai.com](https://platform.openai.com)
3. **Anthropic API Key** (optional): Get from [console.anthropic.com](https://console.anthropic.com)

### Setup Steps

#### 1. Create Environment File

Create a `.env.local` file in the root directory with your actual credentials:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# AI API Keys
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
```

#### 2. Set Up Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and run the contents of `src/lib/database-schema.sql`
4. Verify all tables are created successfully

#### 3. Configure AI Settings

In Supabase SQL Editor, run the contents of `setup-database.sql`:

```sql
-- Clear any existing AI config data
DELETE FROM ai_config;

-- Insert updated AI configurations with latest models
INSERT INTO ai_config (step_name, provider, model, prompt, temperature, max_tokens) VALUES
('extract_estimate_address', 'openai', 'gpt-4o', 'Extract the property address from this insurance estimate document. Look for the property address, which may be different from the insured''s mailing address. Return only the full property address as a single string.', 0.1, 200),
('extract_estimate_claim', 'openai', 'gpt-4o', 'Extract the claim number from this insurance estimate document. Look for "Claim Number" or similar labels. The claim number may span multiple lines. Return the complete claim number only, joining any parts with hyphens if split across lines.', 0.1, 100),
('extract_estimate_carrier', 'openai', 'gpt-4o', 'Extract the insurance carrier/company name from this insurance estimate document. Return only the company name.', 0.1, 100),
('extract_estimate_rcv', 'openai', 'gpt-4o', 'Extract the total RCV (Replacement Cost Value) amount from this insurance estimate document. Return only the numeric value without currency symbols or commas.', 0.1, 100),
('extract_roof_measurements', 'anthropic', 'claude-sonnet-4-20250514', 'Extract all roof measurements from this inspection report including: total roof area in squares, eave length, rake length, ridge/hip length, valley length, number of stories, and predominant pitch. Return the values in a structured format with clear labels.', 0.3, 500),
('analyze_line_items', 'anthropic', 'claude-sonnet-4-20250514', 'Analyze the provided estimate and roof data to identify missing items or discrepancies. Focus on standard roofing components like drip edge, gutter apron, ice & water barrier, and other items that should be included based on the roof measurements. Return a structured analysis.', 0.5, 1000);
```

#### 4. Install Dependencies & Run

```bash
npm install
npm run dev
```

Visit http://localhost:3000

## How It Works

1. **Upload Files**: Upload both the insurance estimate PDF and roof report PDF
2. **Processing**: The system extracts data from both PDFs using AI
3. **Analysis**: It compares the data and identifies missing items
4. **Results**: View the extracted information and generated supplement items

## Recent Improvements

### Multi-line Claim Number Support
The system now properly handles claim numbers that span multiple lines in the PDF. For example:
```
Claim Number: 1354565-242889-
             014101
```
Will be correctly extracted as: `1354565-242889-014101`

### Better Error Handling
- Graceful fallback when AI APIs are not configured
- Clear error messages for missing environment variables
- UUID validation to prevent database errors

### AI Provider Flexibility
- Supports both OpenAI and Anthropic models
- Falls back to regex-based extraction when AI is unavailable
- Configurable prompts via database

## Troubleshooting

### Common Issues

1. **"Cannot read properties of undefined (reading 'create')"**
   - Your API keys are not set properly in `.env.local`
   - Replace placeholder values with actual API keys

2. **UUID Errors ("invalid input syntax for type uuid")**
   - Use the job ID returned from the upload process
   - Don't use test strings like "your-job-id"

3. **Missing Data in Results**
   - Check that AI API keys are valid
   - Verify PDF quality and format
   - Review AI prompts in `ai_config` table

4. **Claim Number Issues**
   - The improved regex now handles multi-line claim numbers
   - Numbers are joined with hyphens when split across lines

### Fallback Mode
When AI APIs are not available, the system uses regex-based extraction:
- Basic property address detection
- Claim number extraction (including multi-line)
- Insurance carrier identification
- RCV amount parsing

## Current Limitations

1. **PDF Format**: Only processes PDF files
2. **File Size**: Maximum 10MB per file
3. **Processing Time**: 10-30 seconds depending on file size
4. **AI Accuracy**: Results depend on PDF quality and format

## Testing

To quickly test with sample data:
1. Upload any two PDF files
2. The system will process them (or use fallback extraction)
3. View results on the results page

## Architecture

- **Frontend**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4 / Anthropic Claude
- **PDF Processing**: pdf-parse library

## Future Enhancements

1. **Export Functionality**: Generate Xactimate-compatible reports
2. **Batch Processing**: Handle multiple estimates at once
3. **Learning System**: Improve accuracy based on user feedback
4. **Additional Integrations**: Connect with estimating software
5. **Advanced Analytics**: Historical data analysis and trends

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the error logs in browser console
3. Verify your environment configuration
4. Ensure database schema is up to date