import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createSupabaseClient } from '@/lib/supabase'
import { AIOrchestrator } from '@/lib/ai-orchestrator'
import { SupplementItem } from '@/types'

export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase configuration missing. Please check your environment variables.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const estimateFile = formData.get('estimate') as File
    const roofReportFile = formData.get('roofReport') as File

    if (!estimateFile || !roofReportFile) {
      return NextResponse.json(
        { error: 'Both files are required' },
        { status: 400 }
      )
    }

    // Validate file types
    if (estimateFile.type !== 'application/pdf' || roofReportFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    const jobId = uuidv4()
    const startTime = Date.now()

    // Initialize Supabase client
    const supabase = createSupabaseClient()

    // Test database connection
    const { data: testData, error: testError } = await supabase
      .from('jobs')
      .select('count')
      .limit(1)
      .single()

    if (testError) {
      console.error('Database connection error:', testError)
      return NextResponse.json(
        { error: 'Database connection failed. Please check your Supabase configuration.' },
        { status: 500 }
      )
    }

    // Create job record
    const { error: jobError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        status: 'processing',
        created_at: new Date().toISOString()
      })

    if (jobError) {
      console.error('Database error:', jobError)
      return NextResponse.json(
        { error: `Failed to create job record: ${jobError.message}` },
        { status: 500 }
      )
    }

    // Process files with real AI analysis
    processFilesAsync(jobId, estimateFile, roofReportFile, startTime)

    return NextResponse.json({ jobId })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

