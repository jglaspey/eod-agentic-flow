import { Agent } from './Agent';
import {
  AgentType,
  AgentConfig,
  AgentResult,
  AgentExecutionPlan,
  TaskContext,
  ValidationResult,
  EstimateFieldExtractions,
  RoofMeasurements,
  SupplementGenerationOutput,
  JobStatus,
  LogLevel,
  AIConfig,
  DiscrepancyReport,
  ExtractionStrategy,
  AgentTask,
  OrchestrationOutput
} from './types';
import { EstimateExtractorAgent } from './EstimateExtractorAgent';
import { RoofReportExtractorAgent } from './RoofReportExtractorAgent';
import { DiscrepancyAnalysisAgent } from './DiscrepancyAnalysisAgent';
import { SupplementGeneratorAgent } from './SupplementGeneratorAgent';
import { v4 as uuidv4 } from 'uuid';
import { logStreamer } from '@/lib/log-streamer'; // Import logStreamer
import { AIOrchestrator } from '@/lib/ai-orchestrator'; // Added
import { JobData, LineItem as DBLineItem, SupplementItem as DBSupplementItem } from '@/types'; // Added for DB types
import { getSupabaseClient } from '@/lib/supabase'; // Added for saving JobData

interface OrchestrationInput {
  estimatePdfBuffer: Buffer;
  roofReportPdfBuffer?: Buffer; // Optional, as some jobs might only have an estimate
  jobId: string; // Master job ID for tracking
  strategy?: ExtractionStrategy; // Optional overall strategy
  // Potentially add user preferences, specific instructions for this run, etc.
}

// The final output of the entire orchestration process
// OrchestrationOutput interface moved to types.ts

/**
 * OrchestrationAgent manages the overall workflow of document processing and supplement generation.
 * It coordinates EstimateExtractor, RoofReportExtractor, DiscrepancyAnalyzer, and SupplementGenerator agents.
 */
export class OrchestrationAgent extends Agent {
  constructor() {
    const config: AgentConfig = {
      name: 'OrchestrationAgent',
      version: '1.0.0',
      capabilities: ['workflow_management', 'task_distribution', 'result_aggregation', 'error_handling'],
      defaultTimeout: 300000, // 5 minutes for the entire orchestration process
      maxRetries: 0, // Orchestration itself usually shouldn't retry; sub-agents handle retries
      confidenceThreshold: 0.9, // High confidence required for the overall orchestration to be considered successful
      tools: ['agent_executor'] // Conceptual tool for running other agents
    };
    super(config);
  }

  get agentType(): AgentType {
    return AgentType.ORCHESTRATION_AGENT;
  }

