import { 
  BusinessRulesEngine, 
  HipRidgeCapRule, 
  StarterRowRule, 
  DripEdgeGutterRule, 
  IceWaterBarrierRule,
  BusinessRuleContext 
} from '../../rules/BusinessRules'
import { JobData, LineItem, SupplementItem } from '@/types'

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid')
}))

describe('Business Rules Engine', () => {
  let mockJobData: JobData
  let mockEstimateLineItems: LineItem[]
  let mockAISuggestions: SupplementItem[]

  beforeEach(() => {
    mockJobData = {
      id: 'test-data-id',
      job_id: 'test-job-id',
      property_address: '123 Test St',
      roof_area_squares: 25.5,
      eave_length: 200,
      rake_length: 150,
      ridge_hip_length: 75,
      valley_length: 40,
      stories: 2,
      pitch: '6/12'
    }

    mockEstimateLineItems = [
      {
        description: '3 Tab 25 yr shingle roofing incl. felt',
        quantity: 25.5,
        unit: 'SQ',
        unitPrice: 150,
        totalPrice: 3825
      }
    ]

    mockAISuggestions = []
  })

  describe('HipRidgeCapRule', () => {
    let rule: HipRidgeCapRule

    beforeEach(() => {
      rule = new HipRidgeCapRule()
    })

    test('should add ridge cap when missing', () => {
      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement).toBeDefined()
      expect(result.supplement!.line_item).toBe('Ridge Cap - Purpose Built')
      expect(result.supplement!.quantity).toBe(75) // ridge_hip_length
      expect(result.supplement!.unit).toBe('LF')
      expect(result.supplement!.xactimate_code).toBe('RFG RIDGC')
    })

    test('should verify AI suggestion when ridge cap correctly identified', () => {
      const aiSuggestions: SupplementItem[] = [{
        id: 'ai-suggestion-1',
        job_id: 'test-job-id',
        line_item: 'Ridge Cap',
        reason: 'Missing ridge coverage',
        quantity: 75,
        unit: 'LF',
        xactimate_code: 'RFG RIDGC',
        confidence_score: 0.9
      }]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('verify')
      expect(result.message).toContain('AI correctly identified')
    })

    test('should flag cut shingle ridge cap for upgrade', () => {
      const estimateWithCutRidge: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Hip/Ridge cap - cut from 3 tab - composition shingles',
          quantity: 75,
          unit: 'LF',
          unitPrice: 8,
          totalPrice: 600
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithCutRidge,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Upgrade Ridge Cap to Purpose Built')
      expect(result.supplement!.reason).toContain('ASTM D3161')
    })

    test('should not trigger when no ridge length', () => {
      const jobDataNoRidge = { ...mockJobData, ridge_hip_length: 0 }
      const context: BusinessRuleContext = {
        jobData: jobDataNoRidge,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(false)
      expect(result.action).toBe('none')
    })
  })

  describe('StarterRowRule', () => {
    let rule: StarterRowRule

    beforeEach(() => {
      rule = new StarterRowRule()
    })

    test('should add universal starter when missing', () => {
      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Universal Starter Row')
      expect(result.supplement!.quantity).toBe(200) // eave_length
      expect(result.supplement!.unit).toBe('LF')
    })

    test('should upgrade when starter included in waste calculation', () => {
      const estimateWithWasteStarter: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Roofing material with waste calculation: Include eave starter course: Yes',
          quantity: 1,
          unit: 'EA',
          unitPrice: 0,
          totalPrice: 0
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithWasteStarter,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.message).toContain('waste calculation to universal starter')
      expect(result.supplement!.reason).toContain('ASTM D3161')
    })

    test('should verify adequate universal starter', () => {
      const estimateWithGoodStarter: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Asphalt starter - universal starter course',
          quantity: 200,
          unit: 'LF',
          unitPrice: 2.5,
          totalPrice: 500
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithGoodStarter,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('verify')
      expect(result.message).toContain('adequate')
    })
  })

  describe('DripEdgeGutterRule', () => {
    let rule: DripEdgeGutterRule

    beforeEach(() => {
      rule = new DripEdgeGutterRule()
    })

    test('should add drip edge for rake coverage', () => {
      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Drip Edge')
      expect(result.supplement!.quantity).toBe(150) // rake_length
      expect(result.supplement!.reason).toContain('rake edges')
    })

    test('should add gutter apron for eave coverage when gutters likely present', () => {
      // Test with longer eave length to trigger gutter assumption
      const jobDataLongEaves = { ...mockJobData, eave_length: 250, rake_length: 0 }
      const context: BusinessRuleContext = {
        jobData: jobDataLongEaves,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Gutter Apron')
      expect(result.supplement!.quantity).toBe(250)
      expect(result.supplement!.reason).toContain('Gutter apron required')
    })

    test('should detect insufficient drip edge quantity', () => {
      const estimateWithShortDripEdge: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Drip edge',
          quantity: 100, // Less than rake_length of 150
          unit: 'LF',
          unitPrice: 3,
          totalPrice: 300
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithShortDripEdge,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Additional Drip Edge')
      expect(result.supplement!.quantity).toBe(50) // 150 - 100
    })
  })

  describe('IceWaterBarrierRule', () => {
    let rule: IceWaterBarrierRule

    beforeEach(() => {
      rule = new IceWaterBarrierRule()
    })

    test('should calculate and add required ice & water barrier', () => {
      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Ice & Water Barrier')
      
      // Calculate expected quantity: 
      // Eaves: 200 LF × 6 ft = 1200 SF
      // Valleys: 40 LF × 3 ft = 120 SF
      // Total: 1320 SF
      expect(result.supplement!.quantity).toBe(1320)
      expect(result.supplement!.unit).toBe('SF')
      expect(result.supplement!.reason).toContain('building code')
      expect(result.supplement!.calculation_details).toContain('1200 SF')
      expect(result.supplement!.calculation_details).toContain('120 SF')
    })

    test('should detect insufficient ice & water barrier quantity', () => {
      const estimateWithShortBarrier: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Ice & water barrier',
          quantity: 500, // Less than required 1320 SF
          unit: 'SF',
          unitPrice: 1.2,
          totalPrice: 600
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithShortBarrier,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('add')
      expect(result.supplement!.line_item).toBe('Additional Ice & Water Barrier')
      expect(result.supplement!.quantity).toBe(820) // 1320 - 500
    })

    test('should verify adequate ice & water barrier coverage', () => {
      const estimateWithGoodBarrier: LineItem[] = [
        ...mockEstimateLineItems,
        {
          description: 'Ice & water barrier',
          quantity: 1330, // Slightly more than required 1320 SF
          unit: 'SF',
          unitPrice: 1.2,
          totalPrice: 1596
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: estimateWithGoodBarrier,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(true)
      expect(result.action).toBe('verify')
      expect(result.message).toContain('meets code requirements')
    })

    test('should not trigger when no eave or valley length', () => {
      const jobDataNoLengths = { 
        ...mockJobData, 
        eave_length: 0, 
        valley_length: 0 
      }
      const context: BusinessRuleContext = {
        jobData: jobDataNoLengths,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const result = rule.evaluate(context)

      expect(result.triggered).toBe(false)
      expect(result.action).toBe('none')
    })
  })

  describe('BusinessRulesEngine', () => {
    let engine: BusinessRulesEngine

    beforeEach(() => {
      engine = new BusinessRulesEngine()
    })

    test('should evaluate all rules and return comprehensive results', () => {
      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const evaluation = engine.evaluateAll(context)

      expect(evaluation.results).toHaveLength(4) // All 4 rules
      expect(evaluation.newSupplements.length).toBeGreaterThan(0) // Should find missing items
      expect(evaluation.summary).toContain('Business Rules')
      expect(evaluation.summary).toContain('triggered')
      expect(evaluation.summary).toContain('supplements added')

      // Verify all expected supplements are present
      const supplementTypes = evaluation.newSupplements.map(s => s.line_item)
      expect(supplementTypes).toContain('Ridge Cap - Purpose Built')
      expect(supplementTypes).toContain('Universal Starter Row') 
      expect(supplementTypes).toContain('Drip Edge')
      expect(supplementTypes).toContain('Ice & Water Barrier')
    })

    test('should handle errors gracefully', () => {
      // Create context that might cause errors
      const badContext: BusinessRuleContext = {
        jobData: { ...mockJobData, job_id: undefined } as any,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: mockAISuggestions
      }

      const evaluation = engine.evaluateAll(badContext)

      expect(evaluation.results).toHaveLength(4)
      // Should still return results even if some rules fail
      expect(evaluation.summary).toContain('Business Rules')
    })

    test('should verify AI suggestions when they match business rules', () => {
      const goodAISuggestions: SupplementItem[] = [
        {
          id: 'ai-1',
          job_id: 'test-job-id',
          line_item: 'Ridge Cap',
          reason: 'Missing ridge coverage',
          quantity: 75,
          unit: 'LF',
          xactimate_code: 'RFG RIDGC',
          confidence_score: 0.9
        },
        {
          id: 'ai-2',
          job_id: 'test-job-id',
          line_item: 'Ice & Water Barrier',
          reason: 'Code requirement',
          quantity: 1320,
          unit: 'SF',
          xactimate_code: 'RFG IWS',
          confidence_score: 0.85
        }
      ]

      const context: BusinessRuleContext = {
        jobData: mockJobData,
        estimateLineItems: mockEstimateLineItems,
        aiSuggestions: goodAISuggestions
      }

      const evaluation = engine.evaluateAll(context)

      // Should have fewer new supplements since AI got some right
      const verifyCount = evaluation.results.filter(r => r.action === 'verify').length
      expect(verifyCount).toBeGreaterThan(0)
      
      // Should still add items AI missed
      expect(evaluation.newSupplements.length).toBeGreaterThan(0)
      const supplementTypes = evaluation.newSupplements.map(s => s.line_item)
      expect(supplementTypes).toContain('Universal Starter Row') // AI missed this
      expect(supplementTypes).toContain('Drip Edge') // AI missed this
    })

    test('should return available rules for inspection', () => {
      const rules = engine.getRules()
      
      expect(rules).toHaveLength(4)
      expect(rules.map(r => r.ruleId)).toContain('hip_ridge_cap_check')
      expect(rules.map(r => r.ruleId)).toContain('starter_row_check')
      expect(rules.map(r => r.ruleId)).toContain('drip_edge_gutter_check')
      expect(rules.map(r => r.ruleId)).toContain('ice_water_barrier_check')
    })
  })
})