import { JobData, LineItem, SupplementItem } from '@/types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Business Rules Engine implementing client's 4 decision trees from mermaid charts
 * These rules run AFTER AI suggestions to verify/supplement them
 */

export interface BusinessRuleContext {
  jobData: JobData
  estimateLineItems: LineItem[]
  aiSuggestions: SupplementItem[]
}

export interface BusinessRuleResult {
  ruleId: string
  triggered: boolean
  action: 'add' | 'verify' | 'flag' | 'none'
  supplement?: SupplementItem
  message: string
  confidence: number
}

export abstract class BusinessRule {
  abstract ruleId: string
  abstract name: string
  abstract description: string

  abstract evaluate(context: BusinessRuleContext): BusinessRuleResult

  protected createSupplement(
    lineItem: string,
    reason: string,
    xactimateCode: string,
    quantity: number,
    unit: string,
    confidence: number,
    jobId: string,
    calculationDetails?: string
  ): SupplementItem {
    return {
      id: uuidv4(),
      job_id: jobId,
      line_item: lineItem,
      xactimate_code: xactimateCode,
      quantity,
      unit,
      reason,
      confidence_score: confidence,
      calculation_details: calculationDetails
    }
  }

  protected findItemInEstimate(searchTerms: string[], lineItems: LineItem[]): LineItem | null {
    for (const item of lineItems) {
      const description = item.description.toLowerCase()
      if (searchTerms.some(term => description.includes(term.toLowerCase()))) {
        return item
      }
    }
    return null
  }

  protected hasAISuggestion(searchTerms: string[], aiSuggestions: SupplementItem[]): SupplementItem | null {
    for (const suggestion of aiSuggestions) {
      const lineItem = suggestion.line_item.toLowerCase()
      if (searchTerms.some(term => lineItem.includes(term.toLowerCase()))) {
        return suggestion
      }
    }
    return null
  }
}

/**
 * Rule 1: Hip/Ridge Cap Quality Validation
 * From client mermaid chart - ensures purpose-built ridge caps vs cut shingles
 */
export class HipRidgeCapRule extends BusinessRule {
  ruleId = 'hip-ridge-cap-quality'
  name = 'Hip/Ridge Cap Quality Check'
  description = 'Validates ridge cap type - purpose-built vs cut from 3-tab shingles'

  evaluate(context: BusinessRuleContext): BusinessRuleResult {
    const { jobData, estimateLineItems, aiSuggestions } = context

    // Check if roof has ridge/hip length (from roof report)
    const ridgeHipLength = jobData.ridge_hip_length || 0
    if (ridgeHipLength <= 0) {
      return {
        ruleId: this.ruleId,
        triggered: false,
        action: 'none',
        message: 'No ridge/hip length found in roof report',
        confidence: 1.0
      }
    }

    // Look for existing ridge cap in estimate
    const ridgeCapTerms = ['ridge cap', 'hip cap', 'ridge', 'hip & ridge']
    const existingRidgeCap = this.findItemInEstimate(ridgeCapTerms, estimateLineItems)

    if (!existingRidgeCap) {
      // No ridge cap found - should be added
      const aiSuggestion = this.hasAISuggestion(ridgeCapTerms, aiSuggestions)
      if (aiSuggestion) {
        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'verify',
          message: 'AI correctly identified missing ridge cap',
          confidence: 0.95
        }
      } else {
        // AI missed it - add our own suggestion
        const supplement = this.createSupplement(
          'Ridge Cap - Purpose Built',
          `Ridge cap required for ${ridgeHipLength} LF of ridge/hip coverage. Purpose-built ridge caps recommended over cut shingles for proper wind resistance per ASTM standards.`,
          'RFG RIDGC',
          ridgeHipLength,
          'LF',
          0.92,
          jobData.job_id!,
          `Ridge/Hip length from roof report: ${ridgeHipLength} LF`
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Added missing ridge cap - AI oversight',
          confidence: 0.92
        }
      }
    } else {
      // Ridge cap exists - check quality (cut vs purpose-built)
      const description = existingRidgeCap.description.toLowerCase()
      const isCutFrom3Tab = description.includes('cut from 3') || description.includes('cut from 3-tab')
      
      if (isCutFrom3Tab) {
        // Flag for upgrade to purpose-built
        const supplement = this.createSupplement(
          'Upgrade Ridge Cap to Purpose Built',
          'Cut-up 3-tab shingles used as ridge caps are not independently tested for wind resistance under ASTM D3161 or D7158. Upgrade to purpose-built ridge caps required for code compliance.',
          'RFG RIDGC',
          ridgeHipLength,
          'LF',
          0.89,
          jobData.job_id!,
          `Existing estimate has cut 3-tab ridge cap. Upgrade needed for wind rating compliance.`
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Ridge cap quality upgrade required - cut shingles to purpose-built',
          confidence: 0.89
        }
      } else {
        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'verify',
          message: 'Ridge cap present and appears to be proper purpose-built type',
          confidence: 0.88
        }
      }
    }
  }
}

