# 🚀 Quick Start Guide

## What We Fixed

1. **Updated to Latest AI Models**:
   - OpenAI: `gpt-4o` (latest GPT-4 model)
   - Anthropic: `claude-sonnet-4-20250514` (Claude 4 Sonnet)

2. **Fixed API Issues**:
   - Updated Anthropic SDK to latest version (0.27.0)
   - Fixed Messages API usage
   - Improved error handling

3. **Enhanced Claim Number Extraction**:
   - Now handles multi-line claim numbers properly
   - Joins split numbers with hyphens

## Setup Steps

### 1. Create Environment File

Create `.env.local` in the root directory:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# AI API Keys
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
```

### 2. Set Up Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the contents of `src/lib/database-schema.sql` to create tables
4. Run the contents of `setup-database.sql` to configure AI models

### 3. Install Dependencies & Start

```bash
npm install
npm run dev
```

## Testing the Fix

1. Upload your Progressive estimate PDF and roof report
2. The system should now:
   - Extract the full claim number: `1354565-242889-014101`
   - Get the correct property address: `8002 KILPATRICK PKWY BENNINGTON, NE 68007-3289`
   - Use the latest AI models for better accuracy

## What's Different Now

### AI Models Used:
- **Address/Claim/Carrier/RCV**: OpenAI GPT-4o
- **Roof Measurements**: Claude 4 Sonnet
- **Analysis**: Claude 4 Sonnet

### Improved Prompts:
- Better handling of multi-line claim numbers
- Distinction between property address vs mailing address
- More structured roof measurement extraction

### Error Handling:
- Graceful fallback when AI APIs are unavailable
- Better error messages for debugging
- Proper UUID validation

## Expected Results

With your Progressive estimate, you should now see:
- **Property Address**: `8002 KILPATRICK PKWY BENNINGTON, NE 68007-3289`
- **Claim Number**: `1354565-242889-014101` (complete number)
- **Insurance Carrier**: `Progressive`
- **Total RCV**: `$27000` (or whatever the actual amount is)

## Troubleshooting

If you still see issues:

1. **Check API Keys**: Make sure they're valid and not placeholder values
2. **Database Config**: Verify the AI config was inserted by running:
   ```sql
   SELECT step_name, provider, model FROM ai_config;
   ```
3. **Restart Server**: After updating `.env.local`, restart with `npm run dev`

## Next Steps

Once this is working:
1. Test with different PDF formats
2. Fine-tune prompts for better accuracy
3. Add more supplement item detection rules
4. Implement export functionality 