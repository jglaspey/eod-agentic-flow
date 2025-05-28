const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

async function updateRoofPrompt() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('Updating roof measurement AI prompt...')

  const updatedPrompt = `Extract all roof measurements from this roof inspection report. Look for:
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

Document text:
{{TEXT_CONTENT}}`

  const { data, error } = await supabase
    .from('ai_config')
    .update({ 
      prompt: updatedPrompt,
      max_tokens: 1000
    })
    .eq('step_name', 'extract_roof_measurements')

  if (error) {
    console.error('Error updating roof prompt:', error)
    process.exit(1)
  }

  console.log('✅ Roof measurement prompt updated successfully!')
  
  // Verify
  const { data: verifyData, error: verifyError } = await supabase
    .from('ai_config')
    .select('step_name, max_tokens')
    .eq('step_name', 'extract_roof_measurements')
    .single()

  if (verifyError) {
    console.error('Error verifying update:', verifyError)
  } else {
    console.log(`Verified: ${verifyData.step_name} (max_tokens: ${verifyData.max_tokens})`)
  }
}

updateRoofPrompt().catch(console.error)