/**
 * Rule 2: Starter Row Quality Validation  
 * From client mermaid chart - ensures universal starter vs included-in-waste
 */
export class StarterRowRule extends BusinessRule {
  ruleId = 'starter-row-quality'
  name = 'Starter Row Quality Check'
  description = 'Validates starter row type - universal starter vs inadequate alternatives'

  evaluate(context: BusinessRuleContext): BusinessRuleResult {
    const { jobData, estimateLineItems, aiSuggestions } = context

    // Check if roof has eave length (starter needed along eaves)
    const eaveLength = jobData.eave_length || 0
    if (eaveLength <= 0) {
      return {
        ruleId: this.ruleId,
        triggered: false,
        action: 'none',
        message: 'No eave length found in roof report',
        confidence: 1.0
      }
    }

    // Look for actual starter row line items (not just mentions in options/notes)
    const starterTerms = ['asphalt starter', 'starter strip', 'universal starter', 'peel and stick starter']
    const existingStarter = this.findItemInEstimate(starterTerms, estimateLineItems)

    if (!existingStarter) {
      // Check if starter is "included in waste" (common but inadequate)
      const wasteIncluded = estimateLineItems.some(item => 
        item.description.toLowerCase().includes('include eave starter course') ||
        item.description.toLowerCase().includes('starter course: yes') ||
        item.description.toLowerCase().includes('waste calculation')
      )

      if (wasteIncluded) {
        // Starter factored into waste - need to add proper universal starter
        const supplement = this.createSupplement(
          'Universal Starter Row',
          'Cut shingles used as starter course do not have factory-applied adhesive strips in correct position for wind uplift resistance. Universal starter strips required per ASTM D3161/D7158.',
          'RFG STARTER',
          eaveLength,
          'LF',
          0.91,
          jobData.job_id!,
          `Eave length: ${eaveLength} LF. Starter shown as "included in waste" but cut shingles don't meet wind resistance standards.`
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Starter course upgrade required - waste calculation to universal starter',
          confidence: 0.91
        }
      } else {
        // No starter at all
        const aiSuggestion = this.hasAISuggestion(starterTerms, aiSuggestions)
        if (aiSuggestion) {
          return {
            ruleId: this.ruleId,
            triggered: true,
            action: 'verify',
            message: 'AI correctly identified missing starter row',
            confidence: 0.94
          }
        } else {
          const supplement = this.createSupplement(
            'Universal Starter Row',
            `Universal starter course required along ${eaveLength} LF of eave edges for proper wind uplift resistance.`,
            'RFG STARTER',
            eaveLength,
            'LF',
            0.93,
            jobData.job_id!,
            `Eave length from roof report: ${eaveLength} LF`
          )

          return {
            ruleId: this.ruleId,
            triggered: true,
            action: 'add',
            supplement,
            message: 'Added missing starter row - AI oversight',
            confidence: 0.93
          }
        }
      }
    } else {
      // Starter exists - check quality
      const description = existingStarter.description.toLowerCase()
      const isUniversal = description.includes('universal') || description.includes('peel and stick')
      
      if (!isUniversal) {
        // Low quality starter - upgrade needed
        const supplement = this.createSupplement(
          'Upgrade to Universal Starter',
          'Current starter course may not meet wind resistance requirements. Upgrade to universal starter strips with proper adhesive placement.',
          'RFG STARTER',
          eaveLength,
          'LF',
          0.87,
          jobData.job_id!,
          'Existing starter course quality upgrade for code compliance'
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Starter course quality upgrade required',
          confidence: 0.87
        }
      } else {
        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'verify',
          message: 'Universal starter course present and adequate',
          confidence: 0.89
        }
      }
    }
  }
}

/**
 * Rule 3: Drip Edge and Gutter Apron Coverage
 * From client mermaid chart - validates rake vs eave coverage
 */
export class DripEdgeGutterRule extends BusinessRule {
  ruleId = 'drip-edge-gutter-coverage'
  name = 'Drip Edge & Gutter Apron Coverage Check'
  description = 'Validates proper edge protection - drip edge for rakes, gutter apron for eaves'

