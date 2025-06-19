import { SupplementItem, LineItem, JobData } from '@/types'

/**
 * Cross-Reference Validator - Layer 3 of our validation system
 * Prevents false positives by checking suggestions against actual estimate data
 */

export interface ValidationResult {
  isValid: boolean
  confidence: number
  issues: string[]
  adjustments: {
    originalQuantity?: number
    adjustedQuantity?: number
    reason?: string
  }[]
}

export interface SupplementValidationContext {
  supplement: SupplementItem
  estimateLineItems: LineItem[]
  jobData: JobData
  xactimateCodeMap: Map<string, string>
}

export class SupplementValidator {
  private xactimateCodeMap: Map<string, string>

  constructor(xactimateCodeMap?: Map<string, string>) {
    this.xactimateCodeMap = xactimateCodeMap || new Map()
    this.initializeCodeMap()
  }

  /**
   * Validate a single supplement item against estimate data
   */
  validateSupplement(context: SupplementValidationContext): ValidationResult {
    const { supplement, estimateLineItems, jobData } = context
    const issues: string[] = []
    const adjustments: ValidationResult['adjustments'] = []
    let confidence = supplement.confidence_score

    // Check 1: Item already exists in estimate (hallucination check)
    const existingItem = this.findExistingItem(supplement, estimateLineItems)
    if (existingItem) {
      // If exact code match, be more strict about duplicates
      const isExactCodeMatch = supplement.xactimate_code?.toLowerCase() === existingItem.code?.toLowerCase()
      
      if (isExactCodeMatch) {
        // Exact code match - flag as duplicate regardless of quantity unless the difference is significant
        const quantityRatio = supplement.quantity / (existingItem.quantity || 1)
        if (quantityRatio > 1.3) {
          // Quantity more than double - might be legitimate additional need
          const additionalNeeded = supplement.quantity - (existingItem.quantity || 0)
          adjustments.push({
            originalQuantity: supplement.quantity,
            adjustedQuantity: additionalNeeded,
            reason: `Existing item found with ${existingItem.quantity} ${existingItem.unit}, additional ${additionalNeeded} ${supplement.unit} needed`
          })
          supplement.line_item = `Additional ${supplement.line_item}`
          supplement.quantity = additionalNeeded
          supplement.reason = `${supplement.reason} (Supplementing existing ${existingItem.quantity} ${existingItem.unit})`
          confidence *= 0.95
        } else {
          // Similar quantities - likely duplicate
          issues.push(`Item "${supplement.line_item}" already exists in estimate with adequate quantity (${existingItem.quantity} ${existingItem.unit})`)
          confidence = 0.1
          return {
            isValid: false,
            confidence,
            issues,
            adjustments
          }
        }
      } else {
        // Similarity match - be conservative and flag as duplicate
        // Only allow quantity adjustments for very large discrepancies (>3x)
        const quantityRatio = supplement.quantity / (existingItem.quantity || 1)
        
        if (quantityRatio > 3.0) {
          // Very large discrepancy - might be legitimate additional need
          const additionalNeeded = supplement.quantity - (existingItem.quantity || 0)
          adjustments.push({
            originalQuantity: supplement.quantity,
            adjustedQuantity: additionalNeeded,
            reason: `Existing similar item found with ${existingItem.quantity} ${existingItem.unit}, additional ${additionalNeeded} ${supplement.unit} needed`
          })
          supplement.line_item = `Additional ${supplement.line_item}`
          supplement.quantity = additionalNeeded
          supplement.reason = `${supplement.reason} (Supplementing existing ${existingItem.quantity} ${existingItem.unit})`
          confidence *= 0.9
        } else {
          // Conservative approach - flag similar items as duplicates
          issues.push(`Item "${supplement.line_item}" already exists in estimate with adequate quantity (${existingItem.quantity} ${existingItem.unit})`)
          confidence = 0.1
          return {
            isValid: false,
            confidence,
            issues,
            adjustments
          }
        }
      }
    }

    // Check 2: Validate Xactimate code
    const codeValidation = this.validateXactimateCode(supplement)
    if (!codeValidation.isValid) {
      issues.push(`Invalid or unknown Xactimate code: ${supplement.xactimate_code}`)
      confidence *= 0.8
    }

    // Check 3: Quantity reasonableness
    const quantityValidation = this.validateQuantity(supplement, jobData)
    if (!quantityValidation.isValid) {
      issues.push(...quantityValidation.issues)
      confidence *= 0.7
    }

    // Check 4: Unit consistency
    const unitValidation = this.validateUnit(supplement)
    if (!unitValidation.isValid) {
      issues.push(`Unusual unit "${supplement.unit}" for item type "${supplement.line_item}"`)
      confidence *= 0.9
    }

    // Overall validation - item is only valid if there are no issues
    const isValid = issues.length === 0

    return {
      isValid,
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
      issues,
      adjustments
    }
  }

