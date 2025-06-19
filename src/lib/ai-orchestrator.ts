import { OpenAI } from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'
import { PDFProcessor } from './pdf-processor'
import { getSupabaseClient } from './supabase'
import { logStreamer } from './log-streamer'
import { EstimateData, RoofData, SupplementItem, AIConfig, JobData } from '@/types'
import { v4 as uuidv4 } from 'uuid'

interface AnalysisResult {
  missingItems: string[]
  discrepancies: string[]
  calculations: Record<string, number>
}

export class AIOrchestrator {
  private openai: OpenAI | null = null
  private anthropic: Anthropic | null = null
  private supabase = getSupabaseClient()
  private jobId: string
  private codes: Map<string, string> = new Map()

  constructor(jobId: string) {
    this.jobId = jobId
    // Only initialize if API keys are available
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

  async extractEstimateData(pdfBuffer: Buffer): Promise<Partial<EstimateData>> {
    const step = 'estimate-extraction'
    try {
      logStreamer.logStep(this.jobId, step, 'Starting estimate PDF text extraction and analysis.')
      const text = await PDFProcessor.extractText(pdfBuffer)
      logStreamer.logDebug(this.jobId, step, 'Estimate PDF text extracted.', { length: text.length })

      if (!this.openai && !this.anthropic) {
        logStreamer.logStep(this.jobId, step, 'No AI provider configured. Using fallback for estimate data.')
        return this.extractEstimateDataFallback(text)
      }
      
      const [address, claimNumber, carrier, rcv, lineItems] = await Promise.all([
        this.extractField('extract_estimate_address', text, step),
        this.extractField('extract_estimate_claim', text, step),
        this.extractField('extract_estimate_carrier', text, step),
        this.extractField('extract_estimate_rcv', text, step),
        this.extractLineItems(text, step)
      ])

      const estimateData: Partial<EstimateData> = {
        propertyAddress: address,
        claimNumber,
        insuranceCarrier: carrier,
        totalRCV: rcv ? parseFloat(rcv.replace(/[^\d.-]/g, '')) : undefined,
        lineItems
      }
      logStreamer.logSuccess(this.jobId, step, 'Estimate data extraction successful.', { extractedData: estimateData })
      return estimateData
    } catch (error: any) {
      console.error('Error extracting estimate data:', error)
      logStreamer.logError(this.jobId, step, `Error extracting estimate data: ${error.message}`, error)
      return { lineItems: [] }
    }
  }

  async extractRoofData(pdfBuffer: Buffer): Promise<Partial<RoofData>> {
    const step = 'roof-report-extraction'
    try {
      logStreamer.logStep(this.jobId, step, 'Starting roof report PDF text extraction and analysis.')
      const text = await PDFProcessor.extractText(pdfBuffer)
      logStreamer.logDebug(this.jobId, step, 'Roof report PDF text extracted.', { length: text.length })
      
      if (!this.openai && !this.anthropic) {
        logStreamer.logStep(this.jobId, step, 'No AI provider configured. Using fallback for roof data.')
        return this.extractRoofDataFallback(text)
      }
      
      const measurementsResponse = await this.extractField('extract_roof_measurements', text, step)
      
      // Parse the structured response
      const measurements = this.parseRoofMeasurements(measurementsResponse)
      logStreamer.logDebug(this.jobId, step, 'Roof measurements parsed.', { measurements })
      
      // Attempt to extract address from roof report as well, could be a fallback or comparison point
      const propertyAddress = await this.extractField('extract_estimate_address', text, `${step}-address`)

      const roofData: Partial<RoofData> = {
        propertyAddress: propertyAddress || undefined, // Use extracted address or undefined
        totalRoofArea: measurements.totalRoofArea,
        totalFacets: measurements.totalFacets,
        ridgeHipLength: measurements.ridgeHipLength,
        valleyLength: measurements.valleyLength,
        rakeLength: measurements.rakeLength,
        eaveLength: measurements.eaveLength,
        stories: measurements.stories,
        pitch: measurements.pitch
      }
      logStreamer.logSuccess(this.jobId, step, 'Roof data extraction successful.', { extractedData: roofData })
      return roofData
    } catch (error: any) {
      console.error('Error extracting roof data:', error)
      logStreamer.logError(this.jobId, step, `Error extracting roof data: ${error.message}`, error)
      return {}
    }
  }

  async analyzeDiscrepanciesAndSuggestSupplements(jobData: JobData, estimateLineItems: EstimateData['lineItems']): Promise<SupplementItem[]> {
    const step = 'supplement-analysis'
    logStreamer.logStep(this.jobId, step, 'Starting discrepancy analysis and supplement suggestion.')

    await this.loadCodes()

    const config = await this.getAIConfig('analyze_line_items')
    if (!config) {
      logStreamer.logError(this.jobId, step, 'AI config not found for analyze_line_items.')
      throw new Error('AI config not found for analyze_line_items')
    }

    // Construct roofData object from the flat jobData for the prompt
    const roofReportDataForPrompt = {
        property_address: jobData.property_address,
        roof_area_squares: jobData.roof_area_squares,
        eave_length: jobData.eave_length,
        rake_length: jobData.rake_length,
        ridge_hip_length: jobData.ridge_hip_length,
        valley_length: jobData.valley_length,
        stories: jobData.stories,
        pitch: jobData.pitch,
    };

    const dynamicPrompt = config.prompt
      .replace('{actual_extracted_line_items_from_estimate_pdf}', JSON.stringify(estimateLineItems, null, 2))
      .replace('{relevant_data_from_roof_report_pdf}', JSON.stringify(roofReportDataForPrompt, null, 2))
      .replace('{contents_of_codes_md}', Array.from(this.codes.entries()).map(([code, desc]) => `${code}: ${desc}`).join('\n'))

    try {
      logStreamer.logDebug(this.jobId, step, 'Preparing to call AI for supplement analysis.', { 
        estimateLineItemsCount: estimateLineItems?.length, 
        roofDataForPrompt: roofReportDataForPrompt 
      });
      const rawAnalysisResult = await this.callAI(config, dynamicPrompt, step); 
      
      const suggestedSupplements = this.parseSupplementSuggestions(rawAnalysisResult, step);
      logStreamer.logSuccess(this.jobId, step, 'Supplement analysis and suggestion completed.', { count: suggestedSupplements.length });
      return suggestedSupplements;

    } catch (err: any) {
      logStreamer.logError(this.jobId, step, `Error during supplement analysis: ${err.message}`, err);
      throw err;
    }
  }

  async analyzeDiscrepancies(estimateData: EstimateData, roofData: RoofData): Promise<AnalysisResult> {
    logStreamer.logStep(this.jobId, 'deprectated-discrepancy-analysis-start', 'Analyzing discrepancies (old method)');
    const analysisPrompt = `DEPRECATED - DO NOT USE`;
    const config = await this.getAIConfig('analyze_line_items');
    if (!config) {
      logStreamer.logError(this.jobId, 'deprecated-discrepancy-analysis', 'AI config not found for analyze_line_items in deprecated method.');
      // Return a default or empty AnalysisResult if config is not found
      return {
        missingItems: [],
        discrepancies: [],
        calculations: {},
      };
    }
    const response = await this.callAI(config, analysisPrompt, 'deprecated-discrepancy-analysis');
    return this.parseAnalysisResult(response);
  }

  async generateSupplementItems(analysis: AnalysisResult): Promise<SupplementItem[]> {
    logStreamer.logStep(this.jobId, 'deprecated-supplement-generation-start', 'Generating supplement items (old method)')
    return []
  }
  
  private parseSupplementSuggestions(aiResponse: string, parentStep: string): SupplementItem[] {
    const step = `${parentStep}-parsing`
    logStreamer.logStep(this.jobId, step, 'Parsing AI supplement suggestions with enhanced multi-item strategy.')
    const supplementItems: SupplementItem[] = []

    try {
      const suggestions = this.tryMultipleParsingStrategies(aiResponse, step)
      logStreamer.logDebug(this.jobId, step, `Extracted ${suggestions.length} raw suggestions from AI response.`, { suggestions })

      for (let index = 0; index < suggestions.length; index++) {
        const suggestion = suggestions[index]
        const parsedItem = this.createSupplementFromSuggestion(suggestion, index, step)
        if (parsedItem) {
          supplementItems.push(parsedItem)
          logStreamer.logDebug(this.jobId, step, `Successfully created supplement item ${index + 1}: "${parsedItem.line_item}"`)
        } else {
          logStreamer.logDebug(this.jobId, step, `Failed to create supplement item ${index + 1} from suggestion`, { suggestion })
        }
      }

      logStreamer.logSuccess(this.jobId, step, `Successfully parsed ${supplementItems.length} supplement items from ${suggestions.length} suggestions.`)
    } catch (error: any) {
      logStreamer.logError(this.jobId, step, `Error parsing supplement suggestions: ${error.message}`, { aiResponse, error })
    }
    return supplementItems
  }

  /**
   * Try multiple parsing strategies to extract suggestions from AI response
   * This is the core fix for the single-item output issue
   */
  private tryMultipleParsingStrategies(aiResponse: string, step: string): any[] {
    // Strategy 1: Direct JSON array parsing
    try {
      const directJson = JSON.parse(aiResponse)
      if (Array.isArray(directJson) && directJson.length > 0) {
        logStreamer.logDebug(this.jobId, step, 'Strategy 1 SUCCESS: Direct JSON array parsing', { count: directJson.length })
        return directJson
      }
      if (typeof directJson === 'object' && directJson !== null) {
        // Single object wrapped in array
        logStreamer.logDebug(this.jobId, step, 'Strategy 1 PARTIAL: Single object converted to array', { object: directJson })
        return [directJson]
      }
    } catch (e) {
      logStreamer.logDebug(this.jobId, step, 'Strategy 1 FAILED: Direct JSON parsing failed')
    }

    // Strategy 2: Extract JSON from markdown code blocks
    const jsonBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonBlockMatch) {
      try {
        const blockJson = JSON.parse(jsonBlockMatch[1])
        if (Array.isArray(blockJson)) {
          logStreamer.logDebug(this.jobId, step, 'Strategy 2 SUCCESS: JSON from markdown blocks', { count: blockJson.length })
          return blockJson
        }
        if (typeof blockJson === 'object' && blockJson !== null) {
          logStreamer.logDebug(this.jobId, step, 'Strategy 2 PARTIAL: Single object from markdown block')
          return [blockJson]
        }
      } catch (e) {
        logStreamer.logDebug(this.jobId, step, 'Strategy 2 FAILED: Markdown JSON parsing failed')
      }
    }

    // Strategy 3: Extract multiple JSON objects (one per line)
    const jsonObjectsPerLine = this.extractJsonObjectsPerLine(aiResponse, step)
    if (jsonObjectsPerLine.length > 0) {
      logStreamer.logDebug(this.jobId, step, 'Strategy 3 SUCCESS: JSON objects per line', { count: jsonObjectsPerLine.length })
      return jsonObjectsPerLine
    }

    // Strategy 4: Pattern-based extraction for structured text
    const patternExtracted = this.extractFromStructuredText(aiResponse, step)
    if (patternExtracted.length > 0) {
      logStreamer.logDebug(this.jobId, step, 'Strategy 4 SUCCESS: Pattern-based extraction', { count: patternExtracted.length })
      return patternExtracted
    }

    // Strategy 5: Intelligent line-by-line parsing with context
    const intelligentLineExtraction = this.extractFromLines(aiResponse, step)
    logStreamer.logDebug(this.jobId, step, `Strategy 5 FALLBACK: Intelligent line extraction found ${intelligentLineExtraction.length} items`)
    return intelligentLineExtraction
  }

