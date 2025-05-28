const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

async function addRoofAIConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('Adding missing roof measurement AI configuration...')

  // Add the missing AI configuration for roof measurements
  const config = {
    step_name: 'extract_roof_measurements_text',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    prompt: `Extract all roof measurements from this roof inspection report text. Look for:
- Total roof area (in squares or square feet)
- Eave length (linear feet)
- Rake length (linear feet) 
- Ridge and hip length (linear feet)
- Valley length (linear feet)
- Number of stories
- Roof pitch (e.g., 4/12, 6/12)
- Number of roof facets/sections

Return the measurements in JSON format with these exact field names:
{
  "totalRoofArea": number_in_squares,
  "eaveLength": number_in_linear_feet,
  "rakeLength": number_in_linear_feet,
  "ridgeHipLength": number_in_linear_feet,
  "valleyLength": number_in_linear_feet,
  "stories": integer_number,
  "pitch": "string_like_4/12",
  "facets": integer_number
}

Use null for any measurements not found.

{{TEXT_CONTENT}}`,
    temperature: 0.3,
    max_tokens: 1000
  }

  // Try to insert, or update if exists
  const { data, error } = await supabase
    .from('ai_config')
    .upsert(config, { onConflict: 'step_name' })

  if (error) {
    console.error('Error adding roof AI config:', error)
    process.exit(1)
  }

  console.log('✅ Roof measurement AI configuration added successfully!')
  
  // Verify
  const { data: verifyData, error: verifyError } = await supabase
    .from('ai_config')
    .select('step_name, provider, model')
    .eq('step_name', 'extract_roof_measurements_text')
    .single()

  if (verifyError) {
    console.error('Error verifying config:', verifyError)
  } else {
    console.log('Verified config:')
    console.log(`  - ${verifyData.step_name} (${verifyData.provider}/${verifyData.model})`)
  }
}

addRoofAIConfig().catch(console.error)