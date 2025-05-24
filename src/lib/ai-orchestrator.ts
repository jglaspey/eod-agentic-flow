import { OpenAI } from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'
import { PDFProcessor } from './pdf-processor'
import { getSupabaseClient } from './supabase'
import { logStreamer } from './log-streamer'
import { EstimateData, RoofData, SupplementItem, AIConfig } from '@/types'

interface AnalysisResult {
  missingItems: string[]
  discrepancies: string[]
  calculations: Record<string, number>
}

export class AIOrchestrator {
  private openai: OpenAI | null = null
  private anthropic: Anthropic | null = null
  private supabase = getSupabaseClient()
  private jobId?: string
  constructor(jobId?: string) {
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

  async extractEstimateData(pdfBuffer: Buffer): Promise<EstimateData> {
    try {
      logStreamer.logStep(this.jobId || 'unknown', 'estimate-extraction-start', 'Extracting estimate PDF text')
      const text = await PDFProcessor.extractText(pdfBuffer)
      
      if (!this.openai && !this.anthropic) {
        // Fallback: try to extract basic info using regex patterns
        return this.extractEstimateDataFallback(text)
      }
      
      const [address, claimNumber, carrier, rcv, lineItems] = await Promise.all([
        this.extractField('extract_estimate_address', text),
        this.extractField('extract_estimate_claim', text),
        this.extractField('extract_estimate_carrier', text),
        this.extractField('extract_estimate_rcv', text),
        this.extractLineItems(text)
      ])

      return {
        propertyAddress: address,
        claimNumber,
        insuranceCarrier: carrier,
        totalRCV: rcv ? parseFloat(rcv) : undefined,
        lineItems
      }
    } catch (error) {
      console.error('Error extracting estimate data:', error)
      logStreamer.logError(this.jobId || 'unknown', 'estimate-extraction', String(error))
      return { lineItems: [] }
    }
  }

  async extractRoofData(pdfBuffer: Buffer): Promise<RoofData> {
    try {
      logStreamer.logStep(this.jobId || 'unknown', 'roof-report-extraction-start', 'Extracting roof report PDF text')
      const text = await PDFProcessor.extractText(pdfBuffer)
      
      if (!this.openai && !this.anthropic) {
        // Fallback: try to extract basic info using regex patterns
        return this.extractRoofDataFallback(text)
      }
      
      const measurementsResponse = await this.extractField('extract_roof_measurements', text)
      
      // Parse the structured response
      const measurements = this.parseRoofMeasurements(measurementsResponse)
      
      return {
        propertyAddress: await this.extractField('extract_estimate_address', text),
        totalRoofArea: measurements.totalRoofArea,
        totalFacets: measurements.totalFacets,
        ridgeHipLength: measurements.ridgeHipLength,
        valleyLength: measurements.valleyLength,
        rakeLength: measurements.rakeLength,
        eaveLength: measurements.eaveLength,
        stories: measurements.stories,
        pitch: measurements.pitch
      }
    } catch (error) {
      console.error('Error extracting roof data:', error)
      logStreamer.logError(this.jobId || 'unknown', 'roof-report-extraction', String(error))
      return {}
    }
  }

  async analyzeDiscrepancies(estimateData: EstimateData, roofData: RoofData): Promise<AnalysisResult> {
    logStreamer.logStep(this.jobId || 'unknown', 'discrepancy-analysis-start', 'Analyzing discrepancies')
    const analysisPrompt = `
    Compare this insurance estimate with the roof inspection data and identify discrepancies:
    
    ESTIMATE DATA:
    ${JSON.stringify(estimateData, null, 2)}
    
    ROOF DATA:
    ${JSON.stringify(roofData, null, 2)}
    
    Focus on:
    1. Missing line items that should be included based on roof measurements
    2. Quantity discrepancies
    3. Required calculations for standard items
    
    Return a structured analysis of missing items and discrepancies.
    `

    try {
      const response = await this.callAI('analyze_line_items', analysisPrompt)
      return this.parseAnalysisResult(response)
    } catch (err) {
      logStreamer.logError(this.jobId || 'unknown', 'discrepancy-analysis', String(err))
      throw err
    }
  }

  async generateSupplementItems(analysis: AnalysisResult): Promise<SupplementItem[]> {
    logStreamer.logStep(this.jobId || 'unknown', 'supplement-generation-start', 'Generating supplement items')
    const supplementItems: SupplementItem[] = []

    // Generate specific supplement items based on analysis
    for (const missingItem of analysis.missingItems) {
      try {
        const item = await this.createSupplementItem(missingItem, analysis.calculations)
        if (item) {
          supplementItems.push(item)
        }
      } catch (err) {
        logStreamer.logError(this.jobId || 'unknown', 'supplement-generation', String(err))
      }
    }

    return supplementItems
  }

  private async extractField(stepName: string, text: string): Promise<string> {
    const config = await this.getAIConfig(stepName)
    if (!config) {
      throw new Error(`AI config not found for step: ${stepName}`)
    }
    logStreamer.logStep(this.jobId || 'unknown', stepName, 'Calling AI to extract field')
    return this.callAI(stepName, `${config.prompt}\n\nDocument text:\n${text}`)
  }

  private async extractLineItems(text: string) {
    const prompt = `
    Extract all line items from this roofing estimate document. 
    For each item, identify:
    - Description
    - Quantity 
    - Unit (SF, LF, EA, etc.)
    - Unit price (if available)
    - Total price (if available)
    
    Return as JSON array.
    
    Document text:
    ${text}
    `

    logStreamer.logStep(this.jobId || 'unknown', 'estimate-line-items', 'Extracting line items')
    const response = await this.callAI('analyze_line_items', prompt)
    
    try {
      return JSON.parse(response)
    } catch {
      // If JSON parsing fails, return empty array
      return []
    }
  }

  private parseRoofMeasurements(measurementsText: string): RoofData {
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
    // Create supplement item based on missing item analysis
    const item = missingItem.toLowerCase()
    
    if (item.includes('gutter apron')) {
      return {
        id: '',
        job_id: '',
        line_item: 'Gutter Apron',
        xactimate_code: 'RFG_GAPRN',
        quantity: calculations['gutter apron'] || calculations['eave length'] || 0,
        unit: 'LF',
        reason: 'Missing gutter apron based on eave measurements',
        confidence_score: 0.9,
        calculation_details: 'Calculated from eave length measurements'
      }
    }
    
    if (item.includes('drip edge')) {
      return {
        id: '',
        job_id: '',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG_DRPEDG',
        quantity: calculations['drip edge'] || (calculations['eave length'] || 0) + (calculations['rake length'] || 0),
        unit: 'LF',
        reason: 'Missing drip edge for eave and rake protection',
        confidence_score: 0.85,
        calculation_details: 'Calculated from eave + rake length measurements'
      }
    }
    
    return null
  }

  private async callAI(stepName: string, prompt: string): Promise<string> {
    const startTime = Date.now()
    logStreamer.logAIPrompt(this.jobId || 'unknown', stepName, prompt)
    
    const config = await this.getAIConfig(stepName)
    if (!config) {
      throw new Error(`AI config not found for step: ${stepName}`)
    }

    console.log(`⚙️ [CONFIG] Provider: ${config.provider}, Model: ${config.model}, Temp: ${config.temperature}, Max tokens: ${config.max_tokens}`)

    let response = ''

    try {
      if (config.provider === 'openai' && this.openai) {
        console.log(`🎯 [OPENAI] Calling ${config.model}...`)
        const apiResponse = await this.openai.chat.completions.create({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature,
          max_tokens: config.max_tokens
        })

        response = apiResponse.choices[0]?.message?.content || ''
        console.log(`✅ [OPENAI] Response length: ${response.length} chars`)
        console.log(`💭 [RESPONSE] Preview: ${response.substring(0, 300)}...`)
        logStreamer.logAIResponse(this.jobId || 'unknown', stepName, response)

      } else if (config.provider === 'anthropic' && this.anthropic) {
        console.log(`🎯 [ANTHROPIC] Calling ${config.model}...`)
        const apiResponse = await this.anthropic.messages.create({
          model: config.model,
          max_tokens: config.max_tokens,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature
        })

        response = apiResponse.content[0]?.type === 'text' ? apiResponse.content[0].text : ''
        console.log(`✅ [ANTHROPIC] Response length: ${response.length} chars`)
        console.log(`💭 [RESPONSE] Preview: ${response.substring(0, 300)}...`)
        logStreamer.logAIResponse(this.jobId || 'unknown', stepName, response)
      } else {
        console.warn(`⚠️ [WARNING] No AI provider available for ${stepName}, using fallback`)
        return ''
      }
    } catch (err) {
      logStreamer.logError(this.jobId || 'unknown', stepName, String(err))
      throw err
    }
    
    const duration = Date.now() - startTime
    console.log(`⏱️ [TIMING] AI call took ${duration}ms\n`)
    logStreamer.logSuccess(this.jobId || 'unknown', stepName, `AI call completed in ${duration}ms`)

    return response;
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

  private extractEstimateDataFallback(text: string): EstimateData {
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

  private extractRoofDataFallback(text: string): RoofData {
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