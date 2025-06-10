import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from '@/lib/supabase'
import { OrchestrationAgent } from '@/agents/OrchestrationAgent'
import { SupervisorAgent } from '@/agents/SupervisorAgent'
import { TaskContext, JobStatus, EstimateLineItem, GeneratedSupplementItem, OrchestrationOutput, SupervisorReport } from '@/agents/types'
import { logStreamer } from '@/lib/log-streamer'
import { SupplementItem, EstimateData, RoofData, LineItem } from '@/types'
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

    // Check if this is a rerun request
    const contentType = request.headers.get('content-type')
    let isRerun = false
    let jobId: string
    let estimateFile: File | null = null
    let roofReportFile: File | null = null

    if (contentType?.includes('application/json')) {
      // This is a rerun request - for now, return error as we don't store files
      return NextResponse.json(
        { error: 'Rerun functionality requires re-uploading files. Please upload the files again for reprocessing.' },
        { status: 400 }
      )
    } else {
      // This is a new file upload
      const formData = await request.formData()
      estimateFile = formData.get('estimate') as File
      roofReportFile = formData.get('roofReport') as File | null

      if (!estimateFile) {
        return NextResponse.json(
          { error: 'Estimate file is required' },
          { status: 400 }
        )
      }

      // Validate file types
      if (estimateFile.type !== 'application/pdf' || (roofReportFile && roofReportFile.type !== 'application/pdf')) {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        )
      }

      // Validate file sizes (Vercel limit is ~4.5MB per request)
      const maxFileSize = 2 * 1024 * 1024 // 2MB per file to be safe
      if (estimateFile.size > maxFileSize) {
        return NextResponse.json(
          { error: `Estimate file too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` },
          { status: 413 }
        )
      }
      if (roofReportFile && roofReportFile.size > maxFileSize) {
        return NextResponse.json(
          { error: `Roof report file too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` },
          { status: 413 }
        )
      }

      jobId = uuidv4()
    }

    const startTime = Date.now()

    const supabase = getSupabaseClient()

    const { error: jobError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        status: 'processing',
        created_at: new Date().toISOString()
      })

    if (jobError) {
      console.error('Database error creating job:', jobError)
      return NextResponse.json(
        { error: `Failed to create job record: ${jobError.message}` },
        { status: 500 }
      )
    }

    // Add immediate log to verify job creation
    logStreamer.logStep(jobId, 'job-creation-confirmed', `Job ${jobId} created successfully, starting processing`);
    console.log(`[API] Job ${jobId} created, about to start processing`);
    
    // Test LogStreamer immediately
    const testLog = logStreamer.getLogs(jobId);
    console.log(`[API] Immediate test: Job ${jobId} has ${testLog.length} logs after creation`);

    // Process synchronously to avoid serverless timeout issues
    console.log(`[${jobId}] Starting synchronous processing to avoid timeout`);
    
    try {
      await processFilesWithNewAgent(jobId, estimateFile, roofReportFile, startTime);
      console.log(`[${jobId}] Processing completed successfully`);
    } catch (error) {
      console.error(`[${jobId}] Processing failed:`, error);
      
      // Update job status to failed on error
      await getSupabaseClient()
        .from('jobs')
        .update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Processing failed' })
        .eq('id', jobId);
    }

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error('API error in POST /api/process:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

async function processFilesWithNewAgent(
  jobId: string,
  estimateFile: File,
  roofReportFile: File | null,
  startTime: number
) {
  console.log(`[${jobId}] processFilesWithNewAgent: ENTERED function`);
  try {
    console.log(`[${jobId}] processFilesWithNewAgent: Started.`);
    logStreamer.logStep(jobId, 'job-started', 'Job processing started with new agent system');
  
  // Add debug logging to see if logs are being created
  console.log(`[${jobId}] LogStreamer stats: `, {
    totalJobsTracked: logStreamer.getLogs(jobId).length,
    logStreamerInstance: !!logStreamer
  });
  
  // Verify logs are being stored correctly
  logStreamer.logStep(jobId, 'debug-log-test', `Testing log storage for job ${jobId}`);
  const testLogs = logStreamer.getLogs(jobId);
  console.log(`[${jobId}] Test logs count after adding test log: ${testLogs.length}`);
  const supabase = getSupabaseClient();
  let finalJobStatus: JobStatus = JobStatus.IN_PROGRESS;
  let detailedErrorMessage: string | null = null;
  let orchestrationOutput: OrchestrationOutput | null = null;
  let supervisionReport: SupervisorReport | null = null;

  try {
    logStreamer.logStep(jobId, 'buffer_conversion', 'Converting uploaded files to buffers');
    const estimatePdfBuffer = Buffer.from(await estimateFile.arrayBuffer());
    const roofReportPdfBuffer = roofReportFile ? Buffer.from(await roofReportFile.arrayBuffer()) : undefined;

    logStreamer.logStep(jobId, 'agent_initialization', 'Initializing OrchestrationAgent');
    const orchestrationAgent = new OrchestrationAgent();
    const agentConfig = orchestrationAgent.getConfig();

    const initialTaskContext: TaskContext = {
      jobId,
      taskId: uuidv4(),
      priority: 1,
      timeoutMs: agentConfig.defaultTimeout,
      maxRetries: agentConfig.maxRetries,
      retryCount: 0
    };

    logStreamer.logStep(jobId, 'orchestration_execute_start', 'Starting OrchestrationAgent.execute()');
    let orchestrationResult;
    try {
      orchestrationResult = await orchestrationAgent.execute(
        { estimatePdfBuffer, roofReportPdfBuffer, jobId },
        initialTaskContext
      );
      logStreamer.logStep(jobId, 'orchestration_execute_complete', 'OrchestrationAgent.execute() completed successfully');
    } catch (orchestrationError: any) {
      logStreamer.logError(jobId, 'orchestration_execute_failed', `OrchestrationAgent.execute() failed: ${orchestrationError.message}`);
      throw orchestrationError; // Re-throw to be caught by outer try-catch
    }
    orchestrationOutput = orchestrationResult.data;
    
    if (orchestrationOutput) {
        finalJobStatus = orchestrationOutput.status;
        detailedErrorMessage = orchestrationOutput.errors.join('; ');
    } else {
        finalJobStatus = JobStatus.FAILED;
        detailedErrorMessage = "Orchestration resulted in null output.";
        logStreamer.logError(jobId, 'orchestration_null_output', detailedErrorMessage);
    }

    if (finalJobStatus !== JobStatus.FAILED && orchestrationResult) {
        const supervisorAgent = new SupervisorAgent();
        const supervisorContext: TaskContext = {
            jobId,
            taskId: uuidv4(),
            parentTaskId: initialTaskContext.taskId,
            priority: 0,
            maxRetries: 0,
            retryCount: 0
        };
        logStreamer.logStep(jobId, 'supervision_start', 'SupervisorAgent processing started');
        const supervisionAgentResult = await supervisorAgent.execute({ jobId, orchestrationOutput }, supervisorContext);
        supervisionReport = supervisionAgentResult.data;

        if (supervisionReport) {
            logStreamer.logStep(jobId, 'supervision_complete', `SupervisorAgent finished. Outcome: ${supervisionReport.finalStatus}`);
            if (supervisionReport.overallConfidence < 0.5) {
                const confidenceWarning = `Low confidence (${(supervisionReport.overallConfidence * 100).toFixed(0)}%). Manual review recommended.`;
                if (supervisionReport.issuesToAddress && supervisionReport.issuesToAddress.length > 0) {
                    detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + "; " : "") + 
                                         confidenceWarning + " Issues: " + supervisionReport.issuesToAddress.join(", ");
                } else {
                    detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + "; " : "") + confidenceWarning;
                }
            }
        } else {
            logStreamer.logError(jobId, 'supervision_null_report', 'SupervisorAgent returned a null report.');
            detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + "; " : "") + "Supervision report unavailable.";
        }
    }

    logStreamer.logStep(jobId, 'database_save_start', 'Saving processed data to database');

    // Set job status to completed if we have successful orchestration output
    if (orchestrationOutput && finalJobStatus === JobStatus.IN_PROGRESS) {
        // If orchestration succeeded (at least partially) and we're still in progress, mark as completed
        if (orchestrationOutput.status === JobStatus.COMPLETED || 
            orchestrationOutput.status === JobStatus.FAILED_PARTIAL ||
            (orchestrationOutput.estimateExtraction && orchestrationOutput.estimateExtraction.data)) {
            finalJobStatus = JobStatus.COMPLETED;
            logStreamer.logStep(jobId, 'status_update', 'Job marked as completed with available data');
        }
    }

    // Prepare data for generateAndSaveReport and for job_data table (some fields overlap)
    const estimateDataForReport: EstimateData | null = orchestrationOutput?.estimateExtraction?.data ? 
      {
        propertyAddress: orchestrationOutput.estimateExtraction.data.propertyAddress?.value || undefined,
        claimNumber: orchestrationOutput.estimateExtraction.data.claimNumber?.value || undefined,
        insuranceCarrier: orchestrationOutput.estimateExtraction.data.insuranceCarrier?.value || undefined,
        dateOfLoss: orchestrationOutput.estimateExtraction.data.dateOfLoss?.value instanceof Date ? 
                        (orchestrationOutput.estimateExtraction.data.dateOfLoss.value as Date).toISOString() :
                        orchestrationOutput.estimateExtraction.data.dateOfLoss?.value as string | undefined,
        totalRCV: orchestrationOutput.estimateExtraction.data.totalRCV?.value ?? undefined,
        lineItems: orchestrationOutput.estimateExtraction.data.lineItems?.value?.map((item: EstimateLineItem): LineItem => ({
            description: item.description || 'N/A',
            quantity: typeof item.quantity === 'string' ? (parseFloat(item.quantity) || 0) : (item.quantity || 0), // Ensure number & default
            unit: item.unit || 'N/A',
            // category: item.category, // Not in DB LineItem
            // notes: item.notes, // Not in DB LineItem
            unitPrice: item.unitPrice === null ? undefined : item.unitPrice, // Handle null
            totalPrice: item.totalPrice === null ? undefined : item.totalPrice, // Handle null
            // code: undefined, // Assuming 'code' is optional and not present in EstimateLineItem from agent
        })) || [],
      } : null;

    const roofDataForReport: RoofData | null = orchestrationOutput?.roofReportExtraction?.data ? 
    {
        totalRoofArea: orchestrationOutput.roofReportExtraction.data.totalRoofArea?.value ?? undefined,
        eaveLength: orchestrationOutput.roofReportExtraction.data.eaveLength?.value ?? undefined,
        rakeLength: orchestrationOutput.roofReportExtraction.data.rakeLength?.value ?? undefined,
        ridgeHipLength: orchestrationOutput.roofReportExtraction.data.ridgeHipLength?.value ?? undefined,
        valleyLength: orchestrationOutput.roofReportExtraction.data.valleyLength?.value ?? undefined,
        stories: orchestrationOutput.roofReportExtraction.data.stories?.value ?? undefined,
        pitch: orchestrationOutput.roofReportExtraction.data.pitch?.value || undefined,
        propertyAddress: orchestrationOutput.estimateExtraction?.data?.propertyAddress?.value || undefined, // Get from estimate data
        totalFacets: orchestrationOutput.roofReportExtraction.data.facets?.value ?? undefined, // Add if it exists in agent type
    } : null;
    
    const supplementsForReport: SupplementItem[] = orchestrationOutput?.supplementGeneration?.data?.generatedSupplements.map(s => ({
      id: s.id || uuidv4(),
      job_id: jobId,
      line_item: s.description,
      xactimate_code: s.xactimateCode || undefined,
      quantity: typeof s.quantity === 'string' ? parseFloat(s.quantity) : s.quantity,
      unit: s.unit,
      reason: s.justification,
      confidence_score: s.confidence,
      calculation_details: s.sourceRecommendationId ? `Based on recommendation: ${s.sourceRecommendationId}` : (s.justification || 'Generated by agent')
    })) || [];

    // Call generateAndSaveReport with correctly typed data
    if (finalJobStatus !== JobStatus.FAILED && finalJobStatus !== JobStatus.CANCELLED) { // Or based on some other condition
        await generateAndSaveReport(
            jobId,
            estimateDataForReport,
            roofDataForReport,
            supplementsForReport,
            finalJobStatus.toString(),
            detailedErrorMessage
        );
    }

    const jobDataToInsert: any = {
      id: uuidv4(),
      job_id: jobId,
      property_address: estimateDataForReport?.propertyAddress || 'N/A',
      claim_number: estimateDataForReport?.claimNumber || 'N/A',
      insurance_carrier: estimateDataForReport?.insuranceCarrier || 'N/A',
      date_of_loss: estimateDataForReport?.dateOfLoss,
      total_rcv: estimateDataForReport?.totalRCV,
      total_acv: orchestrationOutput?.estimateExtraction?.data?.totalACV?.value,
      deductible: orchestrationOutput?.estimateExtraction?.data?.deductible?.value,
      roof_area_squares: roofDataForReport?.totalRoofArea,
      eave_length: roofDataForReport?.eaveLength,
      rake_length: roofDataForReport?.rakeLength,
      ridge_hip_length: roofDataForReport?.ridgeHipLength,
      valley_length: roofDataForReport?.valleyLength,
      stories: roofDataForReport?.stories,
      pitch: roofDataForReport?.pitch,
      estimate_confidence: orchestrationOutput?.estimateExtraction?.validation?.confidence,
      roof_report_confidence: orchestrationOutput?.roofReportExtraction?.validation?.confidence,
      supervisor_outcome: supervisionReport?.finalStatus,
      supervisor_recommendations: supervisionReport?.actionableSuggestions?.join('; '),
      error_message: detailedErrorMessage || null,
    };

    const { error: dataError } = await supabase.from('job_data').insert(jobDataToInsert);
    if (dataError) {
      console.error(`[${jobId}] DB error saving job_data:`, dataError);
      if (finalJobStatus !== JobStatus.FAILED) finalJobStatus = JobStatus.FAILED_PARTIAL;
      detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `DB save error (job_data): ${dataError.message}`;
    }

    const generatedSupplements = orchestrationOutput?.supplementGeneration?.data?.generatedSupplements;
    if (generatedSupplements && generatedSupplements.length > 0) {
      logStreamer.logStep(jobId, 'supplement_items_insertion', `Inserting ${generatedSupplements.length} supplement items`);
      
      // Delete any existing supplement items for this job to prevent duplicates
      await supabase.from('supplement_items').delete().eq('job_id', jobId);
      
      const supplementInserts = generatedSupplements.map((item: GeneratedSupplementItem) => ({
        id: uuidv4(), // Always generate new UUIDs to prevent conflicts
        job_id: jobId,
        line_item: item.description,
        xactimate_code: item.xactimateCode || undefined,
        quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity,
        unit: item.unit,
        reason: item.justification,
        confidence_score: item.confidence,
        calculation_details: item.sourceRecommendationId ? `Based on recommendation: ${item.sourceRecommendationId}` : (item.justification || 'Generated by agent')
      }));
      const { error: supplementError } = await supabase.from('supplement_items').insert(supplementInserts);
      if (supplementError) {
        console.error(`[${jobId}] DB error saving supplement_items:`, supplementError);
        if (finalJobStatus !== JobStatus.FAILED) finalJobStatus = JobStatus.FAILED_PARTIAL;
        detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `DB save error (supplement_items): ${supplementError.message}`;
      }
    }
    logStreamer.logStep(jobId, 'database_save_complete', 'Finished saving data to database');

  } catch (e: any) {
    console.error(`[${jobId}] UNHANDLED error in processFilesWithNewAgent:`, e);
    logStreamer.logError(jobId, 'unhandled_agent_exception', e.message)
    finalJobStatus = JobStatus.FAILED;
    detailedErrorMessage = (detailedErrorMessage ? detailedErrorMessage + '; ' : '') + `Critical agent processing error: ${e.message}`;
    
    try {
        const { data: existingJobData } = await supabase.from('job_data').select('id').eq('job_id', jobId).maybeSingle();
        if (!existingJobData) {
          const { error: fallbackInsertError } = await supabase.from('job_data').insert({
            id: uuidv4(), job_id: jobId, error_message: detailedErrorMessage,
            property_address: 'N/A', claim_number: 'N/A', insurance_carrier: 'N/A'
          });
          if (fallbackInsertError) {
            console.error(`[${jobId}] Fallback job_data insert FAILED:`, fallbackInsertError);
          }
        }
    } catch (dbCatchError) {
        console.error(`[${jobId}] Error during fallback job_data insert:`, dbCatchError);
    }
  } finally {
    const processingTime = Date.now() - startTime;
    logStreamer.logStep(jobId, 'job_finalizing', `Finalizing job. Status: ${finalJobStatus}`)

    // Map internal JobStatus enum to DB allowed status values
    const mapStatusForDb = (status: JobStatus): string => {
      switch (status) {
        case JobStatus.IN_PROGRESS:
        case JobStatus.PENDING:
          return 'processing';
        case JobStatus.COMPLETED:
        case JobStatus.FAILED_PARTIAL: // Treat partial failures as completed with warnings
          return 'completed';
        case JobStatus.FAILED:
        case JobStatus.CANCELLED:
        default:
          return 'failed';
      }
    };

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: mapStatusForDb(finalJobStatus),
        processing_time_ms: processingTime,
        error_message: detailedErrorMessage,
      })
      .eq('id', jobId);

    if (updateError) {
      console.error(`[${jobId}] CRITICAL - Failed to update final job status for ${jobId} to ${finalJobStatus}:`, updateError);
      logStreamer.logError(jobId, 'job-update-failed', `Failed to update job status: ${updateError.message}`)
    }
    
    logStreamer.logStep(jobId, 'job-completed', `Job ${finalJobStatus}. Processing time: ${processingTime}ms.`)
    console.log(`[${jobId}] processFilesWithNewAgent: Finished. Status: ${finalJobStatus}. Time: ${processingTime}ms. Errors: ${detailedErrorMessage || 'None'}`);
  }
  } catch (outerError: any) {
    console.error(`[${jobId}] FATAL ERROR in processFilesWithNewAgent wrapper:`, outerError);
    logStreamer.logError(jobId, 'fatal-wrapper-error', `Fatal error in processing wrapper: ${outerError.message}`);
    
    // Ensure job status is updated even if everything fails
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: `Fatal processing error: ${outerError.message}`,
          processing_time_ms: Date.now() - startTime
        })
        .eq('id', jobId);
    } catch (dbError) {
      console.error(`[${jobId}] Failed to update job status after fatal error:`, dbError);
    }
  }
}