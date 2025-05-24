import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from '@/lib/supabase'
import { AIOrchestrator } from '@/lib/ai-orchestrator'
import { logStreamer } from '@/lib/log-streamer'
import { SupplementItem, EstimateData, RoofData } from '@/types'
import { generateAndSaveReport } from '@/lib/report-generator'

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
    const supabase = getSupabaseClient()

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
  const supabase = getSupabaseClient()
  
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
  console.log(`[${jobId}] processFilesAsync: Started.`);
  logStreamer.logStep(jobId, 'job-started', 'Job processing started')
  const supabase = getSupabaseClient();
  let currentStatus = 'processing';
  let detailedErrorMessage: string | null = null;
  let processingStep = 'initialization';
  let estimateData: EstimateData | null = null;
  let roofData: RoofData | null = null;
  let supplementItems: SupplementItem[] = [];

  try {
    processingStep = 'buffer_conversion';
    console.log(`[${jobId}] processFilesAsync: Converting files to buffers...`);
    logStreamer.logStep(jobId, processingStep, 'Converting uploaded files to buffers')
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    const roofReportBuffer = Buffer.from(await roofReportFile.arrayBuffer());
    console.log(`[${jobId}] processFilesAsync: File buffers created.`);

    processingStep = 'ai_orchestrator_init';
    console.log(`[${jobId}] processFilesAsync: Initializing AIOrchestrator...`);
    const orchestrator = new AIOrchestrator(jobId);
    logStreamer.logStep(jobId, processingStep, 'AIOrchestrator initialized')
    console.log(`[${jobId}] processFilesAsync: AIOrchestrator initialized.`);


    try {
      processingStep = 'estimate_extraction';
      console.log(`[${jobId}] processFilesAsync: Attempting to extract estimate data...`);
      logStreamer.logStep(jobId, processingStep, 'Extracting estimate PDF')
      estimateData = await orchestrator.extractEstimateData(estimateBuffer);
      console.log(`[${jobId}] processFilesAsync: Estimate data extraction successful:`, estimateData);
    } catch (e: any) {
      console.error(`[${jobId}] processFilesAsync: Error extracting estimate data at step ${processingStep}:`, e);
      detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `Estimate extraction failed: ${e.message}`;
    }

    try {
      processingStep = 'roof_report_extraction';
      console.log(`[${jobId}] processFilesAsync: Attempting to extract roof data...`);
      logStreamer.logStep(jobId, processingStep, 'Extracting roof report PDF')
      roofData = await orchestrator.extractRoofData(roofReportBuffer);
      console.log(`[${jobId}] processFilesAsync: Roof data extraction successful:`, roofData);
    } catch (e: any) {
      console.error(`[${jobId}] processFilesAsync: Error extracting roof data at step ${processingStep}:`, e);
      detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `Roof report extraction failed: ${e.message}`;
    }

    if (estimateData && roofData) {
      try {
        processingStep = 'discrepancy_analysis';
        console.log(`[${jobId}] processFilesAsync: Attempting to analyze discrepancies...`);
        logStreamer.logStep(jobId, processingStep, 'Analyzing discrepancies')
        const analysisResult = await orchestrator.analyzeDiscrepancies(estimateData, roofData);
        console.log(`[${jobId}] processFilesAsync: Discrepancy analysis successful.`);
        
        processingStep = 'supplement_generation';
        console.log(`[${jobId}] processFilesAsync: Attempting to generate supplement items...`);
        logStreamer.logStep(jobId, processingStep, 'Generating supplement items')
        supplementItems = await orchestrator.generateSupplementItems(analysisResult);
        console.log(`[${jobId}] processFilesAsync: Supplement items generation successful. Count: ${supplementItems.length}`);
      } catch (e: any) {
        console.error(`[${jobId}] processFilesAsync: Error during analysis/supplement generation at step ${processingStep}:`, e);
        detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `Analysis/Supplement generation failed: ${e.message}`;
      }
    } else {
      processingStep = 'data_validation';
      const missingDataError = !estimateData && !roofData ? 'Both estimate and roof data extraction failed.' 
                             : !estimateData ? 'Estimate data extraction failed.' 
                             : 'Roof data extraction failed.';
      console.warn(`[${jobId}] processFilesAsync: Skipping analysis due to missing data: ${missingDataError}`);
      detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `${missingDataError} Cannot proceed with full analysis.`;
    }

    processingStep = 'job_data_insertion';
    console.log(`[${jobId}] processFilesAsync: Preparing to insert into job_data. Current error: ${detailedErrorMessage}`);
    logStreamer.logStep(jobId, processingStep, 'Saving job data to database')
    const jobDataToInsert = {
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
      error_message: detailedErrorMessage
    };
    console.log(`[${jobId}] processFilesAsync: Inserting into job_data:`, jobDataToInsert);
    const { error: dataError } = await supabase
      .from('job_data')
      .insert(jobDataToInsert);

    if (dataError) {
      console.error(`[${jobId}] processFilesAsync: DB error saving job_data at step ${processingStep}:`, dataError);
      currentStatus = 'failed';
      detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `DB save error (job_data): ${dataError.message}`;
    } else {
      console.log(`[${jobId}] processFilesAsync: Successfully inserted into job_data.`);
    }

    if (supplementItems.length > 0) {
      processingStep = 'supplement_items_insertion';
      console.log(`[${jobId}] processFilesAsync: Preparing to insert ${supplementItems.length} supplement items.`);
      logStreamer.logStep(jobId, processingStep, `Inserting ${supplementItems.length} supplement items`)
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
        console.error(`[${jobId}] processFilesAsync: DB error saving supplement_items at step ${processingStep}:`, supplementError);
        detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `DB save error (supplement_items): ${supplementError.message}`;
      } else {
        console.log(`[${jobId}] processFilesAsync: Successfully inserted supplement items.`);
      }
    }
    
    currentStatus = detailedErrorMessage ? 'failed' : 'completed';
    console.log(`[${jobId}] processFilesAsync: Determined final status: ${currentStatus} (Errors: ${detailedErrorMessage})`);
    
  } catch (e: any) {
    processingStep = 'unhandled_exception_block';
    console.error(`[${jobId}] processFilesAsync: UNHANDLED error in main try block at step ${processingStep}:`, e);
    logStreamer.logError(jobId, processingStep, e.message)
    currentStatus = 'failed';
    detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `Unhandled processing error: ${e.message}`;
    
    console.log(`[${jobId}] processFilesAsync: Attempting fallback job_data insert due to unhandled error.`);
    const { data: existingJobData } = await supabase.from('job_data').select('id').eq('job_id', jobId).maybeSingle();
    if (!existingJobData) {
      const { error: fallbackInsertError } = await supabase.from('job_data').insert({
        id: uuidv4(),
        job_id: jobId,
        error_message: detailedErrorMessage,
        property_address: 'N/A',
        claim_number: 'N/A',
        insurance_carrier: 'N/A'
      });
      if (fallbackInsertError) {
        console.error(`[${jobId}] processFilesAsync: Fallback job_data insert FAILED:`, fallbackInsertError);
      } else {
        console.log(`[${jobId}] processFilesAsync: Fallback job_data insert successful.`);
      }
    } else {
      console.log(`[${jobId}] processFilesAsync: Fallback job_data insert skipped, record already exists for this job.`);
    }
  } finally {
    processingStep = 'finally_block';
    const processingTime = Date.now() - startTime;
    console.log(`[${jobId}] processFilesAsync: Finally block. Status: ${currentStatus}, Error: ${detailedErrorMessage}`);
    logStreamer.logStep(jobId, processingStep, 'Finalizing job')

    try {
      await generateAndSaveReport(jobId, estimateData, roofData, supplementItems, currentStatus, detailedErrorMessage)
    } catch (reportErr) {
      console.error(`[${jobId}] processFilesAsync: Failed to generate report:`, reportErr)
    }

    // Always send job-completed event before updating database
    logStreamer.logStep(jobId, 'job-completed', `Job ${currentStatus}`)
    
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: currentStatus,
        processing_time_ms: processingTime,
        error_message: detailedErrorMessage
      })
      .eq('id', jobId);

    if (updateError) {
      console.error(`[${jobId}] processFilesAsync: CRITICAL - Failed to update final job status for ${jobId} to ${currentStatus}:`, updateError);
      // Still try to send the completion event even if DB update fails
      logStreamer.logError(jobId, 'job-update-failed', `Failed to update job status: ${updateError.message}`)
    } else {
      console.log(`[${jobId}] processFilesAsync: Successfully updated final job status for ${jobId} to ${currentStatus}.`);
      // Add a small delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log(`[${jobId}] processFilesAsync: Finished. Final Status: ${currentStatus}. Processing Time: ${processingTime}ms. Errors: ${detailedErrorMessage || 'None'}`);
  }
}