  evaluate(context: BusinessRuleContext): BusinessRuleResult {
    const { jobData, estimateLineItems, aiSuggestions } = context

    const rakeLength = jobData.rake_length || 0
    const eaveLength = jobData.eave_length || 0

    if (rakeLength <= 0 && eaveLength <= 0) {
      return {
        ruleId: this.ruleId,
        triggered: false,
        action: 'none',
        message: 'No rake or eave lengths found in roof report',
        confidence: 1.0
      }
    }

    const dripEdgeTerms = ['drip edge']
    const gutterApronTerms = ['gutter apron', 'drip edge/gutter apron']
    
    const existingDripEdge = this.findItemInEstimate(dripEdgeTerms, estimateLineItems)
    const existingGutterApron = this.findItemInEstimate(gutterApronTerms, estimateLineItems)

    const results: BusinessRuleResult[] = []
    let overallConfidence = 0.9

    // Check rake coverage (needs drip edge)
    if (rakeLength > 0) {
      if (!existingDripEdge) {
        const aiSuggestion = this.hasAISuggestion(dripEdgeTerms, aiSuggestions)
        if (!aiSuggestion) {
          const supplement = this.createSupplement(
            'Drip Edge',
            `Drip edge required for ${rakeLength} LF of rake edges to direct water away from fascia and prevent water damage.`,
            'RFG DRIP',
            rakeLength,
            'LF',
            0.90,
            jobData.job_id!,
            `Rake length from roof report: ${rakeLength} LF`
          )

          return {
            ruleId: this.ruleId,
            triggered: true,
            action: 'add',
            supplement,
            message: `Added missing drip edge for ${rakeLength} LF of rake coverage`,
            confidence: 0.90
          }
        }
      } else {
        // Check if quantity is adequate
        const existingQuantity = existingDripEdge.quantity || 0
        if (existingQuantity < rakeLength * 0.9) { // Allow 10% tolerance
          const shortfall = rakeLength - existingQuantity
          const supplement = this.createSupplement(
            'Additional Drip Edge',
            `Existing drip edge quantity (${existingQuantity} LF) insufficient for rake length (${rakeLength} LF). Additional ${shortfall.toFixed(0)} LF required.`,
            'RFG DRIP',
            shortfall,
            'LF',
            0.88,
            jobData.job_id!,
            `Shortfall calculation: ${rakeLength} LF required - ${existingQuantity} LF existing = ${shortfall.toFixed(0)} LF additional`
          )

          return {
            ruleId: this.ruleId,
            triggered: true,
            action: 'add',
            supplement,
            message: 'Drip edge quantity insufficient for full rake coverage',
            confidence: 0.88
          }
        }
      }
    }

    // Check eave coverage (needs gutter apron if gutters present)
    if (eaveLength > 0) {
      // Assume gutters are present if eave length > 100 LF (most homes have gutters)
      const likelyHasGutters = eaveLength > 100
      
      if (likelyHasGutters && !existingGutterApron) {
        const aiSuggestion = this.hasAISuggestion(gutterApronTerms, aiSuggestions)
        if (!aiSuggestion) {
          const supplement = this.createSupplement(
            'Gutter Apron',
            `Gutter apron required for ${eaveLength} LF of eave edges with gutters to protect fascia and ensure proper water management.`,
            'RFG DRIP', // Using same code as drip edge per industry standard
            eaveLength,
            'LF',
            0.86,
            jobData.job_id!,
            `Eave length from roof report: ${eaveLength} LF. Gutters assumed present based on length.`
          )

          return {
            ruleId: this.ruleId,
            triggered: true,
            action: 'add',
            supplement,
            message: `Added missing gutter apron for ${eaveLength} LF of eave coverage`,
            confidence: 0.86
          }
        }
      }
    }

    return {
      ruleId: this.ruleId,
      triggered: true,
      action: 'verify',
      message: 'Drip edge and gutter apron coverage appears adequate',
      confidence: 0.85
    }
  }
}

/**
 * Rule 4: Ice & Water Barrier Code Requirements
 * From client mermaid chart - calculates code-required coverage
 */
export class IceWaterBarrierRule extends BusinessRule {
  ruleId = 'ice-water-barrier-code'
  name = 'Ice & Water Barrier Code Compliance'
  description = 'Validates ice & water barrier meets building code requirements for climate zone'