  private extractJsonObjectsPerLine(text: string, step: string): any[] {
    const objects: any[] = []
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const obj = JSON.parse(trimmed)
          objects.push(obj)
        } catch (e) {
          // Ignore invalid JSON lines
        }
      }
    }
    return objects
  }

  private extractFromStructuredText(text: string, step: string): any[] {
    const items: any[] = []
    
    // Look for bullet points and extract item-reason pairs
    const bulletPattern = /[-*•]\s+(.+?):\s*(.+?)(?=\n|$)/g
    let match
    while ((match = bulletPattern.exec(text)) !== null) {
      const item = {
        line_item: match[1]?.trim(),
        reason: match[2]?.trim()
      }
      if (item.line_item && item.line_item.length > 1) { // Ensure it's not a single character
        items.push(item)
      }
    }

    // Look for numbered lists
    const numberedPattern = /\d+\.\s*(.+?):\s*(.+?)(?=\n|$)/g
    while ((match = numberedPattern.exec(text)) !== null) {
      const item = {
        line_item: match[1]?.trim(),
        reason: match[2]?.trim()
      }
      if (item.line_item && item.line_item.length > 1) {
        items.push(item)
      }
    }

    return items
  }

  private extractFromLines(text: string, step: string): any[] {
    const items: any[] = []
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    for (const line of lines) {
      // Skip obvious non-content lines
      if (this.isContentLine(line)) {
        const item = this.parseLineAsItem(line)
        if (item) {
          items.push(item)
        }
      }
    }

    return items
  }

  private isContentLine(line: string): boolean {
    const skipPatterns = [
      /^```/,
      /^here\s+are/i,
      /^the\s+following/i,
      /^analysis:/i,
      /^summary:/i,
      /^\[/,
      /^{/,
      /^}/
    ]
    // Don't skip lines that start with bullet points or have content structure
    if (line.match(/^[-*•]\s+/)) {
      return true // Always include bullet points
    }
    return !skipPatterns.some(pattern => pattern.test(line))
  }

  private parseLineAsItem(line: string): any | null {
    // Extract item name and reason from various formats
    const formats = [
      /^(.+?)\s*[-:]\s*(.+)$/,  // "Item - Reason" or "Item: Reason"
      /^(.+?)\s*\((.+?)\)$/,    // "Item (Reason)"
      /^(.+?)$/                 // Just "Item"
    ]

    for (const format of formats) {
      const match = line.match(format)
      if (match) {
        return {
          line_item: match[1]?.trim(),
          reason: match[2]?.trim() || 'Item identified as missing from analysis',
          confidence_score: 0.6 // Lower confidence for line parsing
        }
      }
    }
    return null
  }

  private buildItemFromMatches(match: RegExpExecArray): any {
    return {
      line_item: match[2]?.trim() || match[1]?.trim(),
      reason: match[3]?.trim(),
      xactimate_code: match[4]?.trim(),
      quantity: match[5] ? parseFloat(match[5]) : undefined,
      unit: match[6]?.trim()
    }
  }

  /**
   * Create a SupplementItem from a parsed suggestion
   * This replaces the strict validation that was dropping items
   */
  private createSupplementFromSuggestion(suggestion: any, index: number, step: string): SupplementItem | null {
    // Extract description with multiple fallbacks
    const description = suggestion.description || 
                       suggestion.line_item || 
                       suggestion.item || 
                       suggestion.name ||
                       suggestion.title

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      logStreamer.logDebug(this.jobId, step, `Item ${index + 1}: No valid description found`, { suggestion })
      return null
    }

    // Extract reason with fallbacks and smart defaults
    let reason = suggestion.reason || 
                suggestion.justification || 
                suggestion.explanation ||
                suggestion.why

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      // Create intelligent default reason based on description
      reason = this.generateDefaultReason(description)
      logStreamer.logDebug(this.jobId, step, `Item ${index + 1}: Generated default reason for "${description}"`)
    }

    // Extract and validate code
    let code = suggestion.code || suggestion.xactimate_code
    if (!code || code.toUpperCase() === 'TBD') {
      const foundCode = this.findCodeForDescription(description)
      code = foundCode || 'TBD'
      logStreamer.logDebug(this.jobId, step, `Item ${index + 1}: Code lookup for "${description}": ${code}`)
    }

    // Extract quantity and unit with validation
    const quantity = this.parseQuantity(suggestion.quantity)
    const unit = this.parseUnit(suggestion.unit, description)

    // Extract confidence with intelligent defaults
    const confidence = this.parseConfidence(suggestion.confidence_score || suggestion.confidence, quantity, unit, code !== 'TBD')

    const supplementItem: SupplementItem = {
      id: uuidv4(),
      job_id: this.jobId,
      line_item: description.trim(),
      reason: reason.trim(),
      xactimate_code: code,
      quantity: quantity,
      unit: unit,
      confidence_score: confidence,
      calculation_details: suggestion.calculation_details || suggestion.details || undefined,
      source_system: 'ai_suggestion' as const,
      business_rule_applied: undefined,
      validation_status: 'pending' as const
    }

    logStreamer.logDebug(this.jobId, step, `Item ${index + 1}: Created supplement`, { 
      line_item: supplementItem.line_item,
      reason: supplementItem.reason,
      code: supplementItem.xactimate_code,
      confidence: supplementItem.confidence_score
    })

    return supplementItem
  }

  private generateDefaultReason(description: string): string {
    const lowerDesc = description.toLowerCase()
    
    if (lowerDesc.includes('drip edge')) {
      return 'Drip edge required for proper roof edge protection'
    }
    if (lowerDesc.includes('ice') && lowerDesc.includes('water')) {
      return 'Ice & water barrier required by building code'
    }
    if (lowerDesc.includes('ridge cap') || lowerDesc.includes('hip cap')) {
      return 'Ridge cap required for proper roof ridge coverage'
    }
    if (lowerDesc.includes('starter')) {
      return 'Starter row required for proper shingle installation'
    }
    if (lowerDesc.includes('gutter apron')) {
      return 'Gutter apron required for proper water management'
    }
    
    return `${description} identified as missing or insufficient based on analysis`
  }

  private parseQuantity(quantityInput: any): number {
    if (typeof quantityInput === 'number' && !isNaN(quantityInput)) {
      return Math.max(0, quantityInput)
    }
    if (typeof quantityInput === 'string') {
      const parsed = parseFloat(quantityInput.replace(/[^\d.-]/g, ''))
      if (!isNaN(parsed)) {
        return Math.max(0, parsed)
      }
    }
    return 1 // Default quantity
  }

  private parseUnit(unitInput: any, description: string): string {
    if (typeof unitInput === 'string' && unitInput.trim().length > 0) {
      return unitInput.trim().toUpperCase()
    }
    
    // Intelligent unit detection based on description
    const lowerDesc = description.toLowerCase()
    if (lowerDesc.includes('linear') || lowerDesc.includes('length') || lowerDesc.includes('edge') || lowerDesc.includes('drip')) {
      return 'LF'
    }
    if (lowerDesc.includes('area') || lowerDesc.includes('square') || lowerDesc.includes('barrier') || lowerDesc.includes('ice')) {
      return 'SF'
    }
    return 'EA' // Default unit
  }

  private parseConfidence(confidenceInput: any, quantity: number, unit: string, hasValidCode: boolean): number {
    let baseConfidence = 0.75 // Default confidence
    
    if (typeof confidenceInput === 'number' && !isNaN(confidenceInput)) {
      baseConfidence = Math.max(0, Math.min(1, confidenceInput))
    } else if (typeof confidenceInput === 'string') {
      const parsed = parseFloat(confidenceInput)
      if (!isNaN(parsed)) {
        baseConfidence = Math.max(0, Math.min(1, parsed))
      }
    }

    // Adjust confidence based on data quality
    if (!hasValidCode) baseConfidence *= 0.9
    if (quantity <= 0) baseConfidence *= 0.8
    if (unit === 'EA' && quantity === 1) baseConfidence *= 0.95 // Common default case

    return Math.round(baseConfidence * 1000) / 1000 // Round to 3 decimal places
  }

  private findCodeForDescription(description: string): string | null {
    // Normalize description for matching (lowercase, remove pluralization if simple)
    const normalizedDescription = description.toLowerCase().replace(/s$/, '')
    for (const [code, codeDesc] of Array.from(this.codes.entries())) {
      const normalizedCodeDesc = codeDesc.toLowerCase()
      if (normalizedCodeDesc.includes(normalizedDescription) || normalizedDescription.includes(normalizedCodeDesc)) {
        return code
      }
    }
    // More sophisticated matching could be added here (e.g., Levenshtein distance)
    return null
  }
  
  private async loadCodes(): Promise<void> {
    const step = 'load-codes'
    if (this.codes.size > 0) {
      logStreamer.logDebug(this.jobId, step, 'Codes already loaded.')
      return
    }
    try {
      logStreamer.logStep(this.jobId, step, 'Loading Xactimate codes.')
      
      // Placeholder for actual codes.md content loading.
      // In a production Vercel environment, direct file system access is not reliable for serverless functions.
      // Consider: 
      // 1. Bundling codes.md into the deployment (e.g., as a JS/JSON module via a build script).
      // 2. Fetching from a stable URL if codes.md is hosted.
      // 3. Storing in Supabase (e.g., a simple table or a JSONB field in a config table).
      // For now, using a more complete hardcoded representation based on the provided codes.md.
      const codesContent = `
| RFG 220         | 3 tab -20 Yr comp shingle roofing - incl, felt                     |
| RFG 220S        | 3 tab - 20 Yr comp shingle roofing -w/out felt                     |
| RFG 220E        | 3 tab 20 Yr comp. shingles (PER SHINGLE)                           |
| RFG 240         | 3 Tab 25 yr shingle roofing incl. felt                             |
| RFG 240S        | 3 tab - 25 Yr comp shingle roofing -w/out                          |
| RFG 240E        | 3 tab 25 Yr comp. shingles (PER SHINGLE)                           |
| RFG 300         | Laminated -comp shingle roofing incl. felt                         |
| RFG 300S        | Laminated comp shingle roofing -w/out                              |
| RFG 300E        | Laminated comp shingle - (PER SHINGLE)                             |
| RFG 400         | Laminaged - High Grade Comp shingle inc felt                       |
| RFG ARMVN       | Tear off comp shingles (no haul off)                               |
| RFG ARMV        | Tear off comp shingles including haul off 3-Tab                    |
| RFG ARMV>       | Tear off comp shingles including haul off - Laminated              |
| RFG ADDRMVN     | Additional layer comp shingles remove( No haul off) 3 Tab          |
| RFG ADDRMV      | Additional layer comp shingles remove and haul off - 3 Tab         |
| RFG ADDRMV>     | Add Layer of compl shingles remove and dipsose Laminated           |
| RFG BI          | Modified Bitumen Roof                                              |
| RFG BIRMV       | Removal, haul and dispose of bitumen roof                          |
| RFG CFG         | Corrogated fiberglass Roofing (green house type)                   |
| RFG DRIP        | Drip edge                                                          |
| RFG FELT15      | Roofing felt , 15lb                                                |
| RFG FELT30      | Roofing felt, 30lb                                                 |
| RFG FLPIPE      | Flashing Pipe Jack                                                 |
| RFG FLPIPEL     | Flashing Pipe Jack Lead                                            |
| RFG HIGH        | Additional Charge for high roof 2 stories or >                     |
| RFG STEEP       | Additional Charge for steep roof 7/12 - 9/12                       |
| RFG IWS         | Ice & Water Shield                                                 |
| RFG MTL         | Metal roofing - baked on paint                                     |
| RFG PAV         | Power Attic Vent                                                   |
| RFG PAVC        | Power Attic Vent ( Cover only)                                     |
| RFG PAVC-       | Power Attic Vent Plastic (cover only)                              |
| RFG RIDGC       | Ridge Cap - comp shingles                                          |
| RFG RIDGC+      | Ridge Cap - High Profile comp shingles                             |
| RFG RL          | Roll Roofing                                                       |
| RFG RLRMV       | Removal , haul off of roll roofing                                 |
| RFG VENTA       | Ridge Vent Aluminum                                                |
| RFG VENTB       | Turbine vent                                                       |
| RFG VENTT       | Turtle Vent                                                        |
| RFG VENTR       | Ridge vent shingle over                                            |
| RFG VENTE       | Exhaust cap - through roof 6"to 8"                                 |
| HVC VENTCAP     | Exterior cover for vent 5"-6" (Cap only)                           |
| RFG VMTL        | Valley metal                                                       |
| RFG FLCH        | Chimney flashing average- 32"to 36"                                |
| FPL FLCP        | Flue cap                                                           |
| FPL CCAPM       | Fire place chimney chase cap metal                                 |
| ELS DISH        | Satelight dish and receiver                                        |
| SFG GUTA        | Gutter Aluminum 5" eave and downspouts                             |
| SFG GUTA>       | Gutter Aluminum 6" and above eave and downspouts                   |
| SFG GUTG        | Gutter Galvanized up to 5" eave and downspouts                     |
| SFG GUTP        | Gutter plastic, eave and DS                                        |
| SFG GRD         | Gutter guard/ screen                                               |
| PNT GUTG        | Prime & paint gutter / downspout                                   |
| PNT GUTG>       | Prime & paint gutter /downspout - oversized                        |
| SFG FACFC4      | Fascia, fiber cement 4"                                            |
| SFG FACM4       | Fascia, metal 4"                                                   |
| SFG FACV        | Fascia, vinyl coated aluminum 4" to 6"                             |
| SFG FACV>       | Fascia, vinyl coated aluminum 7" to 10"                            |
| SFG FACW4       | Fascia wood, 4"                                                    |
| PNT FACW        | Paint Fascia Wood 4"to 6"                                          |
| PNT FACW>       | Paint Fascia Wood 6" to 8"                                         |
| SFG SFTFC       | Soffit fiber cement                                                |
| SFG SFTM        | Soffit Metal                                                       |
| SFG SFTV        | Soffit Vinyl                                                       |
| SFG SFTW        | Soffit Wood                                                        |
| PNT SFTW        | Paint Soffit Wood                                                  |
| SDG MTL         | Aluminum Siding                                                    |
| SDG MTL+        | Steel Siding                                                       |
| SDG VINYL       | Vinyl Siding                                                       |
| SDG VINYLC      | Vinyl outside corner post                                          |
| SDG FCLP<       | Siding fiber cement 8" lap                                         |
| SDG T111        | Siding- hardboard panel paint grade                                |
| SDG SHTR        | Shutters - simulated wood (polystyrene)                            |
| SDG SHTRW       | Shutters wood - louvered or paneled                                |
| SDG SHTRA       | Shutters aluminum                                                  |
| PNT SHTR        | Paint Shutters per side (set)                                      |
| SDG WDWRAP      | Wrap Wood window frame & trim with alum sheet                      |
| SDG WRAPGD      | Wrap Wood Garage Door frame and trim with aluminum sheet ( PER LF) |
| SDG WRAPP       | Wrap Wood Post with Alum. (PER LF)                                 |
| WDR CLAD        | Window Cladding                                                    |
| WDR GBA         | glazing bead aluminum                                              |
| WDR GBV         | Glazing Bead Vinyl                                                 |
| WDR GLAZ        | reglaze window 10-16 sf                                            |
| WDR SCRN<       | Window screen <9SF                                                 |
| WDR SCRN        | Winodw Screen 10-16 SF                                             |
| WDR SWS<        | Solar window screen <9 SF                                          |
| WDR SWS         | Solar window screen 10 16 SF                                       |
| SPE WWCPL       | Window well cover plastic up to 42" wide by 19"                    |
| PNT FACW        | Paint Fascia wood 4" to 6 "                                        |
| PNT SFTW        | Paint Soffit Wood                                                  |
| PNT SDG         | Paint Siding                                                       |
| PNT SDGS        | Stain & Finish wood siding                                         |
| PNT WDW         | Paint wood window                                                  |
| PNT OP          | Paint door or window opening                                       |
| PNT DORT        | Paint door/window trim & jamb 2 cts( per side)                     |
| PNT XDOR        | Paint exterior door                                                |
| PNT OH          | Paint Overhead door                                                |
| PNT FRX         | Paint french exterior door slab only (per side)                    |
| PNT X1          | Paint exterior one coat                                            |
| PNT X2          | Paint exterior two coats                                           |
| DOR OH8         | Overhead door and hardware 7-8'                                    |
| DOR STRMD       | Storm door                                                         |
| AWN PCDK        | Patio cover- roof deck only - moderate load                        |
| AWN PCDKINS     | Patio Cover - Insulated roof deck only                             |
| AWN PCFACG      | Patio cover fascia end guttered                                    |
| AWN PCFACN      | Patio Cover fascia end non guttered                                |
| AWN WINA        | Awning - window or door aluminum or steel                          |
| AWN WINASP      | Awning side panels alum/steel (per set)                            |
| AWN WINACLR     | Awning - Aluminum or steel - add for each color stripe             |
| HVC ACFINS      | Comb and straighten A/C condensor fins - with trip charge          |
| HVC DVENTHD     | clothes dryer vent cover                                           |
| HVC ACFINC      | A/C fin condenser cage (bid item)                                  |
| STU COLOR       | Stucco color coat (redash) - sand texture                          |
| STU AV          | Metal lath & stucco                                                |
| STU SYNW        | Synthetic stucco on 1" poly board - water managed                  |
| STU SYN         | Synthetic stucco on 1" poly board                                  |
| PNT STU         | Paint Stucco                                                       |
| XST SHEDMB<     | Storage shed- Metal Barn Type (gambel) 10x8                        |
| XST SHEDMG<     | Storage Shed - metal gable type 8x 6                               |
| LIT X           | Exterior Light fixture                                             |
| LIT XPOST       | Exterior post light fixture                                        |
| LIT XMOS        | Motion Sensor for exterior light fixture                           |
| LIT BLISP       | Light bulb - incandescent spot/flood                               |
| WDS DSF         | Skylight - single dome fixed 6.6 to 9 SF                           |
| WDS DDF         | Skylight - double dome fixed 6.6 -9 SF                             |
| WDS DDFL        | Skylight - flashing kit - domed                                    |
| WDR CLADS       | Skylight Cladding                                                  |
| WDR SKY         | Reglaze Skylight                                                   |
| DMO PU          | Haul debris per pick up load inc. dump fees                        |
| DMO DUMP        | Dumpster Load, Approx 20 yards, 4 tons of debris                   |
| DMO TREEHR      | Tree-Removal and disposal per hr incl. equip.                      |
| DMO TREELHR     | Tree - Removal - per hour (labor only)                             |
| DRY 1/2-        | Drywall 1/2" hung taped , floated, ready for tex                   |
| DRY 1/2         | Drywall 1/2" hung,taped,floated, orangepeel tex                    |
| DRY ACR         | Scrape off acoustic texture                                        |
| DRY AC          | Acoustic popcorn texture                                           |
      `;
      
      const lines = codesContent.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('|') && line.includes('|')) {
          const parts = line.split('|').map(p => p.trim())
          if (parts.length >= 3 && parts[1] && parts[2] && parts[1] !== 'Code' && parts[1] !== '-----------------') {
            this.codes.set(parts[1], parts[2])
          }
        }
      }
      logStreamer.logSuccess(this.jobId, step, `Loaded ${this.codes.size} codes.`)
      if (this.codes.size === 0) {
        logStreamer.logError(this.jobId, step, 'No codes were loaded. Check codes.md parsing or source.')
      }
    } catch (error: any) {
      logStreamer.logError(this.jobId, step, `Failed to load codes: ${error.message}`, error)
    }
  }

  private async extractField(configStepName: string, text: string, parentStep: string): Promise<string> {
    const step = `${parentStep}-${configStepName}`
    const config = await this.getAIConfig(configStepName)
    if (!config) {
      logStreamer.logError(this.jobId, step, `AI config not found for step: ${configStepName}`)
      throw new Error(`AI config not found for step: ${configStepName}`)
    }
    // logStreamer.logStep(this.jobId, step, `Calling AI to extract field: ${configStepName}`); // Covered by callAI logging
    const prompt = `${config.prompt}\n\nDocument text:\n${text}`
    return this.callAI(config, prompt, step) // Pass full config
  }

  private async extractLineItems(text: string, parentStep: string): Promise<EstimateData['lineItems']> {
    const step = `${parentStep}-extract-line-items`
    const configStepName = 'extract_estimate_line_items' // Assuming a dedicated config for this
    let config = await this.getAIConfig(configStepName)

    if (!config) {
      logStreamer.logDebug(this.jobId, step, `No specific AI config for '${configStepName}'. Using 'analyze_line_items' as fallback.`)
      // Fallback to a more general config if specific one isn't found.
      config = await this.getAIConfig('analyze_line_items') 
      if (!config) {
        logStreamer.logError(this.jobId, step, `Fallback AI config 'analyze_line_items' also not found for line item extraction.`)
        throw new Error(`AI config not found for line item extraction.`)
      }
    }
    
    const prompt = `${config.prompt // Use the prompt from the loaded config
    }\n\nExtract all line items from this roofing estimate document. 
    For each item, identify:
    - Description (e.g., "3 tab 25 Yr shingle roofing incl. felt")
    - Quantity (e.g., 23.5)
    - Unit (e.g., "SF", "LF", "EA")
    - Unit Price (numeric, e.g., 150.00)
    - Total Price (numeric, e.g., 3525.00)
    If a value is not present, use null or omit the key.
    Return as a JSON array of objects.
    
    Document text:
    ${text}`

    // logStreamer.logStep(this.jobId, step, 'Extracting line items via AI.'); // Covered by callAI
    const response = await this.callAI(config, prompt, step) // Pass full config
    
    try {
      const parsedResponse = JSON.parse(response)
      if (Array.isArray(parsedResponse)) {
        logStreamer.logSuccess(this.jobId, step, `Successfully extracted ${parsedResponse.length} line items.`)
        return parsedResponse.map((item: any) => ({ // Basic validation/transformation
            description: item.description || 'N/A',
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || 'N/A',
            unitPrice: parseFloat(item.unitPrice) || 0,
            totalPrice: parseFloat(item.totalPrice) || 0,
        }))
      }
      logStreamer.logError(this.jobId, step, 'Failed to parse line items: AI response was not a JSON array.', { response })
      return []
    } catch (error: any) {
      logStreamer.logError(this.jobId, step, `Failed to parse line items JSON: ${error.message}`, { response })
      return [] // If JSON parsing fails, return empty array
    }
  }

  private parseRoofMeasurements(measurementsText: string): Partial<RoofData> {
    // Parse the AI response into structured roof data
    // This would include regex patterns or JSON parsing depending on AI response format
    const data: Partial<RoofData> = {}
    
    // Extract numeric values from the response
    const areaMatch = measurementsText.match(/(?:roof area|total area)[:\s]*(\d+(?:\.\d+)?)/i)
    if (areaMatch) data.totalRoofArea = parseFloat(areaMatch[1])
    
    const eaveMatch = measurementsText.match(/eave[:\s]*(\d+(?:\.\d+)?)/i)
    if (eaveMatch) data.eaveLength = parseFloat(eaveMatch[1])
    
    const rakeMatch = measurementsText.match(/rake[:\s]*(\d+(?:\.\d+)?)/i)
    if (rakeMatch) data.rakeLength = parseFloat(rakeMatch[1])
    
    const ridgeMatch = measurementsText.match(/(?:ridge|hip)[:\s]*(\d+(?:\.\d+)?)/i)
    if (ridgeMatch) data.ridgeHipLength = parseFloat(ridgeMatch[1])
    
    const valleyMatch = measurementsText.match(/valley[:\s]*(\d+(?:\.\d+)?)/i)
    if (valleyMatch) data.valleyLength = parseFloat(valleyMatch[1])
    
    const storiesMatch = measurementsText.match(/(?:stories|story)[:\s]*(\d+)/i)
    if (storiesMatch) data.stories = parseInt(storiesMatch[1])
    
    const pitchMatch = measurementsText.match(/pitch[:\s]*(\d+\/\d+|\d+:\d+)/i)
    if (pitchMatch) data.pitch = pitchMatch[1]
    
    return data as RoofData
  }

  private parseAnalysisResult(analysisText: string): AnalysisResult {
    logStreamer.logDebug(this.jobId, 'parse-analysis-result', 'Parsing old analysis result format.', { length: analysisText.length })
    // Parse AI analysis response into structured format
    return {
      missingItems: this.extractMissingItems(analysisText),
      discrepancies: this.extractDiscrepancies(analysisText),
      calculations: this.extractCalculations(analysisText)
    }
  }

  private extractMissingItems(text: string): string[] {
    // Extract missing items from AI response
    const lines = text.split('\n')
    const missingItems: string[] = []
    
    for (const line of lines) {
      if (line.toLowerCase().includes('missing') || line.toLowerCase().includes('not found')) {
        missingItems.push(line.trim())
      }
    }
    
    return missingItems
  }

  private extractDiscrepancies(text: string): string[] {
    // Extract discrepancies from AI response
    const lines = text.split('\n')
    const discrepancies: string[] = []
    
    for (const line of lines) {
      if (line.toLowerCase().includes('discrepancy') || line.toLowerCase().includes('difference')) {
        discrepancies.push(line.trim())
      }
    }
    
    return discrepancies
  }

  private extractCalculations(text: string): Record<string, number> {
    // Extract calculated quantities from AI response
    const calculations: Record<string, number> = {}
    
    // Look for patterns like "Gutter apron: 150 LF"
    const matches = text.match(/([^:\n]+):\s*(\d+(?:\.\d+)?)\s*(?:LF|SF|EA)/gi)
    if (matches) {
      for (const match of matches) {
        const [, item, value] = match.match(/([^:]+):\s*(\d+(?:\.\d+)?)/) || []
        if (item && value) {
          calculations[item.trim()] = parseFloat(value)
        }
      }
    }
    
    return calculations
  }

  private async createSupplementItem(missingItem: string, calculations: Record<string, number>): Promise<SupplementItem | null> {
    // This method is likely deprecated by the new `analyzeDiscrepanciesAndSuggestSupplements`
    // and `parseSupplementSuggestions`
    logStreamer.logDebug(this.jobId, 'create-supplement-item-old', 'Old createSupplementItem called.', { missingItem });
    // const step = 'create-supplement-item-old'; // step variable not used
    await this.loadCodes(); // Ensure codes are loaded

    const itemDescription = missingItem.split(':')[0].trim(); // Basic parsing
    let itemCode = this.findCodeForDescription(itemDescription) || 'TBD';

    // Placeholder for quantity and pricing logic
    const quantity = calculations[itemDescription] || 1;
    // unitPrice and totalPrice removed as they are not in SupplementItem type

    return {
      id: uuidv4(),
      job_id: this.jobId, // Corrected
      xactimate_code: itemCode, // Corrected
      line_item: itemDescription, // Corrected
      reason: `Identified as missing: ${missingItem}`,
      quantity: quantity,
      unit: 'EA', // Placeholder, ensure this is a valid unit or handle appropriately
      // unitPrice and totalPrice removed
      confidence_score: 0.6, // Lower confidence for old method
      // status, createdAt, updatedAt removed
      calculation_details: `Calculated quantity: ${quantity}`, // Example for calculation_details
    };
  }

  private async callAI(config: AIConfig, prompt: string, stepNameForLog: string): Promise<string> {
    const { provider, model, temperature, max_tokens } = config

    logStreamer.logAIPrompt(this.jobId, stepNameForLog, prompt, model)

    let responseText = ''

    try {
      if (provider === 'openai' && this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: temperature || 0.1,
          max_tokens: max_tokens || 1000,
        })
        responseText = completion.choices[0]?.message?.content || ''
      } else if (provider === 'anthropic' && this.anthropic) {
        const completion = await this.anthropic.messages.create({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: temperature || 0.1,
          max_tokens: max_tokens || 1000,
        })
        responseText = completion.content[0]?.type === 'text' ? completion.content[0].text : ''
      } else {
        logStreamer.logError(this.jobId, stepNameForLog, `AI provider ${provider} not supported or not initialized.`)
        throw new Error(`AI provider ${provider} not supported or not initialized.`)
      }
      logStreamer.logAIResponse(this.jobId, stepNameForLog, 'AI call successful.', { provider, model }, undefined, responseText)
      return responseText

    } catch (error: any) {
      logStreamer.logError(this.jobId, stepNameForLog, `AI call failed for provider ${provider}, model ${model}: ${error.message}`, error)
      throw error
    }
  }

  private async getAIConfig(stepName: string): Promise<AIConfig | null> {
    const { data, error } = await this.supabase
      .from('ai_config')
      .select('*')
      .eq('step_name', stepName)
      .single()

    if (error) {
      console.error('Failed to fetch AI config:', error)
      return null
    }

    return data
  }

  private extractEstimateDataFallback(text: string): Partial<EstimateData> {
    logStreamer.logStep(this.jobId, 'fallback-estimate-extraction', 'Using regex fallback for estimate data.')
    // Basic regex-based extraction when AI is not available
    const addressMatch = text.match(/(?:property|address|location)[:\s]*([^\n]{20,100})/i)
    
    // Improved claim number regex to handle multi-line claim numbers
    // Look for "Claim Number:" followed by the number, potentially spanning multiple lines
    const claimMatch = text.match(/(?:claim\s*(?:number|#)?)[:\s]*([A-Z0-9-]+(?:\s*[A-Z0-9-]+)?)/i)
    
    const carrierMatch = text.match(/(?:insurance|carrier|company)[:\s]*([^\n]{5,50})/i)
    const rcvMatch = text.match(/(?:rcv|total|amount)[:\s]*\$?([\d,]+\.?\d*)/i)

    return {
      propertyAddress: addressMatch?.[1]?.trim(),
      claimNumber: claimMatch?.[1]?.replace(/\s+/g, '-').trim(), // Join multi-line claim numbers with hyphen
      insuranceCarrier: carrierMatch?.[1]?.trim(),
      totalRCV: rcvMatch ? parseFloat(rcvMatch[1].replace(/,/g, '')) : undefined,
      lineItems: []
    }
  }

  private extractRoofDataFallback(text: string): Partial<RoofData> {
    logStreamer.logStep(this.jobId, 'fallback-roof-extraction', 'Using regex fallback for roof data.')
    // Basic regex-based extraction for roof measurements
    const areaMatch = text.match(/(?:roof area|total area|squares)[:\s]*(\d+(?:\.\d+)?)/i)
    const eaveMatch = text.match(/eave[:\s]*(\d+(?:\.\d+)?)/i)
    const rakeMatch = text.match(/rake[:\s]*(\d+(?:\.\d+)?)/i)
    const ridgeMatch = text.match(/(?:ridge|hip)[:\s]*(\d+(?:\.\d+)?)/i)
    const valleyMatch = text.match(/valley[:\s]*(\d+(?:\.\d+)?)/i)
    const storiesMatch = text.match(/(?:stories|story)[:\s]*(\d+)/i)
    const pitchMatch = text.match(/pitch[:\s]*(\d+\/\d+|\d+:\d+)/i)

    return {
      totalRoofArea: areaMatch ? parseFloat(areaMatch[1]) : undefined,
      eaveLength: eaveMatch ? parseFloat(eaveMatch[1]) : undefined,
      rakeLength: rakeMatch ? parseFloat(rakeMatch[1]) : undefined,
      ridgeHipLength: ridgeMatch ? parseFloat(ridgeMatch[1]) : undefined,
      valleyLength: valleyMatch ? parseFloat(valleyMatch[1]) : undefined,
      stories: storiesMatch ? parseInt(storiesMatch[1]) : undefined,
      pitch: pitchMatch?.[1]
    }
  }
}