  /**
   * Validate multiple supplements and filter out invalid ones
   */
  validateSupplements(supplements: SupplementItem[], estimateLineItems: LineItem[], jobData: JobData): {
    validSupplements: SupplementItem[]
    invalidSupplements: SupplementItem[]
    validationResults: Map<string, ValidationResult>
    summary: string
  } {
    const validSupplements: SupplementItem[] = []
    const invalidSupplements: SupplementItem[] = []
    const validationResults = new Map<string, ValidationResult>()

    for (const supplement of supplements) {
      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems,
        jobData,
        xactimateCodeMap: this.xactimateCodeMap
      }

      const result = this.validateSupplement(context)
      validationResults.set(supplement.id, result)

      if (result.isValid) {
        validSupplements.push(supplement)
      } else {
        invalidSupplements.push(supplement)
      }
    }

    const summary = `Validation: ${validSupplements.length}/${supplements.length} supplements valid, ${invalidSupplements.length} filtered out`

    return {
      validSupplements,
      invalidSupplements,
      validationResults,
      summary
    }
  }

  /**
   * Find if an item already exists in the estimate
   */
  private findExistingItem(supplement: SupplementItem, estimateLineItems: LineItem[]): LineItem | null {
    const supplementDesc = supplement.line_item.toLowerCase()
    const supplementCode = supplement.xactimate_code?.toLowerCase()

    for (const item of estimateLineItems) {
      const itemDesc = item.description.toLowerCase()
      const itemCode = item.code?.toLowerCase()

      // Match by Xactimate code if both have codes
      if (supplementCode && itemCode && supplementCode === itemCode) {
        return item
      }

      // Match by description similarity for common roofing items
      const similarityScore = this.calculateDescriptionSimilarity(supplementDesc, itemDesc)
      if (similarityScore >= 0.5) {
        return item
      }

      // Specific roofing term matches
      if (this.areRoofingItemsSimilar(supplementDesc, itemDesc)) {
        return item
      }
    }

    return null
  }

  /**
   * Calculate description similarity score
   */
  private calculateDescriptionSimilarity(desc1: string, desc2: string): number {
    const words1 = desc1.split(/\s+/).filter(w => w.length > 2)
    const words2 = desc2.split(/\s+/).filter(w => w.length > 2)
    
    let matches = 0
    for (const word1 of words1) {
      if (words2.some(word2 => word1.includes(word2) || word2.includes(word1))) {
        matches++
      }
    }

    return matches / Math.max(words1.length, words2.length)
  }

  /**
   * Check if two roofing items are functionally the same
   */
  private areRoofingItemsSimilar(desc1: string, desc2: string): boolean {
    const roofingTermMaps = [
      ['ridge cap', 'hip cap', 'ridge', 'hip & ridge', 'hip/ridge'],
      ['drip edge', 'gutter apron', 'drip edge/gutter apron'],
      ['ice & water', 'ice and water', 'ice water', 'ice barrier', 'ice shield'],
      ['starter', 'starter row', 'starter course', 'starter strip'],
      ['flashing', 'step flashing', 'chimney flashing', 'pipe flashing']
    ]

    for (const termGroup of roofingTermMaps) {
      const desc1HasTerm = termGroup.some(term => desc1.includes(term))
      const desc2HasTerm = termGroup.some(term => desc2.includes(term))
      
      if (desc1HasTerm && desc2HasTerm) {
        return true
      }
    }

    return false
  }

  /**
   * Analyze quantity differences between suggested and existing items
   */
  private analyzeQuantityDifference(supplement: SupplementItem, existingItem: LineItem, jobData: JobData): {
    isSignificantDifference: boolean
    additionalNeeded: number
    reasoning: string
  } {
    const suggestionQuantity = supplement.quantity
    const existingQuantity = existingItem.quantity || 0

    // Convert units if necessary (basic conversion)
    const normalizedExisting = this.normalizeQuantity(existingQuantity, existingItem.unit)
    const normalizedSuggestion = this.normalizeQuantity(suggestionQuantity, supplement.unit)

    const difference = normalizedSuggestion - normalizedExisting
    const percentageDifference = Math.abs(difference) / normalizedSuggestion

    // Consider significant if difference is > 10% and > 5 units
    const isSignificant = percentageDifference > 0.1 && Math.abs(difference) > 5

    return {
      isSignificantDifference: isSignificant && difference > 0,
      additionalNeeded: Math.max(0, difference),
      reasoning: `Existing: ${existingQuantity} ${existingItem.unit}, Suggested: ${suggestionQuantity} ${supplement.unit}, Difference: ${difference.toFixed(1)}`
    }
  }

  /**
   * Normalize quantities for comparison (basic unit conversion)
   */
  private normalizeQuantity(quantity: number, unit: string): number {
    const unitLower = unit.toLowerCase()
    
    // Convert everything to base units for comparison
    if (unitLower === 'sq' || unitLower === 'square') {
      return quantity * 100 // Convert squares to SF
    }
    
    return quantity // Default: no conversion
  }

  /**
   * Validate Xactimate code exists and is reasonable
   */
  private validateXactimateCode(supplement: SupplementItem): { isValid: boolean, suggestion?: string } {
    const code = supplement.xactimate_code

    if (!code || code === 'TBD') {
      return { isValid: false }
    }

    // Check if code exists in our map
    if (this.xactimateCodeMap.has(code)) {
      return { isValid: true }
    }

    // Check for common code patterns
    const isValidPattern = /^[A-Z]{2,4}\s+[A-Z0-9]+$/i.test(code) || /^[A-Z]{3,4}$/i.test(code)
    
    if (isValidPattern) {
      return { isValid: true } // Assume valid if it matches pattern
    }

    // Try to find a similar code
    const suggestion = this.findSimilarCode(supplement.line_item)
    return { 
      isValid: false, 
      suggestion 
    }
  }

  /**
   * Find similar Xactimate code based on description
   */
  private findSimilarCode(description: string): string | undefined {
    const descLower = description.toLowerCase()
    
    for (const [code, codeDesc] of this.xactimateCodeMap.entries()) {
      if (codeDesc.toLowerCase().includes(descLower) || descLower.includes(codeDesc.toLowerCase())) {
        return code
      }
    }

    return undefined
  }

  /**
   * Validate quantity reasonableness based on job data
   */
  private validateQuantity(supplement: SupplementItem, jobData: JobData): { isValid: boolean, issues: string[] } {
    const issues: string[] = []
    const quantity = supplement.quantity
    const unit = supplement.unit.toUpperCase()
    const description = supplement.line_item.toLowerCase()

    // Basic quantity validation
    if (quantity <= 0) {
      issues.push(`Invalid quantity: ${quantity}`)
      return { isValid: false, issues }
    }

    // Validate against roof measurements
    const roofAreaSq = jobData.roof_area_squares || 0
    const eaveLength = jobData.eave_length || 0
    const rakeLength = jobData.rake_length || 0
    const ridgeLength = jobData.ridge_hip_length || 0
    const valleyLength = jobData.valley_length || 0

    // Linear foot items validation
    if (unit === 'LF') {
      const totalPerimeter = eaveLength + rakeLength + ridgeLength + valleyLength
      
      if (description.includes('drip edge') && quantity > rakeLength * 1.2 && rakeLength > 0) {
        issues.push(`Drip edge quantity (${quantity} LF) seems excessive for rake length (${rakeLength} LF)`)
      }
      
      if (description.includes('ridge') && quantity > ridgeLength * 1.2 && ridgeLength > 0) {
        issues.push(`Ridge cap quantity (${quantity} LF) seems excessive for ridge length (${ridgeLength} LF)`)
      }
      
      if (description.includes('starter') && quantity > eaveLength * 1.2 && eaveLength > 0) {
        issues.push(`Starter row quantity (${quantity} LF) seems excessive for eave length (${eaveLength} LF)`)
      }

      // General check for any LF item - more restrictive threshold
      if (totalPerimeter > 0 && quantity > totalPerimeter * 1.5) {
        issues.push(`Linear footage (${quantity} LF) seems excessive for total roof perimeter (~${totalPerimeter.toFixed(0)} LF)`)
      }
    }

    // Square foot items validation
    if (unit === 'SF') {
      const roofAreaSF = roofAreaSq * 100
      
      if (description.includes('ice') && roofAreaSF > 0 && quantity > roofAreaSF * 0.6) {
        issues.push(`Ice & water barrier quantity (${quantity} SF) seems excessive for roof area (${roofAreaSF} SF)`)
      }
      
      // General check for any SF item - more restrictive
      if (roofAreaSF > 0 && quantity > roofAreaSF * 1.2) {
        issues.push(`Square footage (${quantity} SF) seems excessive for roof area (${roofAreaSF} SF)`)
      }
    }

    // Square (roofing square) validation
    if (unit === 'SQ') {
      if (quantity > roofAreaSq * 1.3) {
        issues.push(`Roofing squares (${quantity} SQ) seems excessive for roof area (${roofAreaSq} SQ)`)
      }
    }

    return { isValid: issues.length === 0, issues }
  }

  /**
   * Validate unit appropriateness for item type
   */
  private validateUnit(supplement: SupplementItem): { isValid: boolean } {
    const unit = supplement.unit.toUpperCase()
    const description = supplement.line_item.toLowerCase()

    const unitMappings = {
      'LF': ['drip edge', 'ridge cap', 'starter', 'flashing', 'gutter', 'linear', 'length'],
      'SF': ['barrier', 'underlayment', 'felt', 'area', 'square foot'],
      'SQ': ['shingle', 'roofing', 'square'],
      'EA': ['vent', 'pipe', 'each', 'piece', 'item']
    }

    const expectedUnits = Object.entries(unitMappings).filter(([, terms]) =>
      terms.some(term => description.includes(term))
    ).map(([unitKey]) => unitKey)

    if (expectedUnits.length === 0) {
      return { isValid: true } // No specific expectation
    }

    return { isValid: expectedUnits.includes(unit) }
  }

  /**
   * Initialize Xactimate code map from standard codes
   */
  private initializeCodeMap(): void {
    // Initialize with common roofing codes - in production this would come from database or file
    const codes = [
      ['RFG DRIP', 'Drip edge'],
      ['RFG RIDGC', 'Ridge Cap - comp shingles'],
      ['RFG RIDGC+', 'Ridge Cap - High Profile comp shingles'],
      ['RFG IWS', 'Ice & Water Shield'],
      ['RFG FELT15', 'Roofing felt, 15lb'],
      ['RFG FELT30', 'Roofing felt, 30lb'],
      ['RFG HIGH', 'Additional Charge for high roof 2 stories or >'],
      ['RFG STEEP', 'Additional Charge for steep roof 7/12 - 9/12'],
      ['RFG FLPIPE', 'Flashing Pipe Jack'],
      ['RFG VMTL', 'Valley metal'],
      ['RFG STARTER', 'Asphalt starter course']
    ]

    for (const [code, description] of codes) {
      this.xactimateCodeMap.set(code, description)
    }
  }

  /**
   * Add or update Xactimate codes (for extensibility)
   */
  addXactimateCode(code: string, description: string): void {
    this.xactimateCodeMap.set(code, description)
  }

  /**
   * Get all known Xactimate codes
   */
  getKnownCodes(): Map<string, string> {
    return new Map(this.xactimateCodeMap)
  }
}