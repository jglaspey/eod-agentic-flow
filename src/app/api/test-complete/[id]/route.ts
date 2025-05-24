import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseClient()
  const jobId = params.id
  
  try {
    // Add test job data
    const { error: dataError } = await supabase
      .from('job_data')
      .upsert({
        id: uuidv4(),
        job_id: jobId,
        property_address: '123 Test Street, Sample City, ST 12345',
        claim_number: 'TEST-2024-001',
        insurance_carrier: 'Test Insurance Co.',
        total_rcv: 25000.00,
        roof_area_squares: 32.5,
        eave_length: 150.0,
        rake_length: 120.0,
        ridge_hip_length: 85.0,
        valley_length: 45.0,
        stories: 2,
        pitch: '6/12'
      })

    if (dataError) {
      console.error('Data insert error:', dataError)
    }

    // Add test supplement items
    const { error: supplementError } = await supabase
      .from('supplement_items')
      .upsert([
        {
          id: uuidv4(),
          job_id: jobId,
          line_item: 'Gutter Apron',
          xactimate_code: 'RFG_GAPRN',
          quantity: 150.0,
          unit: 'LF',
          reason: 'Missing gutter apron based on eave measurements',
          confidence_score: 0.9,
          calculation_details: 'Calculated from eave length measurements'
        },
        {
          id: uuidv4(),
          job_id: jobId,
          line_item: 'Drip Edge',
          xactimate_code: 'RFG_DRPEDG',
          quantity: 270.0,
          unit: 'LF',
          reason: 'Missing drip edge for eave and rake protection',
          confidence_score: 0.85,
          calculation_details: 'Calculated from eave + rake length measurements'
        }
      ])

    if (supplementError) {
      console.error('Supplement insert error:', supplementError)
    }

    // Mark job as completed
    const { error: jobError } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        processing_time_ms: 2000
      })
      .eq('id', jobId)

    if (jobError) {
      console.error('Job update error:', jobError)
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Job completed with test data',
      errors: {
        dataError,
        supplementError,
        jobError
      }
    })

  } catch (error) {
    console.error('Test completion error:', error)
    return NextResponse.json(
      { error: `Failed to complete job: ${error}` },
      { status: 500 }
    )
  }
}