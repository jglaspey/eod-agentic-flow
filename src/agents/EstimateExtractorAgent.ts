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

interface EstimateExtractionInput {
  pdfBuffer: Buffer
  strategy?: ExtractionStrategy
}

/**
 * Specialized agent for extracting data from insurance estimate PDFs
 * Uses text extraction first, falls back to vision models for scanned PDFs
 */
export class EstimateExtractorAgent extends Agent {
  private visionProcessor: VisionModelProcessor
  private supabase = getSupabaseClient()
  private openai: OpenAI | null = null
  private anthropic: Anthropic | null = null

  constructor() {
    const config: AgentConfig = {
      name: 'EstimateExtractorAgent',
      version: '1.0.0',
      capabilities: ['text_extraction', 'vision_processing', 'field_validation'],
      defaultTimeout: 60000,
      maxRetries: 2,
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
  }

  get agentType(): AgentType {
    return AgentType.ESTIMATE_EXTRACTOR
  }

  async plan(input: EstimateExtractionInput, context: TaskContext): Promise<AgentExecutionPlan> {
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

    return {
      tasks,
      dependencies,
      estimatedDuration: 30000,
      confidence: 0.8
    }
  }

  async act(input: EstimateExtractionInput, context: TaskContext): Promise<AgentResult<EstimateFieldExtractions>> {
    this.log(LogLevel.INFO, 'extraction-start', `Starting estimate data extraction for task ${context.taskId}`)
    
    let textExtractionResult: string = ''
    let textConfidence = 0
    let textResults: EstimateFieldExtractions | null = null
    let visionResults: EstimateFieldExtractions | null = null
    
    try {
      this.log(LogLevel.DEBUG, 'text-extraction', 'Extracting text from PDF', { taskId: context.taskId })
      textExtractionResult = await PDFProcessor.extractText(input.pdfBuffer)
      textConfidence = this.calculateTextQuality(textExtractionResult)
      
      this.log(LogLevel.INFO, 'text-extracted', 
        `Text extraction completed. Quality score: ${textConfidence.toFixed(3)}`,
        { textLength: textExtractionResult.length, quality: textConfidence, taskId: context.taskId }
      )

      if (textConfidence > 0.3 && 
          (input.strategy === ExtractionStrategy.TEXT_ONLY || 
           input.strategy === ExtractionStrategy.HYBRID || 
           input.strategy === ExtractionStrategy.FALLBACK)) {
        this.log(LogLevel.DEBUG, 'field-extraction-text', 'Extracting fields from text', { taskId: context.taskId })
        try {
          textResults = await this.extractFieldsFromText(textExtractionResult, context)
        } catch (textError) {
          this.log(LogLevel.WARN, 'text-extraction-error', `Field extraction from text failed: ${textError}`, { taskId: context.taskId, error: textError })
        }
      }

      const shouldUseVision = (
        input.strategy === ExtractionStrategy.VISION_ONLY ||
        input.strategy === ExtractionStrategy.HYBRID ||
        (input.strategy === ExtractionStrategy.FALLBACK && (!textResults || this.getOverallConfidence(textResults) < this.config.confidenceThreshold))
      )

      if (shouldUseVision) {
        if (await PDFToImagesTool.isAvailable() && this.visionProcessor.isAvailable()) {
          this.log(LogLevel.INFO, 'vision-fallback', 'Using vision models for extraction', { taskId: context.taskId })
          try {
            visionResults = await this.extractFieldsFromVision(input.pdfBuffer, context)
          } catch (visionError) {
            this.log(LogLevel.WARN, 'vision-extraction-error', `Field extraction from vision failed: ${visionError}`, { taskId: context.taskId, error: visionError })
          }
        } else {
          this.log(LogLevel.WARN, 'vision-unavailable', 'Vision processing requested but tools are not available', { taskId: context.taskId })
        }
      }

      if (!textResults && !visionResults) {
        throw new Error('Both text and vision extraction failed to produce results.')
      }
      const finalResults = this.combineExtractionResults(textResults, visionResults, textConfidence)
      
      const overallConfidence = this.getOverallConfidence(finalResults)
      this.log(LogLevel.SUCCESS, 'extraction-complete', 
        `Extraction completed with overall confidence: ${overallConfidence.toFixed(3)}`,
        { taskId: context.taskId, overallConfidence }
      )

      return {
        data: finalResults,
        validation: await this.validate(finalResults, context),
        processingTimeMs: 0,
        model: visionResults && textResults ? 'hybrid' : (visionResults ? 'vision' : 'text')
      }

    } catch (error) {
      this.log(LogLevel.ERROR, 'extraction-failed', `Extraction failed: ${error}`)
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
      suggestions.push(`Overall confidence (${overallConfidence.toFixed(2)}) is below threshold (${this.config.confidenceThreshold}). Manual review recommended.`)
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

  private async extractFieldsFromText(text: string, context: TaskContext): Promise<EstimateFieldExtractions> {
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

    // Extract fields in parallel
    const [address, claimNumber, carrier, rcv, acv, deductible, dol] = await Promise.all([
      this.extractSingleField('propertyAddress', text, fieldConfigs.extract_estimate_address, context),
      this.extractSingleField('claimNumber', text, fieldConfigs.extract_estimate_claim, context),
      this.extractSingleField('insuranceCarrier', text, fieldConfigs.extract_estimate_carrier, context),
      this.extractSingleField('totalRCV', text, fieldConfigs.extract_estimate_rcv, context),
      this.extractSingleField('totalACV', text, fieldConfigs.extract_estimate_acv, context),
      this.extractSingleField('deductible', text, fieldConfigs.extract_estimate_deductible, context),
      this.extractSingleField('dateOfLoss', text, fieldConfigs.extract_estimate_date_of_loss, context)
    ])

    const lineItems = await this.extractLineItems(text, context)
    
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

    return {
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
    }
  }

  private async extractFieldsFromVision(pdfBuffer: Buffer, context: TaskContext): Promise<EstimateFieldExtractions> {
    this.log(LogLevel.DEBUG, 'vision-extraction-start', 'Starting vision-based field extraction', { taskId: context.taskId })
    
    const imageDataUrls = await PDFToImagesTool.convertPDFToDataURLs(pdfBuffer, { dpi: 300, format: 'jpg', quality: 85 })
    this.log(LogLevel.INFO, 'pdf-converted-vision', `PDF converted to ${imageDataUrls.length} images for vision processing`, { taskId: context.taskId })

    const visionModel = this.anthropic ? 'anthropic' : (this.openai ? 'openai' : null)
    if (!visionModel) {
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

    const visionResult = await this.visionProcessor.analyzeImages(imageDataUrls, prompt, visionConfig)
    this.log(LogLevel.INFO, 'vision-analysis-complete', 
      `Vision analysis completed. Confidence: ${visionResult.confidence.toFixed(3)}, Model: ${visionResult.model}`,
      { taskId: context.taskId, confidence: visionResult.confidence, model: visionResult.model }
    )

    try {
      const parsed = JSON.parse(visionResult.extractedText.replace(/,(?=\s*\})/g, ''));
      
      return {
        propertyAddress: this.createExtractedField(parsed.propertyAddress, visionResult.confidence, 'Extracted via vision', 'vision'),
        claimNumber: this.createExtractedField(parsed.claimNumber, visionResult.confidence, 'Extracted via vision', 'vision'),
        insuranceCarrier: this.createExtractedField(parsed.insuranceCarrier, visionResult.confidence, 'Extracted via vision', 'vision'),
        dateOfLoss: this.createExtractedField(parsed.dateOfLoss ? new Date(parsed.dateOfLoss) : null, visionResult.confidence * 0.8, 'Extracted via vision', 'vision'),
        totalRCV: this.createExtractedField(parsed.totalRCV, visionResult.confidence, 'Extracted via vision', 'vision'),
        totalACV: this.createExtractedField(parsed.totalACV, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        deductible: this.createExtractedField(parsed.deductible, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        lineItems: this.createExtractedField([], 0.3, 'Line items not extracted by this vision prompt', 'vision')
      }
    } catch (error) {
      this.log(LogLevel.WARN, 'vision-parse-failed', `Failed to parse vision model JSON response: ${visionResult.extractedText}. Error: ${error}`)
      throw new Error(`Failed to parse vision model response. Raw: ${visionResult.extractedText}. Error: ${error}`)
    }
  }

  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-ai-configs', `Fetching AI configs for steps: ${stepNames.join(', ')}`)
    const configs: Record<string, AIConfig> = {}
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single()

      if (error) {
        this.log(LogLevel.WARN, 'config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`)
        configs[stepName] = { step_name: stepName, prompt: '', model_provider: 'openai', model_name: 'gpt-3.5-turbo' } 
      } else if (data) {
        configs[stepName] = data as AIConfig
      } else {
         configs[stepName] = { step_name: stepName, prompt: `Extract ${stepName}`, model_provider: 'openai', model_name: 'gpt-3.5-turbo' } 
      }
    }
    return configs
  }

  private async extractSingleField(fieldName: string, text: string, config: AIConfig, context: TaskContext): Promise<ExtractedField<string | null>> {
    if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-config', `No AI config or prompt for field: ${fieldName}`)
      return this.createExtractedField(null, 0.1, `Missing AI configuration for ${fieldName}`, 'text');
    }

    const fullPrompt = `${config.prompt}\n\nDocument text:\n${text}`
    this.log(LogLevel.DEBUG, 'extract-single-field', `Extracting field ${fieldName} with ${config.model_provider}/${config.model_name}`, { taskId: context.taskId })
    
    try {
      const aiResponse = await this.callAI(config, fullPrompt, context.taskId || 'unknown-task')
      const trimmedResponse = aiResponse.trim();
      // Basic confidence: length of response, presence of non-whitespace
      const confidence = trimmedResponse.length > 0 ? (trimmedResponse.length / (config.prompt.length * 0.2) + 0.5) : 0.2;
      return this.createExtractedField(trimmedResponse.length > 0 ? trimmedResponse : null, Math.min(0.9, confidence), `Extracted via ${config.model_provider}`, 'text')
    } catch (error) {
      this.log(LogLevel.ERROR, 'ai-call-error', `AI call failed for ${fieldName}: ${error}`, { error })
      return this.createExtractedField(null, 0.0, `AI extraction failed for ${fieldName}: ${error}`, 'text')
    }
  }

  private async extractLineItems(text: string, context: TaskContext): Promise<ExtractedField<any[]>> {
    this.log(LogLevel.DEBUG, 'extract-line-items', 'Extracting line items from text', { taskId: context.taskId })
    const config = (await this.getAIConfigs(['extract_line_items'])).extract_line_items
    
    if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-line-item-config', 'AI config for line item extraction is missing.')
      return this.createExtractedField([], 0.1, 'Missing AI configuration for line items', 'text');
    }

    const fullPrompt = `${config.prompt}\n\nDocument text:\n${text}`;

    try {
      const aiResponse = await this.callAI(config, fullPrompt, context.taskId || 'unknown-task')
      const lineItems = JSON.parse(aiResponse)
      const confidence = Array.isArray(lineItems) && lineItems.length > 0 ? 0.8 : 0.4;
      return this.createExtractedField(lineItems, confidence, `Extracted via ${config.model_provider}`, 'text')
    } catch (error) {
      this.log(LogLevel.ERROR, 'line-item-parse-error', `Failed to parse line items JSON: ${error}. Raw: ${text.substring(0,100)}`, { error })
      const lines = text.split('\n').filter(l => l.trim().length > 5 && /\d/.test(l) && /[a-zA-Z]/.test(l));
      if(lines.length > 0) {
        this.log(LogLevel.WARN, 'line-item-fallback', 'Falling back to simple list extraction for line items');
        return this.createExtractedField(lines.map(l => ({description: l.trim()})), 0.3, 'Fallback list extraction', 'text');
      }
      return this.createExtractedField([], 0.0, `Line item JSON parsing failed: ${error}`, 'text')
    }
  }

  private async callAI(config: AIConfig, prompt: string, jobId: string): Promise<string> {
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

  private createExtractedField<T>(
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

  private calculateTextQuality(text: string): number {
    if (!text || text.trim().length < 100) return 0.1
    
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

  private getOverallConfidence(results: EstimateFieldExtractions | null): number {
    if (!results) return 0;

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

  private combineExtractionResults(
    textResults: EstimateFieldExtractions | null,
    visionResults: EstimateFieldExtractions | null,
    textQuality: number
  ): EstimateFieldExtractions {
    if (!textResults && !visionResults) {
        this.log(LogLevel.WARN, 'combine-results-both-null', 'Both text and vision results are null. Returning empty structure.');
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
    if (!textResults) return visionResults!;
    if (!visionResults) return textResults!;
    
    return {
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
    }
  }

  private selectBestField<T>(
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

  private isValidAddress(address: string | null): boolean {
    if (!address) return false;
    return /\d+.*[A-Za-z].*(\d{5}|[A-Z]{2}\s\d{5})/.test(address)
  }

  private isValidClaimNumber(claimNumber: string | null): boolean {
    if (!claimNumber) return false;
    return /^[A-Za-z0-9\-]{5,50}$/.test(claimNumber)
  }
} 