async function completeTestJob(jobId: string) {
  const supabase = createSupabaseClient()
  
  try {
    // Add test job data
    await supabase
      .from('job_data')
      .insert({
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

    // Add test supplement items
    await supabase
      .from('supplement_items')
      .insert([
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

    // Mark job as completed
    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        processing_time_ms: 2000
      })
      .eq('id', jobId)

  } catch (error) {
    console.error('Test job completion error:', error)
    
    // Mark job as failed
    await supabase
      .from('jobs')
      .update({ status: 'failed' })
      .eq('id', jobId)
  }
}

async function processFilesAsync(
  jobId: string,
  estimateFile: File,
  roofReportFile: File,
  startTime: number
) {
  console.log(`[${jobId}] processFilesAsync started.`);
  const supabase = createSupabaseClient();
  let status = 'processing';
  let errorMessage: string | null = null;

  try {
    console.log(`[${jobId}] Converting files to buffers...`);
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    const roofReportBuffer = Buffer.from(await roofReportFile.arrayBuffer());
    console.log(`[${jobId}] File buffers created.`);

    console.log(`[${jobId}] Initializing AIOrchestrator...`);
    const orchestrator = new AIOrchestrator();
    console.log(`[${jobId}] AIOrchestrator initialized.`);

    let estimateData = null;
    let roofData = null;
    let analysis = null;
    let supplementItems: SupplementItem[] = [];

    try {
      console.log(`[${jobId}] Attempting to extract estimate data...`);
      estimateData = await orchestrator.extractEstimateData(estimateBuffer);
      console.log(`[${jobId}] Estimate data extraction successful.`);
    } catch (e: any) {
      console.error(`[${jobId}] Error extracting estimate data:`, e.message);
      errorMessage = (errorMessage ? errorMessage + '; ' : '') + `Estimate extraction failed: ${e.message}`;
    }

    try {
      console.log(`[${jobId}] Attempting to extract roof data...`);
      roofData = await orchestrator.extractRoofData(roofReportBuffer);
      console.log(`[${jobId}] Roof data extraction successful.`);
    } catch (e: any) {
      console.error(`[${jobId}] Error extracting roof data:`, e.message);
      errorMessage = (errorMessage ? errorMessage + '; ' : '') + `Roof report extraction failed: ${e.message}`;
    }

    if (estimateData && roofData) {
      try {
        console.log(`[${jobId}] Attempting to analyze discrepancies...`);
        analysis = await orchestrator.analyzeDiscrepancies(estimateData, roofData);
        console.log(`[${jobId}] Discrepancy analysis successful.`);
        console.log(`[${jobId}] Attempting to generate supplement items...`);
        supplementItems = await orchestrator.generateSupplementItems(analysis);
        console.log(`[${jobId}] Supplement items generation successful.`);
      } catch (e: any) {
        console.error(`[${jobId}] Error during analysis/supplement generation:`, e.message);
        errorMessage = (errorMessage ? errorMessage + '; ' : '') + `Analysis failed: ${e.message}`;
      }
    } else {
      const missingDataError = !estimateData && !roofData ? 'Both estimate and roof data extraction failed.' 
                             : !estimateData ? 'Estimate data extraction failed.' 
                             : 'Roof data extraction failed.';
      console.warn(`[${jobId}] Skipping analysis due to missing data: ${missingDataError}`);
      errorMessage = (errorMessage ? errorMessage + '; ' : '') + `${missingDataError} Cannot proceed with full analysis.`;
    }

    console.log(`[${jobId}] Preparing to insert into job_data. Current error: ${errorMessage}`);
    const { error: dataError } = await supabase
      .from('job_data')
      .insert({
        id: uuidv4(),
        job_id: jobId,
        property_address: estimateData?.propertyAddress || roofData?.propertyAddress || 'N/A',
        claim_number: estimateData?.claimNumber || 'N/A',
        insurance_carrier: estimateData?.insuranceCarrier || 'N/A',
        date_of_loss: estimateData?.dateOfLoss,
        total_rcv: estimateData?.totalRCV,
        roof_area_squares: roofData?.totalRoofArea,
        eave_length: roofData?.eaveLength,
        rake_length: roofData?.rakeLength,
        ridge_hip_length: roofData?.ridgeHipLength,
        valley_length: roofData?.valleyLength,
        stories: roofData?.stories,
        pitch: roofData?.pitch || 'N/A',
        error_message: errorMessage
      });

    if (dataError) {
      console.error(`[${jobId}] DB error saving job_data:`, dataError);
      status = 'failed';
      errorMessage = (errorMessage ? errorMessage + '; ' : '') + `DB save error (job_data): ${dataError.message}`;
    } else {
      console.log(`[${jobId}] Successfully inserted into job_data.`);
    }

    if (supplementItems.length > 0) {
      console.log(`[${jobId}] Preparing to insert ${supplementItems.length} supplement items.`);
      const supplementInserts = supplementItems.map(item => ({
        id: uuidv4(),
        job_id: jobId,
        line_item: item.line_item,
        xactimate_code: item.xactimate_code,
        quantity: item.quantity,
        unit: item.unit,
        reason: item.reason,
        confidence_score: item.confidence_score,
        calculation_details: item.calculation_details
      }));
      const { error: supplementError } = await supabase
        .from('supplement_items')
        .insert(supplementInserts);

      if (supplementError) {
        console.error(`[${jobId}] DB error saving supplement_items:`, supplementError);
        errorMessage = (errorMessage ? errorMessage + '; ' : '') + `DB save error (supplement_items): ${supplementError.message}`;
      } else {
        console.log(`[${jobId}] Successfully inserted supplement items.`);
      }
    }
    
    status = errorMessage ? 'failed' : 'completed';
    console.log(`[${jobId}] Determined final status: ${status} (Errors: ${errorMessage})`);

  } catch (e: any) {
    console.error(`[${jobId}] UNHANDLED error in processFilesAsync:`, e);
    status = 'failed';
    errorMessage = (errorMessage ? errorMessage + '; ' : '') + `Unhandled processing error: ${e.message}`;
    
    console.log(`[${jobId}] Attempting fallback job_data insert due to unhandled error.`);
    const { data: existingJobData } = await supabase.from('job_data').select('id').eq('job_id', jobId).maybeSingle();
    if (!existingJobData) {
      const { error: fallbackInsertError } = await supabase.from('job_data').insert({
        id: uuidv4(),
        job_id: jobId,
        error_message: errorMessage,
        property_address: 'N/A',
        claim_number: 'N/A',
        insurance_carrier: 'N/A'
      });
      if (fallbackInsertError) {
        console.error(`[${jobId}] Fallback job_data insert FAILED:`, fallbackInsertError);
      } else {
        console.log(`[${jobId}] Fallback job_data insert successful.`);
      }
    } else {
      console.log(`[${jobId}] Fallback job_data insert skipped, record already exists.`);
    }
  } finally {
    const processingTime = Date.now() - startTime;
    console.log(`[${jobId}] processFilesAsync finally block. Status: ${status}, Error: ${errorMessage}`);
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: status,
        processing_time_ms: processingTime,
        error_message: errorMessage
      })
      .eq('id', jobId);

    if (updateError) {
      console.error(`CRITICAL: Failed to update final job status for ${jobId} to ${status}:`, updateError);
    }
    console.log(`Job ${jobId} finished with status: ${status}. Processing time: ${processingTime}ms. Errors: ${errorMessage || 'None'}`);
  }
}