  evaluate(context: BusinessRuleContext): BusinessRuleResult {
    const { jobData, estimateLineItems, aiSuggestions } = context

    const eaveLength = jobData.eave_length || 0
    const valleyLength = jobData.valley_length || 0
    const pitch = jobData.pitch || '4/12' // Default assumption

    if (eaveLength <= 0 && valleyLength <= 0) {
      return {
        ruleId: this.ruleId,
        triggered: false,
        action: 'none',
        message: 'No eave or valley lengths found for ice barrier calculation',
        confidence: 1.0
      }
    }

    // Calculate required ice & water barrier coverage
    // Standard: 2 courses along eaves (typically 6 feet) + valleys full length
    const eaveWidthFeet = 6 // Standard 2-course coverage
    const requiredEaveArea = eaveLength * eaveWidthFeet
    const requiredValleyArea = valleyLength * 3 // 36" width = 3 feet
    const totalRequiredSF = requiredEaveArea + requiredValleyArea

    if (totalRequiredSF <= 0) {
      return {
        ruleId: this.ruleId,
        triggered: false,
        action: 'none',
        message: 'No ice & water barrier required based on roof measurements',
        confidence: 1.0
      }
    }

    // Look for existing ice & water barrier
    const iceWaterTerms = ['ice & water', 'ice and water', 'ice water', 'ice barrier', 'ice shield']
    const existingBarrier = this.findItemInEstimate(iceWaterTerms, estimateLineItems)

    if (!existingBarrier) {
      // No ice & water barrier found
      const aiSuggestion = this.hasAISuggestion(iceWaterTerms, aiSuggestions)
      if (aiSuggestion) {
        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'verify',
          message: 'AI correctly identified missing ice & water barrier',
          confidence: 0.94
        }
      } else {
        const supplement = this.createSupplement(
          'Ice & Water Barrier',
          `Ice & water barrier required per building code. Total coverage needed: ${totalRequiredSF.toFixed(0)} SF (${requiredEaveArea.toFixed(0)} SF eaves + ${requiredValleyArea.toFixed(0)} SF valleys).`,
          'RFG IWS',
          Math.ceil(totalRequiredSF),
          'SF',
          0.93,
          jobData.job_id!,
          `Calculation: Eaves ${eaveLength} LF × ${eaveWidthFeet} ft = ${requiredEaveArea} SF; Valleys ${valleyLength} LF × 3 ft = ${requiredValleyArea} SF; Total = ${totalRequiredSF.toFixed(0)} SF`
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Added missing ice & water barrier - code requirement',
          confidence: 0.93
        }
      }
    } else {
      // Check if quantity is adequate
      const existingQuantity = existingBarrier.quantity || 0
      const shortfall = totalRequiredSF - existingQuantity

      if (shortfall > 10) { // Allow 10 SF tolerance
        const supplement = this.createSupplement(
          'Additional Ice & Water Barrier',
          `Existing ice & water barrier (${existingQuantity} SF) insufficient for code requirements (${totalRequiredSF.toFixed(0)} SF). Additional ${shortfall.toFixed(0)} SF required.`,
          'RFG IWS',
          Math.ceil(shortfall),
          'SF',
          0.90,
          jobData.job_id!,
          `Code requirement: ${totalRequiredSF.toFixed(0)} SF; Existing: ${existingQuantity} SF; Shortfall: ${shortfall.toFixed(0)} SF`
        )

        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'add',
          supplement,
          message: 'Ice & water barrier quantity insufficient for code compliance',
          confidence: 0.90
        }
      } else {
        return {
          ruleId: this.ruleId,
          triggered: true,
          action: 'verify',
          message: 'Ice & water barrier coverage meets code requirements',
          confidence: 0.88
        }
      }
    }
  }
}

/**
 * Business Rules Engine - orchestrates all rules
 */
export class BusinessRulesEngine {
  private rules: BusinessRule[] = [
    new HipRidgeCapRule(),
    new StarterRowRule(),
    new DripEdgeGutterRule(),
    new IceWaterBarrierRule()
  ]

  /**
   * Evaluate all business rules against the provided context
   * Returns results and any new supplement items to add
   */
  evaluateAll(context: BusinessRuleContext): {
    results: BusinessRuleResult[]
    newSupplements: SupplementItem[]
    summary: string
  } {
    const results: BusinessRuleResult[] = []
    const newSupplements: SupplementItem[] = []

    for (const rule of this.rules) {
      try {
        const result = rule.evaluate(context)
        results.push(result)

        if (result.action === 'add' && result.supplement) {
          newSupplements.push(result.supplement)
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.ruleId}:`, error)
        results.push({
          ruleId: rule.ruleId,
          triggered: false,
          action: 'none',
          message: `Rule evaluation failed: ${error}`,
          confidence: 0.0
        })
      }
    }

    // Generate summary
    const triggeredCount = results.filter(r => r.triggered).length
    const addedCount = newSupplements.length
    const verifiedCount = results.filter(r => r.action === 'verify').length

    const summary = `Business Rules: ${triggeredCount}/${this.rules.length} rules triggered, ${addedCount} new supplements added, ${verifiedCount} AI suggestions verified`

    return {
      results,
      newSupplements,
      summary
    }
  }

  /**
   * Get all available rules for inspection/debugging
   */
  getRules(): BusinessRule[] {
    return [...this.rules]
  }
}