  async plan(input: OrchestrationInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-orchestration', `Planning orchestration for job ${input.jobId}`, { parentTaskId: context.taskId });
    
    const tasks: AgentTask[] = [];
    const dependencies = new Map<string, string[]>();

    const estimateExtractionTask: AgentTask = {
      id: uuidv4(),
      type: 'extract_estimate_data',
      input: { pdfBuffer: input.estimatePdfBuffer, strategy: input.strategy || ExtractionStrategy.HYBRID, jobId: input.jobId },
      context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 1 },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    tasks.push(estimateExtractionTask);

    let roofReportExtractionTask: AgentTask | null = null;
    if (input.roofReportPdfBuffer) {
      roofReportExtractionTask = {
        id: uuidv4(),
        type: 'extract_roof_report_data',
        input: { pdfBuffer: input.roofReportPdfBuffer, strategy: input.strategy || ExtractionStrategy.HYBRID, jobId: input.jobId },
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 1 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      tasks.push(roofReportExtractionTask);
    }

    const discrepancyAnalysisTask: AgentTask = {
        id: uuidv4(),
        type: 'analyze_discrepancies',
        input: null, // Will be populated by prior tasks' outputs
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 2 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    tasks.push(discrepancyAnalysisTask);
    const discrepancyDeps = [estimateExtractionTask.id];
    if (roofReportExtractionTask) discrepancyDeps.push(roofReportExtractionTask.id);
    dependencies.set(discrepancyAnalysisTask.id, discrepancyDeps);

    const supplementGenerationTask: AgentTask = {
        id: uuidv4(),
        type: 'generate_supplements',
        input: null, // Will be populated by prior tasks' outputs
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 3 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    tasks.push(supplementGenerationTask);
    // Supplement generation depends on estimate extraction and discrepancy analysis. 
    // It can run even if roof report is missing, but discrepancy analysis would be minimal then.
    dependencies.set(supplementGenerationTask.id, [estimateExtractionTask.id, discrepancyAnalysisTask.id]);

    return {
      tasks,
      dependencies,
      estimatedDuration: 240000, // 4 minutes, accounting for multiple agent runs
      confidence: 0.95
    };
  }

  async act(input: OrchestrationInput, context: TaskContext): Promise<AgentResult<OrchestrationOutput>> {
    this.log(LogLevel.INFO, 'orchestration-start', `Starting orchestration for job ${input.jobId}`, { parentTaskId: context.taskId });
    logStreamer.logStep(input.jobId, 'orchestration_start', 'OrchestrationAgent processing started', {
      input: {
        jobId: input.jobId,
        hasEstimatePdf: !!input.estimatePdfBuffer,
        hasRoofReportPdf: !!input.roofReportPdfBuffer,
        strategy: input.strategy,
      },
      agentVersion: this.config.version
    });

    const output: OrchestrationOutput = {
      jobId: input.jobId,
      status: JobStatus.IN_PROGRESS,
      wasRoofReportProvided: !!input.roofReportPdfBuffer,
      errors: [],
      warnings: []
    };
    
    const supabase = getSupabaseClient(); // Added for saving

    try {
      // 1. Extract from Estimate PDF
      const estimateAgent = new EstimateExtractorAgent();
      const estimateTaskContext = { ...context, taskId: uuidv4(), jobId: input.jobId, priority: 1 };
      this.log(LogLevel.DEBUG, 'orchestration-run-estimate-agent', `Running EstimateExtractorAgent for job ${input.jobId}`, { context: estimateTaskContext });
      try {
        output.estimateExtraction = await estimateAgent.execute(
            { pdfBuffer: input.estimatePdfBuffer, strategy: input.strategy || ExtractionStrategy.HYBRID, jobId: input.jobId }, 
            estimateTaskContext
        );
        if (output.estimateExtraction.validation.confidence < estimateAgent.getConfig().confidenceThreshold) {
            this.log(LogLevel.WARN, 'low-estimate-confidence', `Estimate extraction confidence (${output.estimateExtraction.validation.confidence.toFixed(3)}) below threshold (${estimateAgent.getConfig().confidenceThreshold}).`, {jobId: input.jobId, agentType: this.agentType});
            output.warnings.push(`Low confidence in estimate extraction: ${output.estimateExtraction.validation.confidence.toFixed(3)}`);
        }
      } catch (err: any) {
        this.log(LogLevel.ERROR, 'estimate-extraction-failed-orchestration', `EstimateExtractorAgent failed: ${err.message}`, { jobId: input.jobId, error: err.toString(), agentType: this.agentType });
        output.errors.push(`Estimate extraction failed: ${err.message}`);
      }

      // 2. Extract from Roof Report PDF (if provided)
      this.log(LogLevel.DEBUG, 'roof-buffer-check', `Checking roof report buffer for job ${input.jobId}`, { 
        hasRoofBuffer: !!input.roofReportPdfBuffer, 
        bufferSize: input.roofReportPdfBuffer?.length || 0,
        agentType: this.agentType 
      });
      
      if (input.roofReportPdfBuffer) { 
        const roofReportAgent = new RoofReportExtractorAgent();
        const roofTaskContext = { ...context, taskId: uuidv4(), jobId: input.jobId, priority: 1 };
        this.log(LogLevel.DEBUG, 'orchestration-run-roof-agent', `Running RoofReportExtractorAgent for job ${input.jobId}`, { context: roofTaskContext });
        logStreamer.logStep(input.jobId, 'roof_extraction_start', 'Starting roof report extraction', { 
          bufferSize: input.roofReportPdfBuffer.length,
          strategy: input.strategy || ExtractionStrategy.HYBRID
        });
        try {
            output.roofReportExtraction = await roofReportAgent.execute(
                { pdfBuffer: input.roofReportPdfBuffer, strategy: input.strategy || ExtractionStrategy.HYBRID, jobId: input.jobId }, 
                roofTaskContext
            );
            logStreamer.logStep(input.jobId, 'roof_extraction_complete', 'Roof report extraction completed', {
              confidence: output.roofReportExtraction.validation.confidence,
              hasData: !!output.roofReportExtraction.data,
              roofArea: output.roofReportExtraction.data?.totalRoofArea?.value,
              eaveLength: output.roofReportExtraction.data?.eaveLength?.value
            });
            
            if (output.roofReportExtraction.validation.confidence < roofReportAgent.getConfig().confidenceThreshold) {
                this.log(LogLevel.WARN, 'low-roof-report-confidence', `Roof report extraction confidence (${output.roofReportExtraction.validation.confidence.toFixed(3)}) below threshold (${roofReportAgent.getConfig().confidenceThreshold}).`, {jobId: input.jobId, agentType: this.agentType});
                output.warnings.push(`Low confidence in roof report extraction: ${output.roofReportExtraction.validation.confidence.toFixed(3)}`);
            }
        } catch (err: any) {
            this.log(LogLevel.ERROR, 'roof-extraction-failed-orchestration', `RoofReportExtractorAgent failed: ${err.message}`, { jobId: input.jobId, error: err.toString(), agentType: this.agentType });
            output.errors.push(`Roof report extraction failed: ${err.message}`);
        }
      } else {
        this.log(LogLevel.INFO, 'skip-roof-report-extraction', 'No roof report PDF provided, skipping extraction.', { jobId: input.jobId, agentType: this.agentType });
        logStreamer.logStep(input.jobId, 'roof_extraction_skipped', 'No roof report PDF provided, skipping extraction');
      }

      // --- BEGIN NEW JobData Construction & Saving ---
      let fullJobData: JobData | null = null;
      let estimateLineItemsForSupplement: DBLineItem[] = [];

      if (output.estimateExtraction?.data) {
        // Map EstimateFieldExtractions to flat JobData
        const estimateData = output.estimateExtraction.data;
        const roofData = output.roofReportExtraction?.data; // Might be null

        // Extract and map line items from ExtractedField<EstimateLineItem[]> to DBLineItem[]
        if (estimateData.lineItems?.value) {
            estimateLineItemsForSupplement = estimateData.lineItems.value.map((item): DBLineItem => ({
                description: item.description || 'N/A',
                quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) : (item.quantity || 0),
                unit: item.unit || 'N/A',
                unitPrice: item.unitPrice === null || item.unitPrice === undefined ? undefined : item.unitPrice,
                totalPrice: item.totalPrice === null || item.totalPrice === undefined ? undefined : item.totalPrice,
                code: (item as any).code || undefined, // Attempt to map code if agent provides it, type cast to avoid lint error if not in EstimateLineItem strict type
            }));
        }
        
        // Construct the JobData object for saving
        const jobDataToSave: Partial<JobData> = {
          id: input.jobId, // PK for job_data table, assuming it's the same as jobs.id
          job_id: input.jobId, // FK to jobs table
          // From Estimate
          property_address: estimateData.propertyAddress?.value || undefined,
          claim_number: estimateData.claimNumber?.value || undefined,
          insurance_carrier: estimateData.insuranceCarrier?.value || undefined,
          date_of_loss: estimateData.dateOfLoss?.value ? new Date(estimateData.dateOfLoss.value).toISOString() : undefined,
          total_rcv: estimateData.totalRCV?.value || undefined,
          total_acv: estimateData.totalACV?.value || undefined,
          deductible: estimateData.deductible?.value || undefined,
          // From Roof Report (if available)
          roof_area_squares: roofData?.totalRoofArea?.value || undefined,
          eave_length: roofData?.eaveLength?.value || estimateData.eaveLength?.value || undefined,
          rake_length: roofData?.rakeLength?.value || estimateData.rakeLength?.value || undefined,
          ridge_hip_length: roofData?.ridgeHipLength?.value || estimateData.ridgeAndHipLength?.value || undefined,
          valley_length: roofData?.valleyLength?.value || estimateData.valleyLength?.value || undefined,
          stories: roofData?.stories?.value || estimateData.stories?.value || undefined,
          pitch: roofData?.pitch?.value || estimateData.pitch?.value || undefined,
          // estimate_confidence, roof_report_confidence, supervisor_outcome etc. are in JobData type
          // and should be populated by the SupervisorAgent or later in the process if not here.
        };

        logStreamer.logStep(input.jobId, 'job_data_save_start', 'Attempting to save constructed JobData.', { jobData: jobDataToSave });
        const { data: savedJobData, error: jobDataSaveError } = await supabase
          .from('job_data')
          .upsert(jobDataToSave, { onConflict: 'id' }) // Upsert based on job ID
          .select()
          .single();

        if (jobDataSaveError) {
          this.log(LogLevel.ERROR, 'job-data-save-failed', `Failed to save JobData: ${jobDataSaveError.message}`, { jobId: input.jobId, error: jobDataSaveError });
          output.errors.push(`Failed to save core job data: ${jobDataSaveError.message}`);
          // Decide if this is a critical failure for the entire orchestration
        } else {
          this.log(LogLevel.SUCCESS, 'job-data-save-success', 'JobData saved successfully.', { jobId: input.jobId, savedData: savedJobData });
          fullJobData = savedJobData as JobData; // Cast to full JobData
        }
      } else {
          this.log(LogLevel.WARN, 'skip-job-data-save-no-estimate', 'Skipping JobData save as estimate extraction failed or produced no data.', { jobId: input.jobId });
          output.errors.push('Skipped JobData save: Estimate data unavailable.');
      }
      // --- END NEW JobData Construction & Saving ---

      // 3. Discrepancy Analysis
      // Runs if estimate data is available. Handles null roof data internally.
      if (output.estimateExtraction?.data) {
        const discrepancyAgent = new DiscrepancyAnalysisAgent();
        const discrepancyTaskContext = { ...context, taskId: uuidv4(), jobId: input.jobId, priority: 2 };
        this.log(LogLevel.DEBUG, 'orchestration-run-discrepancy-agent', `Running DiscrepancyAnalysisAgent for job ${input.jobId}`, { context: discrepancyTaskContext });
        try {
            output.discrepancyAnalysis = await discrepancyAgent.execute(
                { 
                    jobId: input.jobId,
                    estimateData: output.estimateExtraction.data, 
                    roofData: output.roofReportExtraction?.data || null 
                }, 
                discrepancyTaskContext
            );
            if (output.discrepancyAnalysis.validation.confidence < discrepancyAgent.getConfig().confidenceThreshold) {
                this.log(LogLevel.WARN, 'low-discrepancy-analysis-confidence', `Discrepancy analysis confidence (${output.discrepancyAnalysis.validation.confidence.toFixed(3)}) below threshold (${discrepancyAgent.getConfig().confidenceThreshold}).`, {jobId: input.jobId, agentType: this.agentType});
                output.warnings.push(`Low confidence in discrepancy analysis: ${output.discrepancyAnalysis.validation.confidence.toFixed(3)}`);
            }
        } catch (err: any) {
            this.log(LogLevel.ERROR, 'discrepancy-analysis-failed-orchestration', `DiscrepancyAnalysisAgent failed: ${err.message}`, { jobId: input.jobId, error: err.toString(), agentType: this.agentType });
            output.errors.push(`Discrepancy analysis failed: ${err.message}`);
        }
      } else {
        this.log(LogLevel.WARN, 'skip-discrepancy-analysis-no-estimate', 'Skipping discrepancy analysis as estimate extraction failed or produced no data.', { jobId: input.jobId, agentType: this.agentType });
        output.errors.push('Skipped discrepancy analysis: Estimate data unavailable.');
      }

      // 4. Supplement Generation
      // Runs if estimate data is available. Handles null roof/discrepancy data internally.
      if (output.estimateExtraction?.data && fullJobData) { // Ensure fullJobData is available
        const supplementAgent = new SupplementGeneratorAgent();
        const supplementTaskContext = { ...context, taskId: uuidv4(), jobId: input.jobId, priority: 3 };
        this.log(LogLevel.DEBUG, 'orchestration-run-supplement-agent', `Running SupplementGeneratorAgent for job ${input.jobId}`, { context: supplementTaskContext });
        try {
            output.supplementGeneration = await supplementAgent.execute(
                { 
                    jobId: input.jobId,
                    // The following lines are intentionally commented out as these specific structures
                    // might not be directly needed if SupplementGeneratorAgent primarily uses
                    // the new jobData and actualEstimateLineItems for AIOrchestrator.
                    // estimateExtractionData: output.estimateExtraction.data, 
                    // roofReportData: output.roofReportExtraction?.data || null, 
                    // discrepancyReport: output.discrepancyAnalysis?.data || null,
                    // estimateLineItems: output.estimateExtraction.data.lineItems, 
                    
                    // --- NEW INPUTS for AIOrchestrator powered SupplementGeneratorAgent ---
                    jobData: fullJobData, // Pass the fully constructed and saved JobData
                    actualEstimateLineItems: estimateLineItemsForSupplement, // Pass the DBLineItem[]
                }, 
                supplementTaskContext
            );
            if (output.supplementGeneration.validation.confidence < supplementAgent.getConfig().confidenceThreshold) {
                this.log(LogLevel.WARN, 'low-supplement-generation-confidence', `Supplement generation confidence (${output.supplementGeneration.validation.confidence.toFixed(3)}) below threshold (${supplementAgent.getConfig().confidenceThreshold}).`, {jobId: input.jobId, agentType: this.agentType});
                output.warnings.push(`Low confidence in supplement generation: ${output.supplementGeneration.validation.confidence.toFixed(3)}`);
            }
            // TODO: output.finalSupplementText could be populated here if SupplementGenerationOutput provides a combined text.
        } catch (err: any) {
            this.log(LogLevel.ERROR, 'supplement-generation-failed-orchestration', `SupplementGeneratorAgent failed: ${err.message}`, { jobId: input.jobId, error: err.toString(), agentType: this.agentType });
            output.errors.push(`Supplement generation failed: ${err.message}`);
        }
      } else {
         this.log(LogLevel.WARN, 'skip-supplement-generation-no-estimate', 'Skipping supplement generation as estimate extraction failed or produced no data.', { jobId: input.jobId, agentType: this.agentType });
         output.errors.push('Skipped supplement generation: Estimate data unavailable.');
      }
      
      // Determine final status
      const hasCriticalErrors = output.errors.some(e => !e.toLowerCase().startsWith('low confidence'));

      if (!hasCriticalErrors && output.estimateExtraction?.data) {
        // Only low-confidence messages present → treat as completed with warnings
        output.status = JobStatus.COMPLETED;
      } else if (output.estimateExtraction?.data) { // Has data, but also critical errors
        output.status = JobStatus.FAILED_PARTIAL;
      } else {
        // If estimate extraction itself failed to produce data, it's a hard failure for the job.
        output.status = JobStatus.FAILED;
        if (!output.errors.some(e => e.startsWith('Estimate extraction failed'))) {
            output.errors.push('Critical failure: Estimate data could not be extracted.');
        }
      }

      this.log(LogLevel.INFO, 'orchestration-complete', `Orchestration finished for job ${input.jobId} with status ${output.status}`, { parentTaskId: context.taskId, finalStatus: output.status });
      logStreamer.logStep(input.jobId, 'orchestration_complete', `OrchestrationAgent processing finished with status: ${output.status}`, {
        outputSummary: {
          jobId: output.jobId,
          status: output.status,
          wasRoofReportProvided: output.wasRoofReportProvided,
          estimateExtractionConfidence: output.estimateExtraction?.validation.confidence,
          roofReportExtractionConfidence: output.roofReportExtraction?.validation.confidence,
          discrepancyAnalysisConfidence: output.discrepancyAnalysis?.validation.confidence,
          supplementGenerationConfidence: output.supplementGeneration?.validation.confidence,
          errorCount: output.errors.length,
          firstError: output.errors[0]
        },
        // Consider conditionally adding full output data if it's not too large
        // fullOutput: output // Potentially very large, use with caution
      });

    } catch (err: any) {
      this.log(LogLevel.ERROR, 'orchestration-critical-failure', `Orchestration critical failure for job ${input.jobId}: ${err.message}`, { parentTaskId: context.taskId, error: err.toString() });
      output.status = JobStatus.FAILED;
      output.errors.push(`Critical orchestration failure: ${err.message}`);
      logStreamer.logError(input.jobId, 'orchestration_critical_failure', `OrchestrationAgent critical failure: ${err.message}`, { error: err.toString() });
    }
    
    const validation = await this.validate(output, context);

    return {
      data: output,
      validation: validation, // Validate the overall orchestration outcome
      processingTimeMs: 0, // Set by base Agent
      model: 'multi_agent_system'
    };
  }

  async validate(result: OrchestrationOutput, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-orchestration', `Validating orchestration output for job ${result.jobId}`, { parentTaskId: context.taskId });
    const errors: string[] = [...result.errors]; // Start with errors collected during 'act'
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 0.0;
    const confidenceFactors: number[] = [];

    if (!result.jobId) errors.push('Job ID is missing from orchestration output.');
    if (!result.status) errors.push('Job status is missing from orchestration output.');

    if (result.status === JobStatus.FAILED) {
      confidence = 0.05;
      if (!result.errors.length) errors.push('Job status is FAILED but no errors were reported.');
    } else if (result.status === JobStatus.FAILED_PARTIAL) {
      confidence = 0.3;
      if (!result.errors.length) warnings.push('Job status is FAILED_PARTIAL but no errors were reported.');
    } else if (result.status === JobStatus.COMPLETED) {
      confidence = 0.7; // Base for completed
    }

    if (result.estimateExtraction?.validation.confidence) confidenceFactors.push(result.estimateExtraction.validation.confidence);
    if (result.roofReportExtraction?.validation.confidence) confidenceFactors.push(result.roofReportExtraction.validation.confidence);
    if (result.discrepancyAnalysis?.validation.confidence) confidenceFactors.push(result.discrepancyAnalysis.validation.confidence);
    if (result.supplementGeneration?.validation.confidence) confidenceFactors.push(result.supplementGeneration.validation.confidence);

    if (confidenceFactors.length > 0) {
        const avgSubAgentConfidence = confidenceFactors.reduce((sum, val) => sum + val, 0) / confidenceFactors.length;
        confidence = (confidence + avgSubAgentConfidence) / 2; // Blend orchestrator status confidence with sub-agent confidence
    } else if (result.status === JobStatus.COMPLETED) {
        warnings.push('Orchestration COMPLETED, but no sub-agent confidence scores were available to confirm quality.');
        confidence = Math.min(confidence, 0.5);
    }

    if (!result.estimateExtraction?.data && result.status !== JobStatus.FAILED) {
      errors.push('Estimate extraction data is missing, but job is not marked as FAILED.');
      confidence = Math.min(confidence, 0.1);
    }

    if (result.wasRoofReportProvided && !result.roofReportExtraction?.data && result.status !== JobStatus.FAILED && result.status !== JobStatus.FAILED_PARTIAL) {
        warnings.push('Roof report was provided, but no extraction data is present, and job is not FAILED/FAILED_PARTIAL. Check logs.');
        confidence = Math.min(confidence, 0.4);
    }
    if (result.estimateExtraction?.data && !result.discrepancyAnalysis?.data && result.status !== JobStatus.FAILED && result.status !== JobStatus.FAILED_PARTIAL) {
        // This might be okay if there was no roof report, discrepancy agent might not produce much.
        // However, it should still produce *some* report (even if minimal).
        warnings.push('Discrepancy analysis was expected to run, but no data is present. Check logs.');
        confidence = Math.min(confidence, 0.5);
    }
    // Condition for supplement generation warning: if estimate data exists and supplement step was expected to run but didn't produce data.
    if (result.estimateExtraction?.data && !result.supplementGeneration?.data && result.status !== JobStatus.FAILED && result.status !== JobStatus.FAILED_PARTIAL) {
        warnings.push('Supplement generation was expected to run, but no data is present. Check logs.');
        confidence = Math.min(confidence, 0.4);
    }

    if (result.errors.length > 0) {
        suggestions.push(`Job ${result.jobId} encountered ${result.errors.length} error(s)/low-confidence step(s). Please review the logs and errors array for details.`);
        if (result.status === JobStatus.COMPLETED) {
            warnings.push('Job marked COMPLETED but contains errors/warnings in the log. Review recommended.');
            confidence = Math.min(confidence, 0.6);
        }
    }

    return {
      isValid: errors.length === 0, // Orchestration is valid if it ran and produced some output, even with partial failures
      confidence: Math.max(0.05, Math.min(0.95, confidence)),
      errors,
      warnings,
      suggestions
    };
  }
  
  // No direct AI calls for OrchestrationAgent itself, so getAIConfigs/callAI might not be used or needed.
} 