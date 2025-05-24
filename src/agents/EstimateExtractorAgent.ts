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
  LogLevel
} from './types'
import { PDFProcessor } from '@/lib/pdf-processor'
import { PDFToImagesTool } from '@/tools/pdf-to-images'
import { VisionModelProcessor, VisionModelConfig } from '@/tools/vision-models'
import { getSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

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

  constructor() {
    const config: AgentConfig = {
      name: 'EstimateExtractorAgent',
      version: '1.0.0',
      capabilities: ['text_extraction', 'vision_processing', 'field_validation'],
      defaultTimeout: 30000,
      maxRetries: 2,
      confidenceThreshold: 0.7,
      tools: ['pdf_processor', 'pdf_to_images', 'vision_models']
    }
    
    super(config)
    this.visionProcessor = new VisionModelProcessor()
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
        type: 'extract_fields',
        input: null, // Will be populated with text
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    // Add vision fallback task if strategy allows or if text extraction fails
    if (input.strategy === ExtractionStrategy.VISION_ONLY || 
        input.strategy === ExtractionStrategy.HYBRID ||
        input.strategy === ExtractionStrategy.FALLBACK) {
      tasks.push({
        id: uuidv4(),
        type: 'vision_fallback',
        input: input.pdfBuffer,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    return {
      tasks,
      dependencies: new Map([
        [tasks[1].id, [tasks[0].id]] // extract_fields depends on extract_text
      ]),
      estimatedDuration: 15000, // 15 seconds
      confidence: 0.8
    }
  }

  async act(input: EstimateExtractionInput, context: TaskContext): Promise<AgentResult<EstimateFieldExtractions>> {
    this.log(LogLevel.INFO, 'extraction-start', 'Starting estimate data extraction')
    
    let textExtractionResult: string = ''
    let textConfidence = 0
    let visionResults: EstimateFieldExtractions | null = null
    
    try {
      // Step 1: Extract text from PDF
      this.log(LogLevel.DEBUG, 'text-extraction', 'Extracting text from PDF')
      textExtractionResult = await PDFProcessor.extractText(input.pdfBuffer)
      textConfidence = this.calculateTextQuality(textExtractionResult)
      
      this.log(LogLevel.INFO, 'text-extracted', 
        `Text extraction completed. Quality score: ${textConfidence.toFixed(3)}`,
        { textLength: textExtractionResult.length, quality: textConfidence }
      )

      // Step 2: Extract fields from text
      let textResults: EstimateFieldExtractions | null = null
      
      if (textConfidence > 0.3) { // Only try text extraction if quality is reasonable
        this.log(LogLevel.DEBUG, 'field-extraction-text', 'Extracting fields from text')
        textResults = await this.extractFieldsFromText(textExtractionResult, context)
      }

      // Step 3: Vision fallback if needed
      const shouldUseVision = (
        input.strategy === ExtractionStrategy.VISION_ONLY ||
        input.strategy === ExtractionStrategy.HYBRID ||
        (input.strategy === ExtractionStrategy.FALLBACK && (!textResults || this.getOverallConfidence(textResults) < 0.6))
      )

      if (shouldUseVision && await PDFToImagesTool.isAvailable() && this.visionProcessor.isAvailable()) {
        this.log(LogLevel.INFO, 'vision-fallback', 'Using vision models for extraction')
        visionResults = await this.extractFieldsFromVision(input.pdfBuffer, context)
      }

      // Step 4: Combine results intelligently
      const finalResults = this.combineExtractionResults(textResults, visionResults, textConfidence)
      
      this.log(LogLevel.SUCCESS, 'extraction-complete', 
        `Extraction completed with overall confidence: ${this.getOverallConfidence(finalResults).toFixed(3)}`
      )

      return {
        data: finalResults,
        validation: await this.validate(finalResults, context),
        processingTimeMs: 0, // Will be set by base class
        model: 'hybrid'
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

    // Validate property address
    if (!result.propertyAddress.value || result.propertyAddress.value.length < 10) {
      errors.push('Property address is missing or too short')
    } else if (!this.isValidAddress(result.propertyAddress.value)) {
      warnings.push('Property address format may be incorrect')
    }

    // Validate claim number
    if (!result.claimNumber.value) {
      errors.push('Claim number is missing')
    } else if (!this.isValidClaimNumber(result.claimNumber.value)) {
      warnings.push('Claim number format may be incorrect')
    }

    // Validate insurance carrier
    if (!result.insuranceCarrier.value) {
      warnings.push('Insurance carrier is missing')
    }

    // Validate RCV amount
    if (!result.totalRCV.value || result.totalRCV.value <= 0) {
      warnings.push('Total RCV amount is missing or invalid')
    } else if (result.totalRCV.value > 1000000) {
      warnings.push('Total RCV amount seems unusually high')
    }

    // Calculate overall confidence
    const overallConfidence = this.getOverallConfidence(result)
    
    // Add suggestions based on confidence
    if (overallConfidence < 0.8) {
      suggestions.push('Consider manual review of extracted data')
    }
    
    if (result.lineItems.value.length === 0) {
      suggestions.push('No line items extracted - may need vision processing')
    }

    return {
      isValid: errors.length === 0,
      confidence: overallConfidence,
      errors,
      warnings,
      suggestions
    }
  }

  /**
   * Extract fields from text using AI models
   */
  private async extractFieldsFromText(text: string, context: TaskContext): Promise<EstimateFieldExtractions> {
    this.log(LogLevel.DEBUG, 'ai-extraction-start', 'Starting AI field extraction from text')
    
    // Get AI configurations from database
    const configs = await this.getAIConfigs([
      'extract_estimate_address',
      'extract_estimate_claim', 
      'extract_estimate_carrier',
      'extract_estimate_rcv'
    ])

    // Extract fields in parallel where possible
    const [address, claimNumber, carrier, rcv] = await Promise.all([
      this.extractSingleField('propertyAddress', text, configs.extract_estimate_address),
      this.extractSingleField('claimNumber', text, configs.extract_estimate_claim),
      this.extractSingleField('insuranceCarrier', text, configs.extract_estimate_carrier),
      this.extractSingleField('totalRCV', text, configs.extract_estimate_rcv)
    ])

    // Extract line items (more complex, separate call)
    const lineItems = await this.extractLineItems(text)

    return {
      propertyAddress: address,
      claimNumber: claimNumber,
      insuranceCarrier: carrier,
      dateOfLoss: this.createExtractedField(null, 0.0, 'Date of loss not extracted from text', 'text'),
      totalRCV: {
        ...rcv,
        value: parseFloat(rcv.value) || 0
      },
      totalACV: this.createExtractedField(0, 0.0, 'ACV not extracted', 'text'),
      deductible: this.createExtractedField(0, 0.0, 'Deductible not extracted', 'text'),
      lineItems: lineItems
    }
  }

  /**
   * Extract fields using vision models
   */
  private async extractFieldsFromVision(pdfBuffer: Buffer, context: TaskContext): Promise<EstimateFieldExtractions> {
    this.log(LogLevel.DEBUG, 'vision-extraction-start', 'Starting vision-based field extraction')
    
    // Convert PDF to images
    const imageDataUrls = await PDFToImagesTool.convertPDFToDataURLs(pdfBuffer, {
      dpi: 300,
      format: 'jpg',
      quality: 85
    })

    this.log(LogLevel.INFO, 'pdf-converted', `PDF converted to ${imageDataUrls.length} images`)

    // Use vision model to extract all fields at once
    const visionConfig: VisionModelConfig = {
      provider: 'anthropic', // Prefer Claude for document analysis
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 2000,
      temperature: 0.1
    }

    const prompt = `
Analyze these insurance estimate document images and extract the following information:

1. Property Address (the actual property being repaired, not mailing address)
2. Claim Number (complete number, may span multiple lines)
3. Insurance Carrier/Company name
4. Total RCV (Replacement Cost Value) amount
5. Date of Loss (if visible)
6. Total ACV (Actual Cash Value) amount (if different from RCV)
7. Deductible amount

Return the information in this exact JSON format:
{
  "propertyAddress": "full address",
  "claimNumber": "complete claim number",
  "insuranceCarrier": "company name",
  "totalRCV": numeric_value_only,
  "dateOfLoss": "YYYY-MM-DD or null",
  "totalACV": numeric_value_only_or_null,
  "deductible": numeric_value_only_or_null
}

Be precise and only extract what you can clearly see. Use null for missing values.
    `

    const visionResult = await this.visionProcessor.analyzeImages(imageDataUrls, prompt, visionConfig)
    
    this.log(LogLevel.INFO, 'vision-analysis-complete', 
      `Vision analysis completed with confidence ${visionResult.confidence.toFixed(3)}`
    )

    // Parse JSON response
    try {
      const parsed = JSON.parse(visionResult.extractedText)
      
      return {
        propertyAddress: this.createExtractedField(
          parsed.propertyAddress, 
          visionResult.confidence, 
          'Extracted via vision model', 
          'vision'
        ),
        claimNumber: this.createExtractedField(
          parsed.claimNumber, 
          visionResult.confidence, 
          'Extracted via vision model', 
          'vision'
        ),
        insuranceCarrier: this.createExtractedField(
          parsed.insuranceCarrier, 
          visionResult.confidence, 
          'Extracted via vision model', 
          'vision'
        ),
        dateOfLoss: this.createExtractedField(
          parsed.dateOfLoss ? new Date(parsed.dateOfLoss) : null, 
          visionResult.confidence * 0.8, 
          'Extracted via vision model', 
          'vision'
        ),
        totalRCV: this.createExtractedField(
          parsed.totalRCV || 0, 
          visionResult.confidence, 
          'Extracted via vision model', 
          'vision'
        ),
        totalACV: this.createExtractedField(
          parsed.totalACV || 0, 
          visionResult.confidence * 0.9, 
          'Extracted via vision model', 
          'vision'
        ),
        deductible: this.createExtractedField(
          parsed.deductible || 0, 
          visionResult.confidence * 0.9, 
          'Extracted via vision model', 
          'vision'
        ),
        lineItems: this.createExtractedField(
          [], 
          0.3, 
          'Line items not extracted via vision', 
          'vision'
        )
      }
    } catch (error) {
      this.log(LogLevel.WARN, 'vision-parse-failed', 'Failed to parse vision model JSON response')
      throw new Error(`Failed to parse vision model response: ${error}`)
    }
  }

  /**
   * Helper methods
   */
  private createExtractedField<T>(
    value: T, 
    confidence: number, 
    rationale: string, 
    source: 'text' | 'vision' | 'hybrid' | 'fallback'
  ): ExtractedField<T> {
    return {
      value,
      confidence,
      rationale,
      source,
      attempts: 1
    }
  }

  private calculateTextQuality(text: string): number {
    if (!text || text.length < 100) return 0.1
    
    // Calculate ratio of printable characters
    const printableChars = text.replace(/[^\x20-\x7E]/g, '').length
    const printableRatio = printableChars / text.length
    
    // Look for document structure indicators
    const hasStructure = /address|claim|total|amount|\$|insurance/i.test(text)
    
    return Math.min(0.9, printableRatio * 0.7 + (hasStructure ? 0.3 : 0))
  }

  private getOverallConfidence(results: EstimateFieldExtractions): number {
    const fields = [
      results.propertyAddress,
      results.claimNumber,
      results.insuranceCarrier,
      results.totalRCV
    ]
    
    const totalConfidence = fields.reduce((sum, field) => sum + field.confidence, 0)
    return totalConfidence / fields.length
  }

  private combineExtractionResults(
    textResults: EstimateFieldExtractions | null,
    visionResults: EstimateFieldExtractions | null,
    textQuality: number
  ): EstimateFieldExtractions {
    // If only one source available, use it
    if (!textResults) return visionResults!
    if (!visionResults) return textResults
    
    // Combine results, preferring higher confidence values
    return {
      propertyAddress: this.selectBestField(textResults.propertyAddress, visionResults.propertyAddress),
      claimNumber: this.selectBestField(textResults.claimNumber, visionResults.claimNumber),
      insuranceCarrier: this.selectBestField(textResults.insuranceCarrier, visionResults.insuranceCarrier),
      dateOfLoss: this.selectBestField(textResults.dateOfLoss, visionResults.dateOfLoss),
      totalRCV: this.selectBestField(textResults.totalRCV, visionResults.totalRCV),
      totalACV: this.selectBestField(textResults.totalACV, visionResults.totalACV),
      deductible: this.selectBestField(textResults.deductible, visionResults.deductible),
      lineItems: textResults.lineItems // Prefer text for line items
    }
  }

  private selectBestField<T>(field1: ExtractedField<T>, field2: ExtractedField<T>): ExtractedField<T> {
    if (field1.confidence > field2.confidence) {
      return { ...field1, source: 'hybrid' as const }
    } else {
      return { ...field2, source: 'hybrid' as const }
    }
  }

  // Validation helpers
  private isValidAddress(address: string): boolean {
    return /\d+.*[A-Za-z].*\d{5}/.test(address) // Basic address pattern
  }

  private isValidClaimNumber(claimNumber: string): boolean {
    return /^[A-Za-z0-9\-]{6,}$/.test(claimNumber) // At least 6 chars, alphanumeric with hyphens
  }

  // Placeholder methods (to be implemented)
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, any>> {
    // Implementation would fetch from database
    return {}
  }

  private async extractSingleField(fieldName: string, text: string, config: any): Promise<ExtractedField<string>> {
    // Implementation would call AI model
    return this.createExtractedField('', 0.5, 'Placeholder', 'text')
  }

  private async extractLineItems(text: string): Promise<ExtractedField<any[]>> {
    // Implementation would extract line items
    return this.createExtractedField([], 0.5, 'Placeholder', 'text')
  }
} 