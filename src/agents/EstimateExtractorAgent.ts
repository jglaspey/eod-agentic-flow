import { Agent } from './Agent'
import { 
  AgentType, 
  AgentConfig, 
  AgentResult, 
  AgentExecutionPlan, 
  TaskContext, 
  ValidationResult,
  EstimateFieldExtractions,
  ExtractedField,
  ExtractionStrategy,
  LogLevel,
  AIConfig
} from './types'
import { PDFProcessor } from '@/lib/pdf-processor'
import { PDFToImagesTool } from '@/tools/pdf-to-images'
import { VisionModelProcessor, VisionModelConfig } from '@/tools/vision-models'
import { getSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import { OpenAI } from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'
import { logStreamer } from '@/lib/log-streamer'

interface EstimateExtractionInput {
  pdfBuffer: Buffer
  strategy?: ExtractionStrategy
  jobId?: string
}

/**
 * Specialized agent for extracting data from insurance estimate PDFs
 * Uses text extraction first, falls back to vision models for scanned PDFs
 */
export class EstimateExtractorAgent extends Agent {
  private visionProcessor: VisionModelProcessor
  private supabase = getSupabaseClient()
  public openai: OpenAI | null = null
  public anthropic: Anthropic | null = null
  private mistralApiKey: string | null = null

  constructor() {
    const config: AgentConfig = {
      name: 'EstimateExtractorAgent',
      version: '1.0.0',
      capabilities: ['text_extraction', 'vision_processing', 'field_validation'],
      defaultTimeout: 15000, // Reduced from 60s to 15s for serverless
      maxRetries: 1, // Reduced from 2 to 1 for speed
      confidenceThreshold: 0.7,
      tools: ['pdf_processor', 'pdf_to_images', 'vision_models']
    }
    
    super(config)
    this.visionProcessor = new VisionModelProcessor()

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    }
    
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      })
    }

    // Initialize Mistral API key for OCR processing
    if (process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY !== 'your_mistral_api_key_here') {
      this.mistralApiKey = process.env.MISTRAL_API_KEY
    }
  }

  get agentType(): AgentType {
    return AgentType.ESTIMATE_EXTRACTOR
  }

  async plan(input: EstimateExtractionInput, context: TaskContext): Promise<AgentExecutionPlan> {
    const jobId = input.jobId || context.jobId;
    logStreamer.logDebug(jobId, 'estimate_extractor_plan', 'EstimateExtractorAgent.plan() starting', { strategy: input.strategy, hasPdfBuffer: !!input.pdfBuffer });
    
    const tasks = [
      {
        id: uuidv4(),
        type: 'extract_text',
        input: input.pdfBuffer,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        type: 'extract_fields_text',
        input: null,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    if (input.strategy === ExtractionStrategy.VISION_ONLY || 
        input.strategy === ExtractionStrategy.HYBRID ||
        input.strategy === ExtractionStrategy.FALLBACK) {
      tasks.push({
        id: uuidv4(),
        type: 'extract_fields_vision',
        input: input.pdfBuffer,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    const dependencies = new Map<string, string[]>()
    dependencies.set(tasks[1].id, [tasks[0].id])
    if (tasks.length > 2) {
    }

    const plan = {
      tasks,
      dependencies,
      estimatedDuration: 30000,
      confidence: 0.8
    };
    
    logStreamer.logDebug(jobId, 'estimate_extractor_plan_complete', 'EstimateExtractorAgent.plan() completed', { taskCount: tasks.length, estimatedDuration: plan.estimatedDuration });
    return plan;
  }

  async act(input: EstimateExtractionInput, context: TaskContext): Promise<AgentResult<EstimateFieldExtractions>> {
    const jobId = input.jobId || context.jobId;
    console.log(`[${jobId}] EstimateExtractorAgent.act: STARTING`);

    this.log(LogLevel.INFO, 'estimate_extraction_start', `EstimateExtractorAgent processing started for job ${jobId}`, { strategy: input.strategy });
    logStreamer.logStep(jobId, 'estimate_extraction_start', 'EstimateExtractorAgent processing started', { strategy: input.strategy });
    
    let textExtractionResult: string = ''
    let textConfidence = 0
    let textResults: EstimateFieldExtractions | null = null
    let visionResults: EstimateFieldExtractions | null = null
    
    try {
      if (!input.pdfBuffer) {
        logStreamer.logStep(jobId, 'estimate_pdf_missing_warning', 'WARNING: No PDF buffer provided to EstimateExtractorAgent');
        this.log(LogLevel.WARN, 'estimate_pdf_missing', 'No PDF buffer provided.');
        throw new Error('No PDF buffer provided for estimate extraction.');
      }
      
      logStreamer.logDebug(jobId, 'estimate_extractor_pdf_received', 'PDF buffer received for processing', { bufferSize: input.pdfBuffer.length });

      this.log(LogLevel.DEBUG, 'text-extraction', 'Extracting text from PDF', { taskId: context.taskId })
      logStreamer.logDebug(jobId, 'pdf_text_extraction_start', 'Starting PDF text extraction', { taskId: context.taskId });
      console.log(`[${jobId}] EstimateExtractorAgent.act: About to call PDFProcessor.extractText`);
      
      textExtractionResult = await PDFProcessor.extractText(input.pdfBuffer)
      console.log(`[${jobId}] EstimateExtractorAgent.act: PDFProcessor.extractText completed, text length: ${textExtractionResult.length}`);
      textConfidence = this.calculateTextQuality(textExtractionResult)
      
      logStreamer.logDebug(jobId, 'pdf_text_extraction_complete', 'PDF text extraction completed', { 
        textLength: textExtractionResult.length,
        textQuality: textConfidence,
        taskId: context.taskId 
      });
      
      this.log(LogLevel.INFO, 'text-extracted', 
        `Text extraction completed. Quality score: ${textConfidence.toFixed(3)}`,
        { textLength: textExtractionResult.length, quality: textConfidence, taskId: context.taskId }
      )

      // Use lower threshold if vision processing is not available to be more permissive
      const minTextConfidence = (input.strategy === ExtractionStrategy.HYBRID || input.strategy === ExtractionStrategy.FALLBACK) ? 0.1 : 0.3;
      
      if (textConfidence > minTextConfidence && 
          (input.strategy === ExtractionStrategy.TEXT_ONLY || 
           input.strategy === ExtractionStrategy.HYBRID || 
           input.strategy === ExtractionStrategy.FALLBACK)) {
        this.log(LogLevel.DEBUG, 'field-extraction-text', 'Extracting fields from text', { taskId: context.taskId })
        logStreamer.logDebug(jobId, 'text_field_extraction_start', 'Starting field extraction from text', { textQuality: textConfidence, strategy: input.strategy });
        
        try {
          console.log(`[${jobId}] EstimateExtractorAgent.act: About to call extractFieldsFromText`);
          textResults = await this.extractFieldsFromText(textExtractionResult, context)
          console.log(`[${jobId}] EstimateExtractorAgent.act: extractFieldsFromText completed successfully`);
          logStreamer.logDebug(jobId, 'text_field_extraction_success', 'Field extraction from text completed', { 
            extractedFields: Object.keys(textResults).length,
            overallConfidence: this.getOverallConfidence(textResults)
          });
        } catch (textError) {
          this.log(LogLevel.WARN, 'text-extraction-error', `Field extraction from text failed: ${textError}`, { taskId: context.taskId, error: textError })
          logStreamer.logError(jobId, 'text_field_extraction_error', `Field extraction from text failed: ${textError}`, { error: textError });
        }
      } else {
        logStreamer.logDebug(jobId, 'text_field_extraction_skipped', 'Skipping text field extraction', { 
          textQuality: textConfidence, 
          strategy: input.strategy,
          minTextConfidence: minTextConfidence,
          reason: textConfidence <= minTextConfidence ? 'Low text quality' : 'Strategy does not include text extraction'
        });
      }

      const shouldUseMistralOCR = (
        input.strategy === ExtractionStrategy.VISION_ONLY ||
        input.strategy === ExtractionStrategy.HYBRID ||
        (input.strategy === ExtractionStrategy.FALLBACK && (!textResults || this.getOverallConfidence(textResults) < this.config.confidenceThreshold))
      )

      if (shouldUseMistralOCR) {
        logStreamer.logDebug(jobId, 'mistral_ocr_check', 'Checking Mistral OCR extraction availability', { shouldUseMistralOCR, strategy: input.strategy });
        
        // Try Mistral OCR first (works in serverless environment)
        if (this.isMistralOCRAvailable()) {
          this.log(LogLevel.INFO, 'mistral-ocr-extraction', 'Using Mistral OCR for PDF extraction', { taskId: context.taskId })
          logStreamer.logStep(jobId, 'mistral_ocr_extraction_start', 'Starting Mistral OCR-based field extraction', { taskId: context.taskId });
          
          try {
            visionResults = await this.extractFieldsFromMistralOCR(input.pdfBuffer, context)
            logStreamer.logDebug(jobId, 'mistral_ocr_extraction_success', 'Mistral OCR field extraction completed', { 
              extractedFields: visionResults ? Object.keys(visionResults as object).length : 0,
              overallConfidence: visionResults ? this.getOverallConfidence(visionResults) : 0
            });
          } catch (mistralError) {
            this.log(LogLevel.WARN, 'mistral-ocr-extraction-error', `Field extraction from Mistral OCR failed: ${mistralError}`, { taskId: context.taskId, error: mistralError })
            logStreamer.logError(jobId, 'mistral_ocr_extraction_error', `Field extraction from Mistral OCR failed: ${mistralError}`, { error: mistralError });
          }
        } else {
          this.log(LogLevel.WARN, 'mistral-ocr-unavailable', 'Mistral OCR requested but not configured', { taskId: context.taskId })
          logStreamer.logStep(jobId, 'mistral_ocr_extraction_unavailable', 'Mistral OCR unavailable - API key not configured', { 
            reason: 'Mistral API key not available or not configured'
          });
        }
      } else {
        logStreamer.logDebug(jobId, 'mistral_ocr_extraction_skipped', 'Mistral OCR extraction not needed for this strategy', { strategy: input.strategy });
      }

      if (!textResults && !visionResults) {
        this.log(LogLevel.WARN, 'extraction-failed-fallback', 'Both text and vision extraction failed, creating fallback results', { taskId: context.taskId });
        logStreamer.logStep(jobId, 'extraction_failed_fallback', 'Both text and vision extraction failed, creating fallback results');
        
        // Create minimal fallback results instead of failing completely
        const emptyField = (rationale: string) => this.createExtractedField(null, 0.1, rationale, 'fallback');
        const finalResults = {
          propertyAddress: emptyField('Extraction failed - no data available'),
          claimNumber: emptyField('Extraction failed - no data available'),
          insuranceCarrier: emptyField('Extraction failed - no data available'),
          dateOfLoss: emptyField('Extraction failed - no data available'),
          totalRCV: this.createExtractedField(0, 0.1, 'Extraction failed - no data available', 'fallback'),
          totalACV: this.createExtractedField(0, 0.1, 'Extraction failed - no data available', 'fallback'),
          deductible: this.createExtractedField(0, 0.1, 'Extraction failed - no data available', 'fallback'),
          lineItems: this.createExtractedField([], 0.1, 'Extraction failed - no data available', 'fallback'),
        };
        
        return {
          data: finalResults,
          validation: await this.validate(finalResults, context),
          processingTimeMs: 0,
          model: 'fallback'
        }
      }
      const finalResults = this.combineExtractionResults(textResults, visionResults, textConfidence)
      
      const overallConfidence = this.getOverallConfidence(finalResults)
      this.log(LogLevel.SUCCESS, 'extraction-complete', 
        `Extraction completed with overall confidence: ${overallConfidence.toFixed(3)}`,
        { taskId: context.taskId, overallConfidence }
      )
      
      // Determine extraction method used
      const extractionMethod = visionResults && textResults ? 'hybrid' : 
                              visionResults ? (visionResults.propertyAddress?.rationale?.includes('Mistral OCR') ? 'mistral-ocr' : 'vision') : 
                              'text'
      
      logStreamer.logStep(jobId, 'estimate_extraction_complete', 
        `EstimateExtractorAgent processing finished. Overall confidence: ${overallConfidence.toFixed(3)}`, 
        {
          outputSummary: {
            overallConfidence: overallConfidence,
            propertyAddress: finalResults.propertyAddress?.value,
            claimNumber: finalResults.claimNumber?.value,
            insuranceCarrier: finalResults.insuranceCarrier?.value,
            totalRCV: finalResults.totalRCV?.value,
            totalACV: finalResults.totalACV?.value,
            deductible: finalResults.deductible?.value,
            lineItemCount: finalResults.lineItems?.value?.length,
            usedMistralOCR: extractionMethod === 'mistral-ocr',
            usedVision: extractionMethod === 'vision',
            usedText: !!textResults,
            textQuality: textConfidence,
            extractionMethod: extractionMethod
          },
          taskId: context.taskId,
          // finalResults: finalResults // Potentially large, consider sampling or summarizing further
        }
      );

      return {
        data: finalResults,
        validation: await this.validate(finalResults, context),
        processingTimeMs: 0,
        model: extractionMethod
      }

    } catch (error: any) {
      this.log(LogLevel.ERROR, 'estimate_extraction_error', `Error during estimate extraction for job ${jobId}: ${error.message}`, { stack: error.stack, jobId });
      logStreamer.logError(jobId, 'estimate_extraction_error', `Error in EstimateExtractorAgent: ${error.message}`, { stack: error.stack });
      throw error
    }
  }

  async validate(result: EstimateFieldExtractions, context: TaskContext): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    if (!result.propertyAddress?.value || result.propertyAddress.value.length < 10) {
      errors.push('Property address is missing or too short')
    } else if (result.propertyAddress.value && !this.isValidAddress(result.propertyAddress.value)) {
      warnings.push('Property address format may be incorrect')
    }

    if (!result.claimNumber?.value) {
      errors.push('Claim number is missing')
    } else if (result.claimNumber.value && !this.isValidClaimNumber(result.claimNumber.value)) {
      warnings.push('Claim number format may be incorrect')
    }

    if (!result.insuranceCarrier?.value) {
      warnings.push('Insurance carrier is missing')
    }

    if (result.totalRCV?.value === null || result.totalRCV?.value === undefined || result.totalRCV.value <= 0) {
      warnings.push('Total RCV amount is missing or invalid')
    } else if (result.totalRCV.value > 1000000) {
      warnings.push('Total RCV amount seems unusually high ($${result.totalRCV.value})')
    }
    
    if (!result.lineItems?.value || result.lineItems.value.length === 0) {
      warnings.push('No line items extracted. This is unusual and might indicate an issue.')
    }

    const overallConfidence = this.getOverallConfidence(result)
    
    if (overallConfidence < this.config.confidenceThreshold) {
      warnings.push(`LOW CONFIDENCE: Overall confidence (${overallConfidence.toFixed(2)}) is below threshold (${this.config.confidenceThreshold}). Data is displayed but manual review strongly recommended.`)
    }
    
    if (result.lineItems?.source === 'vision' || (!result.lineItems?.value && result.totalRCV?.value && result.totalRCV.value > 0) ){
        suggestions.push('Line items may be incomplete or missing. Consider re-processing with vision or manual review if critical.')
    }

    return {
      isValid: errors.length === 0,
      confidence: overallConfidence,
      errors,
      warnings,
      suggestions
    }
  }

  public async extractFieldsFromText(text: string, context: TaskContext): Promise<EstimateFieldExtractions> {
    const jobId = context.jobId;
    logStreamer.logDebug(jobId, 'extract_fields_from_text_start', 'EstimateExtractorAgent.extractFieldsFromText() starting', { 
      textLength: text.length, 
      taskId: context.taskId 
    });
    
    this.log(LogLevel.DEBUG, 'ai-extraction-text-start', 'Starting AI field extraction from text', { taskId: context.taskId })
    
    const fieldConfigs = await this.getAIConfigs([
      'extract_estimate_address',
      'extract_estimate_claim', 
      'extract_estimate_carrier',
      'extract_estimate_rcv',
      'extract_estimate_acv',
      'extract_estimate_deductible',
      'extract_estimate_date_of_loss'
    ])

    // Extract fields sequentially to avoid rate limits and timeouts
    logStreamer.logDebug(jobId, 'sequential_field_extraction_start', 'Starting sequential field extraction', { fieldCount: 7 });
    console.log(`[${jobId}] EstimateExtractorAgent.extractFieldsFromText: About to start sequential field extraction`);
    
    const address = await this.extractSingleField('propertyAddress', text, fieldConfigs.extract_estimate_address, context);
    console.log(`[${jobId}] Field 1/7 completed: propertyAddress`);
    
    const claimNumber = await this.extractSingleField('claimNumber', text, fieldConfigs.extract_estimate_claim, context);
    console.log(`[${jobId}] Field 2/7 completed: claimNumber`);
    
    const carrier = await this.extractSingleField('insuranceCarrier', text, fieldConfigs.extract_estimate_carrier, context);
    console.log(`[${jobId}] Field 3/7 completed: insuranceCarrier`);
    
    const rcv = await this.extractSingleField('totalRCV', text, fieldConfigs.extract_estimate_rcv, context);
    console.log(`[${jobId}] Field 4/7 completed: totalRCV`);
    
    const acv = await this.extractSingleField('totalACV', text, fieldConfigs.extract_estimate_acv, context);
    console.log(`[${jobId}] Field 5/7 completed: totalACV`);
    
    const deductible = await this.extractSingleField('deductible', text, fieldConfigs.extract_estimate_deductible, context);
    console.log(`[${jobId}] Field 6/7 completed: deductible`);
    
    const dol = await this.extractSingleField('dateOfLoss', text, fieldConfigs.extract_estimate_date_of_loss, context);
    console.log(`[${jobId}] Field 7/7 completed: dateOfLoss`);
    
    console.log(`[${jobId}] EstimateExtractorAgent.extractFieldsFromText: Sequential field extraction completed successfully`);
    
    logStreamer.logDebug(jobId, 'parallel_field_extraction_complete', 'Parallel field extraction completed', {
      extractedValues: {
        propertyAddress: address.value,
        claimNumber: claimNumber.value,
        insuranceCarrier: carrier.value,
        totalRCV: rcv.value,
        totalACV: acv.value,
        deductible: deductible.value,
        dateOfLoss: dol.value
      }
    });

    logStreamer.logDebug(jobId, 'line_items_extraction_start', 'Starting line items extraction');
    const lineItems = await this.extractLineItems(text, context)
    logStreamer.logDebug(jobId, 'line_items_extraction_complete', 'Line items extraction completed', { 
      lineItemCount: lineItems.value?.length || 0,
      confidence: lineItems.confidence
    });
    
    const parseNumeric = (field: ExtractedField<string | null>): number | null => {
      if (field.value === null || field.value === undefined || field.value.trim() === '') return null;
      const num = parseFloat(field.value);
      return isNaN(num) ? null : num;
    };
    
    const parseDate = (field: ExtractedField<string | null>): Date | null => {
      if (field.value === null || field.value === undefined || field.value.trim() === '') return null;
      const date = new Date(field.value);
      return isNaN(date.getTime()) ? null : date;
    };

    const result = {
      propertyAddress: address,
      claimNumber: claimNumber,
      insuranceCarrier: carrier,
      dateOfLoss: {
        ...dol,
        value: parseDate(dol)
      },
      totalRCV: {
        ...rcv,
        value: parseNumeric(rcv)
      },
      totalACV: {
        ...acv,
        value: parseNumeric(acv)
      },
      deductible: {
        ...deductible,
        value: parseNumeric(deductible)
      },
      lineItems: lineItems
    };
    
    logStreamer.logDebug(jobId, 'extract_fields_from_text_complete', 'EstimateExtractorAgent.extractFieldsFromText() completed', {
      overallConfidence: this.getOverallConfidence(result)
    });
    
    return result;
  }

  public async extractFieldsFromVision(pdfBuffer: Buffer, context: TaskContext): Promise<EstimateFieldExtractions> {
    const jobId = context.jobId;
    logStreamer.logDebug(jobId, 'extract_fields_from_vision_start', 'EstimateExtractorAgent.extractFieldsFromVision() starting', { 
      bufferSize: pdfBuffer.length,
      taskId: context.taskId 
    });
    
    this.log(LogLevel.DEBUG, 'vision-extraction-start', 'Starting vision-based field extraction', { taskId: context.taskId })
    
    logStreamer.logDebug(jobId, 'pdf_to_images_start', 'Converting PDF to images for vision processing');
    const imageDataUrls = await PDFToImagesTool.convertPDFToDataURLs(pdfBuffer, { dpi: 300, format: 'jpg', quality: 85 })
    this.log(LogLevel.INFO, 'pdf-converted-vision', `PDF converted to ${imageDataUrls.length} images for vision processing`, { taskId: context.taskId })
    logStreamer.logDebug(jobId, 'pdf_to_images_complete', 'PDF to images conversion completed', { 
      imageCount: imageDataUrls.length,
      taskId: context.taskId 
    });

    const visionModel = this.anthropic ? 'anthropic' : (this.openai ? 'openai' : null)
    logStreamer.logDebug(jobId, 'vision_model_selection', 'Vision model selected', { 
      selectedModel: visionModel,
      hasAnthropic: !!this.anthropic,
      hasOpenAI: !!this.openai
    });
    
    if (!visionModel) {
      logStreamer.logError(jobId, 'vision_model_unavailable', 'No vision AI model is configured and available');
      throw new Error('No vision AI model (Anthropic or OpenAI) is configured and available.')
    }

    const visionConfig: VisionModelConfig = {
      provider: visionModel,
      model: visionModel === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o',
      maxTokens: 2000,
      temperature: 0.1
    }

    const prompt = `
Analyze these insurance estimate document images and extract the following information. Prioritize accuracy.

1.  **Property Address**: The physical address of the property where the damage occurred. Exclude any mailing addresses for the insured or insurer if different.
2.  **Claim Number**: The unique identifier assigned to this insurance claim.
3.  **Insurance Carrier**: The name of the insurance company handling the claim.
4.  **Total RCV (Replacement Cost Value)**: The total estimated cost to repair or replace the damaged property to its pre-loss condition, without deduction for depreciation.
5.  **Total ACV (Actual Cash Value)**: The value of the property at the time of loss, considering depreciation. If not explicitly stated, it might be the same as RCV or RCV minus deductible/depreciation.
6.  **Deductible Amount**: The amount the policyholder is responsible for paying before the insurance coverage applies.
7.  **Date of Loss**: The date when the damage or loss occurred.

Return the information ONLY in this exact JSON format. Do not add any commentary before or after the JSON block:
{
  "propertyAddress": "string_value_or_null",
  "claimNumber": "string_value_or_null",
  "insuranceCarrier": "string_value_or_null",
  "totalRCV": numeric_value_or_null,
  "totalACV": numeric_value_or_null,
  "deductible": numeric_value_or_null,
  "dateOfLoss": "YYYY-MM-DD_or_null"
}

If a field is not found or unclear, use null. For numeric fields, return only the number, no currency symbols or text.
    `

    logStreamer.logDebug(jobId, 'vision_analysis_start', 'Starting vision analysis with AI model', { 
      model: visionConfig.model,
      provider: visionConfig.provider,
      imageCount: imageDataUrls.length
    });
    
    const visionResult = await this.visionProcessor.analyzeImages(imageDataUrls, prompt, visionConfig)
    this.log(LogLevel.INFO, 'vision-analysis-complete', 
      `Vision analysis completed. Confidence: ${visionResult.confidence.toFixed(3)}, Model: ${visionResult.model}`,
      { taskId: context.taskId, confidence: visionResult.confidence, model: visionResult.model }
    )
    
    logStreamer.logDebug(jobId, 'vision_analysis_complete', 'Vision analysis completed', {
      confidence: visionResult.confidence,
      model: visionResult.model,
      responseLength: visionResult.extractedText.length
    });

    try {
      logStreamer.logDebug(jobId, 'vision_response_parsing', 'Parsing vision model JSON response', { 
        responseLength: visionResult.extractedText.length 
      });
      
      const parsed = JSON.parse(visionResult.extractedText.replace(/,(?=\s*\})/g, ''));
      
      const result = {
        propertyAddress: this.createExtractedField(parsed.propertyAddress, visionResult.confidence, 'Extracted via vision', 'vision'),
        claimNumber: this.createExtractedField(parsed.claimNumber, visionResult.confidence, 'Extracted via vision', 'vision'),
        insuranceCarrier: this.createExtractedField(parsed.insuranceCarrier, visionResult.confidence, 'Extracted via vision', 'vision'),
        dateOfLoss: this.createExtractedField(parsed.dateOfLoss ? new Date(parsed.dateOfLoss) : null, visionResult.confidence * 0.8, 'Extracted via vision', 'vision'),
        totalRCV: this.createExtractedField(parsed.totalRCV, visionResult.confidence, 'Extracted via vision', 'vision'),
        totalACV: this.createExtractedField(parsed.totalACV, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        deductible: this.createExtractedField(parsed.deductible, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        lineItems: this.createExtractedField([], 0.3, 'Line items not extracted by this vision prompt', 'vision')
      };
      
      logStreamer.logDebug(jobId, 'extract_fields_from_vision_complete', 'EstimateExtractorAgent.extractFieldsFromVision() completed', {
        parsedValues: {
          propertyAddress: parsed.propertyAddress,
          claimNumber: parsed.claimNumber,
          insuranceCarrier: parsed.insuranceCarrier,
          totalRCV: parsed.totalRCV,
          totalACV: parsed.totalACV,
          deductible: parsed.deductible,
          dateOfLoss: parsed.dateOfLoss
        },
        overallConfidence: this.getOverallConfidence(result)
      });
      
      return result;
    } catch (error) {
      this.log(LogLevel.WARN, 'vision-parse-failed', `Failed to parse vision model JSON response: ${visionResult.extractedText}. Error: ${error}`)
      throw new Error(`Failed to parse vision model response. Raw: ${visionResult.extractedText}. Error: ${error}`)
    }
  }

  public async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    logStreamer.logDebug('unknown', 'get_ai_configs_start', 'EstimateExtractorAgent.getAIConfigs() starting', { 
      stepNames: stepNames 
    });
    
    this.log(LogLevel.DEBUG, 'get-ai-configs', `Fetching AI configs for steps: ${stepNames.join(', ')}`)
    const configs: Record<string, AIConfig> = {}
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_config')
        .select('*')
        .eq('step_name', stepName)
        .single()

      if (error) {
        this.log(LogLevel.WARN, 'config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`)
        configs[stepName] = { step_name: stepName, prompt: '', model_provider: 'openai', model_name: 'gpt-3.5-turbo' } 
      } else if (data) {
        // Map database columns to AIConfig interface
        configs[stepName] = {
          step_name: data.step_name,
          prompt: data.prompt,
          model_provider: data.provider, // Map database 'provider' to 'model_provider'
          model_name: data.model, // Map database 'model' to 'model_name'
          temperature: data.temperature,
          max_tokens: data.max_tokens
        }
      } else {
         configs[stepName] = { step_name: stepName, prompt: `Extract ${stepName}`, model_provider: 'openai', model_name: 'gpt-3.5-turbo' } 
      }
    }
    
    logStreamer.logDebug('unknown', 'get_ai_configs_complete', 'EstimateExtractorAgent.getAIConfigs() completed', { 
      configCount: Object.keys(configs).length,
      stepNames: Object.keys(configs)
    });
    
    return configs
  }

  public async extractSingleField(fieldName: string, text: string, config: AIConfig, context: TaskContext): Promise<ExtractedField<string | null>> {
    const jobId = context.jobId;
    logStreamer.logDebug(jobId, 'extract_single_field_start', `EstimateExtractorAgent.extractSingleField() starting for ${fieldName}`, { 
      fieldName,
      hasConfig: !!config,
      hasPrompt: !!(config?.prompt),
      provider: config?.model_provider,
      model: config?.model_name,
      temperature: config?.temperature,
      maxTokens: config?.max_tokens
    });
    
    if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-config', `No AI config or prompt for field: ${fieldName}`)
      logStreamer.logStep(jobId, 'missing_field_config', `Missing AI configuration for field: ${fieldName}`, { fieldName });
      return this.createExtractedField(null, 0.1, `Missing AI configuration for ${fieldName}`, 'text');
    }

    const fullPrompt = `${config.prompt}\n\nDocument text:\n${text}`
    this.log(LogLevel.DEBUG, 'extract-single-field', `Extracting field ${fieldName} with ${config.model_provider}/${config.model_name}`, { taskId: context.taskId })
    
    try {
      // Log the prompt being used for debugging
      if (fieldName === 'dateOfLoss') {
        logStreamer.logDebug(jobId, 'date_of_loss_prompt_debug', 'Date of loss prompt being used', {
          promptLength: fullPrompt.length,
          promptPreview: fullPrompt.substring(0, 200),
          temperature: config.temperature
        });
      }
      
      const aiResponse = await this.callAI(config, fullPrompt, context.taskId || 'unknown-task')
      const trimmedResponse = aiResponse.trim();
      
      // Improved confidence calculation based on response quality
      let confidence = 0.2; // Base confidence for any response
      if (trimmedResponse.length > 0) {
        // Base confidence for non-empty response
        confidence = 0.6;
        
        // Bonus for reasonable length (10-200 chars for most fields)
        if (trimmedResponse.length >= 10 && trimmedResponse.length <= 200) {
          confidence += 0.2;
        }
        
        // Bonus for containing expected patterns
        if (fieldName.toLowerCase().includes('address') && /\d+.*[A-Za-z]/.test(trimmedResponse)) {
          confidence += 0.1;
        } else if (fieldName.toLowerCase().includes('claim') && /[A-Za-z0-9\-]{5,}/.test(trimmedResponse)) {
          confidence += 0.1;
        } else if ((fieldName.toLowerCase().includes('rcv') || fieldName.toLowerCase().includes('acv') || fieldName.toLowerCase().includes('deductible')) && /\d+/.test(trimmedResponse)) {
          confidence += 0.1;
        } else if (fieldName.toLowerCase().includes('carrier') && trimmedResponse.length > 3) {
          confidence += 0.1;
        }
      }
      
      const result = this.createExtractedField(trimmedResponse.length > 0 ? trimmedResponse : null, Math.min(0.9, confidence), `Extracted via ${config.model_provider}`, 'text');
      
      logStreamer.logDebug(jobId, 'extract_single_field_success', `Field extraction successful for ${fieldName}`, { 
        fieldName,
        extractedValue: result.value,
        confidence: result.confidence,
        responseLength: aiResponse.length
      });
      
      return result;
    } catch (error) {
      this.log(LogLevel.ERROR, 'ai-call-error', `AI call failed for ${fieldName}: ${error}`, { error })
      logStreamer.logError(jobId, 'extract_single_field_error', `AI call failed for ${fieldName}: ${error}`, { fieldName, error });
      return this.createExtractedField(null, 0.0, `AI extraction failed for ${fieldName}: ${error}`, 'text')
    }
  }

  public async extractLineItems(text: string, context: TaskContext): Promise<ExtractedField<any[]>> {
    const jobId = context.jobId;
    logStreamer.logDebug(jobId, 'extract_line_items_start', 'EstimateExtractorAgent.extractLineItems() starting', { 
      textLength: text.length,
      taskId: context.taskId 
    });
    
    this.log(LogLevel.DEBUG, 'extract-line-items', 'Extracting line items from text', { taskId: context.taskId })
    const config = (await this.getAIConfigs(['extract_line_items'])).extract_line_items

    if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-line-item-config', 'AI config for line item extraction is missing.')
      logStreamer.logStep(jobId, 'missing_line_item_config', 'AI config for line item extraction is missing');
      return this.createExtractedField([], 0.1, 'Missing AI configuration for line items', 'text');
    }

    logStreamer.logDebug(jobId, 'line_items_config_loaded', 'Line items AI configuration loaded', {
      hasPrompt: !!config.prompt,
      provider: config.model_provider,
      model: config.model_name,
      temperature: config.temperature,
      maxTokens: config.max_tokens
    });

    const fullPrompt = `${config.prompt}\n\nDocument text:\n${text}`

    try {
      const aiResponse = await this.callAI(config, fullPrompt, context.taskId || 'unknown-task')
      
      // Enhanced JSON cleaning to handle all markdown variations
      let cleanedResponse = aiResponse.trim();
      
      // Remove markdown code blocks (various formats)
      if (cleanedResponse.includes('```')) {
        // Handle ```json ... ``` format
        cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/\s*```/g, '');
        // Handle ``` ... ``` format  
        cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/\s*```/g, '');
      }
      
      // Remove any leading/trailing text that isn't JSON
      const jsonStart = cleanedResponse.indexOf('[');
      const jsonEnd = cleanedResponse.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);
      }
      
      // Remove any remaining backticks
      cleanedResponse = cleanedResponse.replace(/`/g, '');
      
      // Final trim
      cleanedResponse = cleanedResponse.trim();
      
      const lineItems = JSON.parse(cleanedResponse)
      const confidence = Array.isArray(lineItems) && lineItems.length > 0 ? 0.8 : 0.4;
      const result = this.createExtractedField(lineItems, confidence, `Extracted via ${config.model_provider}`, 'text');
      
      logStreamer.logDebug(jobId, 'extract_line_items_success', 'Line items extraction successful', { 
        lineItemCount: lineItems?.length || 0,
        confidence: confidence,
        responseLength: aiResponse.length
      });
      
      return result;
    } catch (error) {
      this.log(LogLevel.ERROR, 'line-item-parse-error', `Failed to parse line items JSON: ${error}. Raw: ${text.substring(0,100)}`, { error })
      logStreamer.logError(jobId, 'line_item_parse_error', `Failed to parse line items JSON: ${error}`, { error });
      
      const lines = text.split('\n').filter(l => l.trim().length > 5 && /\d/.test(l) && /[a-zA-Z]/.test(l));
      if(lines.length > 0) {
        this.log(LogLevel.WARN, 'line-item-fallback', 'Falling back to simple list extraction for line items');
        logStreamer.logStep(jobId, 'line_item_fallback', 'Falling back to simple list extraction for line items', { fallbackLineCount: lines.length });
        return this.createExtractedField(lines.map(l => ({description: l.trim()})), 0.3, 'Fallback list extraction', 'text');
      }
      return this.createExtractedField([], 0.0, `Line item JSON parsing failed: ${error}`, 'text')
    }
  }

  public async callAI(config: AIConfig, prompt: string, jobId: string): Promise<string> {
    logStreamer.logDebug(jobId, 'ai_call_start', 'EstimateExtractorAgent.callAI() starting', { 
      provider: config.model_provider,
      model: config.model_name,
      promptLength: prompt.length
    });
    
    this.log(LogLevel.DEBUG, 'ai-call-start', `Calling ${config.model_provider} model ${config.model_name}`)
    const startTime = Date.now()

    try {
      let responseText = '';
      if (config.model_provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: config.model_name || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: config.max_tokens || 1000,
          temperature: config.temperature || 0.2,
        });
        responseText = response.choices[0]?.message?.content || ''
      } else if (config.model_provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: config.model_name || 'claude-3-haiku-20240307',
          max_tokens: config.max_tokens || 1000,
          temperature: config.temperature || 0.2,
          messages: [{ role: 'user', content: prompt }]
        });
        responseText = response.content[0]?.type === 'text' ? response.content[0].text : ''
      } else {
        throw new Error(`Unsupported AI provider or client not initialized: ${config.model_provider}`)
      }
      
      const duration = Date.now() - startTime
      this.log(LogLevel.INFO, 'ai-call-success', 
        `${config.model_provider} call completed in ${duration}ms. Output length: ${responseText.length}`,
        { duration, outputLength: responseText.length, provider: config.model_provider, model: config.model_name }
      )
      
      logStreamer.logDebug(jobId, 'ai_call_success', 'AI call completed successfully', {
        provider: config.model_provider,
        model: config.model_name,
        duration: duration,
        outputLength: responseText.length
      });
      
      return responseText;

    } catch (error) {
      const duration = Date.now() - startTime
      this.log(LogLevel.ERROR, 'ai-call-error', 
        `${config.model_provider} call failed after ${duration}ms: ${error}`,
        { duration, error, provider: config.model_provider, model: config.model_name }
      )
      throw error
    }
  }

  public createExtractedField<T>(
    value: T, 
    confidence: number, 
    rationale: string, 
    source: 'text' | 'vision' | 'hybrid' | 'fallback',
    attempts: number = 1
  ): ExtractedField<T> {
    return {
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      rationale,
      source,
      attempts
    }
  }

  public calculateTextQuality(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0
    }
    
    const printableChars = text.replace(/[^\x20-\x7E\n\r\t]/g, '').length
    const printableRatio = printableChars / text.length
    
    const structureIndicators = [
        /address/i, /claim/i, /total/i, /amount/i, /\$/i, /insurance/i, /estimate/i, /policy/i, /date of loss/i, /summary/i, /details/i,
        /\b(SF|LF|EA|SQ)\b/i
    ];
    let structureScore = 0;
    for (const indicator of structureIndicators) {
        if (indicator.test(text)) {
            structureScore += 0.05;
        }
    }
    structureScore = Math.min(0.5, structureScore);

    const wordCount = text.trim().split(/\s+/).length;
    const wordScore = Math.min(0.2, wordCount / 2000);
    
    return Math.min(0.95, printableRatio * 0.6 + structureScore + wordScore)
  }

  public getOverallConfidence(results: EstimateFieldExtractions | null): number {
    if (!results) {
      return 0
    }

    const fields: Array<ExtractedField<any> | undefined> = [
      results.propertyAddress,
      results.claimNumber,
      results.insuranceCarrier,
      results.totalRCV,
      results.lineItems
    ];
    
    const validFields = fields.filter(f => f && f.value !== null && f.value !== undefined && f.confidence > 0.1);
    if (validFields.length === 0) return 0.1;

    const totalConfidence = validFields.reduce((sum, field) => sum + (field?.confidence || 0), 0)
    return totalConfidence / validFields.length
  }

  public combineExtractionResults(
    textResults: EstimateFieldExtractions | null,
    visionResults: EstimateFieldExtractions | null,
    textQuality: number
  ): EstimateFieldExtractions {
    logStreamer.logDebug('unknown', 'combine_extraction_results_start', 'EstimateExtractorAgent.combineExtractionResults() starting', {
      hasTextResults: !!textResults,
      hasVisionResults: !!visionResults,
      textQuality: textQuality
    });
    
    if (!textResults && !visionResults) {
        this.log(LogLevel.WARN, 'combine-results-both-null', 'Both text and vision results are null. Returning empty structure.');
        logStreamer.logStep('unknown', 'combine_results_both_null', 'Both text and vision results are null, returning empty structure');
        const emptyField = (rationale: string) => this.createExtractedField(null, 0, rationale, 'fallback');
        return {
            propertyAddress: emptyField('No data from text or vision'),
            claimNumber: emptyField('No data from text or vision'),
            insuranceCarrier: emptyField('No data from text or vision'),
            dateOfLoss: emptyField('No data from text or vision'),
            totalRCV: this.createExtractedField(0, 0, 'No data from text or vision', 'fallback'),
            totalACV: this.createExtractedField(0, 0, 'No data from text or vision', 'fallback'),
            deductible: this.createExtractedField(0, 0, 'No data from text or vision', 'fallback'),
            lineItems: this.createExtractedField([], 0, 'No data from text or vision', 'fallback'),
        };
    }
    if (!textResults) {
      logStreamer.logDebug('unknown', 'combine_results_vision_only', 'Using vision results only');
      return visionResults!;
    }
    if (!visionResults) {
      logStreamer.logDebug('unknown', 'combine_results_text_only', 'Using text results only');
      return textResults!;
    }
    
    logStreamer.logDebug('unknown', 'combine_results_hybrid', 'Combining text and vision results', {
      textOverallConfidence: this.getOverallConfidence(textResults),
      visionOverallConfidence: this.getOverallConfidence(visionResults)
    });
    
    const result = {
      propertyAddress: this.selectBestField(textResults.propertyAddress, visionResults.propertyAddress),
      claimNumber: this.selectBestField(textResults.claimNumber, visionResults.claimNumber),
      insuranceCarrier: this.selectBestField(textResults.insuranceCarrier, visionResults.insuranceCarrier),
      dateOfLoss: this.selectBestField(textResults.dateOfLoss, visionResults.dateOfLoss),
      totalRCV: this.selectBestField(textResults.totalRCV, visionResults.totalRCV, (v) => typeof v === 'number' && v > 0),
      totalACV: this.selectBestField(textResults.totalACV, visionResults.totalACV, (v) => typeof v === 'number'),
      deductible: this.selectBestField(textResults.deductible, visionResults.deductible, (v) => typeof v === 'number'),
      lineItems: (textQuality > 0.6 && textResults.lineItems.value.length > 0) || visionResults.lineItems.value.length === 0 
                  ? { ...textResults.lineItems, source: 'hybrid' as const } 
                  : { ...visionResults.lineItems, source: 'hybrid' as const }
    };
    
    logStreamer.logDebug('unknown', 'combine_extraction_results_complete', 'EstimateExtractorAgent.combineExtractionResults() completed', {
      finalConfidence: this.getOverallConfidence(result)
    });
    
    return result;
  }

  public selectBestField<T>(
    field1: ExtractedField<T>,
    field2: ExtractedField<T>,
    valueValidator?: (value: T) => boolean
  ): ExtractedField<T> {
    const v1Valid = valueValidator ? valueValidator(field1.value) : true;
    const v2Valid = valueValidator ? valueValidator(field2.value) : true;

    if (v1Valid && !v2Valid) return { ...field1, source: 'hybrid' as const };
    if (!v1Valid && v2Valid) return { ...field2, source: 'hybrid' as const };

    if (field1.confidence > field2.confidence) {
      return { ...field1, source: 'hybrid' as const }
    } else if (field2.confidence > field1.confidence) {
      return { ...field2, source: 'hybrid' as const }
    } else {
      return field1.value !== null && field1.value !== undefined ? 
        { ...field1, source: 'hybrid' as const } : 
        { ...field2, source: 'hybrid' as const };
    }
  }

  public isValidAddress(address: string | null): boolean {
    if (!address) return false;
    return /\d+.*[A-Za-z].*(\d{5}|[A-Z]{2}\s\d{5})/.test(address)
  }

  public isValidClaimNumber(claimNumber: string | null): boolean {
    if (!claimNumber) return false;
    return /^[A-Za-z0-9\-]{5,50}$/.test(claimNumber)
  }

  /**
   * Check if Mistral OCR is available
   */
  public isMistralOCRAvailable(): boolean {
    return this.mistralApiKey !== null
  }

  /**
   * Calculate confidence score based on Mistral OCR extraction quality
   */
  private calculateMistralOCRConfidence(parsed: any): number {
    let baseConfidence = 0.7; // Start with a reasonable base for Mistral OCR

    // Adjust based on extraction quality if provided
    if (parsed.extractionQuality) {
      const { documentReadability, fieldsFound, confidence } = parsed.extractionQuality;
      
      // Document readability impact
      if (documentReadability === 'high') baseConfidence += 0.15;
      else if (documentReadability === 'medium') baseConfidence += 0.05;
      else if (documentReadability === 'low') baseConfidence -= 0.1;
      
      // Fields found impact
      const expectedFields = 7; // Not counting line items
      const fieldRatio = Math.min(1, (fieldsFound || 0) / expectedFields);
      baseConfidence += fieldRatio * 0.1;
      
      // Overall confidence from model
      if (confidence === 'high') baseConfidence += 0.05;
      else if (confidence === 'low') baseConfidence -= 0.05;
    }

    // Check for critical fields presence
    const criticalFields = ['propertyAddress', 'claimNumber', 'totalRCV'];
    const criticalFieldsFound = criticalFields.filter(field => 
      parsed[field] !== null && parsed[field] !== undefined && parsed[field] !== ''
    ).length;
    
    baseConfidence += (criticalFieldsFound / criticalFields.length) * 0.1;

    return Math.min(0.95, Math.max(0.3, baseConfidence));
  }

  /**
   * Calculate field-specific confidence scores
   */
  private calculateFieldSpecificConfidence(parsed: any, baseConfidence: number): Record<string, number> {
    const confidences: Record<string, number> = {};

    // Property Address
    confidences.address = baseConfidence;
    if (parsed.propertyAddress && this.isValidAddress(parsed.propertyAddress)) {
      confidences.address += 0.1;
    } else if (!parsed.propertyAddress) {
      confidences.address -= 0.2;
    }

    // Claim Number
    confidences.claim = baseConfidence;
    if (parsed.claimNumber && this.isValidClaimNumber(parsed.claimNumber)) {
      confidences.claim += 0.1;
    } else if (!parsed.claimNumber) {
      confidences.claim -= 0.15;
    }

    // Insurance Carrier
    confidences.carrier = baseConfidence;
    if (parsed.insuranceCarrier && parsed.insuranceCarrier.length > 3) {
      confidences.carrier += 0.05;
    }

    // RCV
    confidences.rcv = baseConfidence;
    if (parsed.totalRCV && typeof parsed.totalRCV === 'number' && parsed.totalRCV > 0) {
      if (parsed.totalRCV > 1000 && parsed.totalRCV < 500000) {
        confidences.rcv += 0.1; // Reasonable range
      }
    } else {
      confidences.rcv -= 0.2;
    }

    // ACV
    confidences.acv = baseConfidence * 0.9; // Slightly lower as it's often missing
    if (parsed.totalACV && typeof parsed.totalACV === 'number' && parsed.totalACV > 0) {
      if (parsed.totalRCV && parsed.totalACV <= parsed.totalRCV) {
        confidences.acv += 0.1; // Valid relationship with RCV
      }
    }

    // Deductible
    confidences.deductible = baseConfidence * 0.85;
    if (parsed.deductible && typeof parsed.deductible === 'number' && parsed.deductible > 0) {
      if (parsed.deductible >= 500 && parsed.deductible <= 10000) {
        confidences.deductible += 0.05; // Common deductible range
      }
    }

    // Date of Loss
    confidences.dateOfLoss = baseConfidence * 0.8;
    if (parsed.dateOfLoss) {
      try {
        const date = new Date(parsed.dateOfLoss);
        if (!isNaN(date.getTime()) && date < new Date() && date > new Date('2020-01-01')) {
          confidences.dateOfLoss += 0.1; // Valid recent date
        }
      } catch {
        confidences.dateOfLoss -= 0.1;
      }
    }

    // Line Items
    confidences.lineItems = 0.3; // Base for line items
    if (parsed.lineItems && Array.isArray(parsed.lineItems)) {
      if (parsed.lineItems.length > 0) {
        confidences.lineItems = Math.min(0.8, 0.4 + (parsed.lineItems.length * 0.05));
        
        // Check quality of line items
        const validItems = parsed.lineItems.filter((item: any) => 
          item.description && item.quantity > 0 && item.unit
        ).length;
        
        confidences.lineItems += (validItems / parsed.lineItems.length) * 0.2;
      }
    }

    // Ensure all confidences are within valid range
    Object.keys(confidences).forEach(key => {
      confidences[key] = Math.min(0.95, Math.max(0.1, confidences[key]));
    });

    return confidences;
  }

  /**
   * Extract fields from PDF using Mistral OCR
   */
  public async extractFieldsFromMistralOCR(pdfBuffer: Buffer, context: TaskContext): Promise<EstimateFieldExtractions> {
    const jobId = context.jobId;
    logStreamer.logDebug(jobId, 'extract_fields_from_mistral_ocr_start', 'EstimateExtractorAgent.extractFieldsFromMistralOCR() starting', { 
      bufferSize: pdfBuffer.length,
      taskId: context.taskId 
    });
    
    this.log(LogLevel.DEBUG, 'mistral-ocr-extraction-start', 'Starting Mistral OCR-based field extraction', { taskId: context.taskId })
    
    if (!this.mistralApiKey) {
      throw new Error('Mistral API key not configured')
    }

    // Convert PDF buffer to base64 (Basic OCR accepts PDF via document_url)
    const base64Pdf = pdfBuffer.toString('base64')

    const ocrRequestBody = {
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${base64Pdf}`
      },
      include_image_base64: false
    }

    logStreamer.logDebug(jobId, 'mistral_ocr_api_call_start', 'Calling Mistral Basic OCR API', {
      model: 'mistral-ocr-latest',
      pdfSize: pdfBuffer.length
    });

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.mistralApiKey}`
        },
        body: JSON.stringify(ocrRequestBody),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId))

      if (!response.ok) {
        const errorBody = await response.text();
        logStreamer.logError(jobId, 'mistral_ocr_api_error_response', `Mistral Basic OCR API error response: ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorBody.substring(0, 1000), // Log first 1000 chars of error
          requestBodySize: JSON.stringify(ocrRequestBody).length
        });
        
        // Specific error handling
        if (response.status === 429) {
          throw new Error('Mistral API rate limit exceeded. Please try again later.');
        } else if (response.status === 401) {
          throw new Error('Mistral API authentication failed. Please check your API key.');
        } else if (response.status >= 500) {
          throw new Error(`Mistral API server error: ${response.status}. Service may be temporarily unavailable.`);
        } else {
          throw new Error(`Mistral API error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
        }
      }

      const resultJson = await response.json()

      const pages = resultJson.pages || []
      const markdownText = pages.map((p: any) => p.markdown || '').join('\n')

      if (!markdownText) {
        logStreamer.logError(jobId, 'mistral_ocr_empty_response', 'Mistral Basic OCR returned empty markdown', {
          pageCount: pages.length
        })
        throw new Error('Mistral OCR returned no text; document may be unreadable.')
      }

      logStreamer.logDebug(jobId, 'mistral_ocr_api_call_complete', 'Mistral Basic OCR call completed', {
        pageCount: pages.length,
        totalChars: markdownText.length
      })

      // Re-use text-extraction pipeline on the OCR text
      const textResults = await this.extractFieldsFromText(markdownText, context)

      // Mark source as 'vision' for clarity
      Object.keys(textResults).forEach(key => {
        // @ts-ignore
        if (textResults[key]) textResults[key].source = 'vision'
      })

      return textResults

    } catch (error: any) {
      // If extractFieldsFromText fails
      this.log(LogLevel.ERROR, 'mistral-ocr-text-extraction-failed', `Text extraction from OCR result failed: ${error}`)
      throw error
    }
  }
} 