const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

async function setupAIConfigs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('Setting up AI configurations...')

  // Clear existing configs first
  const { error: deleteError } = await supabase
    .from('ai_config')
    .delete()
    .in('step_name', [
      'extract_estimate_address',
      'extract_estimate_claim', 
      'extract_estimate_carrier',
      'extract_estimate_rcv',
      'extract_estimate_acv',
      'extract_estimate_deductible',
      'extract_estimate_date_of_loss',
      'extract_line_items'
    ])

  if (deleteError) {
    console.log('Note: Error clearing old configs (may not exist):', deleteError.message)
  }

  // Insert new configs
  const configs = [
    {
      step_name: 'extract_estimate_address',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the property address from this insurance estimate document. Look for the PROPERTY address where the damage occurred, not the insured\'s mailing address. The property address should include street number, street name, city, state, and ZIP code. Return only the complete property address as a single string.',
      temperature: 0.1,
      max_tokens: 200
    },
    {
      step_name: 'extract_estimate_claim',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the claim number from this insurance estimate document. Look for "Claim Number", "Claim #", or similar labels. The claim number may be alphanumeric and could span multiple lines. Return only the complete claim number, joining any parts with hyphens if split across lines.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_estimate_carrier',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the insurance carrier/company name from this insurance estimate document. Look for the insurance company name, which may appear in headers, logos, or company information sections. Return only the insurance company name.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_estimate_rcv',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the total RCV (Replacement Cost Value) amount from this insurance estimate document. Look for "Total RCV", "Replacement Cost", "Total Estimate", or similar labels. This is usually the largest dollar amount in the document. Return only the numeric value without currency symbols, commas, or spaces.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_estimate_acv',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the total ACV (Actual Cash Value) amount from this insurance estimate document. Look for "Total ACV", "Actual Cash Value", "Net Claim", or similar labels. This is often RCV minus depreciation. Return only the numeric value without currency symbols, commas, or spaces.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_estimate_deductible',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the deductible amount from this insurance estimate document. Look for "Deductible", "Ded", or similar labels. Return only the numeric value without currency symbols, commas, or spaces.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_estimate_date_of_loss',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract the date of loss from this insurance estimate document. Look for "Date of Loss", "Loss Date", "DOL", or similar labels. Return the date in YYYY-MM-DD format.',
      temperature: 0.1,
      max_tokens: 100
    },
    {
      step_name: 'extract_line_items',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Extract all line items from this insurance estimate document. Each line item should include description, quantity, unit, and unit cost if available. Return as a JSON array where each item is an object with properties: {"description": "item description", "quantity": number, "unit": "unit type", "unitCost": number, "totalCost": number}. Focus on roofing-related items like shingles, felt, drip edge, gutters, etc.',
      temperature: 0.1,
      max_tokens: 2000
    }
  ]

  const { data, error } = await supabase
    .from('ai_config')
    .insert(configs)

  if (error) {
    console.error('Error inserting AI configs:', error)
    process.exit(1)
  }

  console.log('✅ AI configurations inserted successfully!')
  
  // Verify
  const { data: verifyData, error: verifyError } = await supabase
    .from('ai_config')
    .select('step_name, provider, model')
    .order('step_name')

  if (verifyError) {
    console.error('Error verifying configs:', verifyError)
  } else {
    console.log('Verified configs:')
    verifyData.forEach(config => {
      console.log(`  - ${config.step_name} (${config.provider}/${config.model})`)
    })
  }
}

setupAIConfigs().catch(console.error)