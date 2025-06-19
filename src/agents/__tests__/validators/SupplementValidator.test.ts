import { SupplementValidator, SupplementValidationContext } from '../../validators/SupplementValidator'
import { SupplementItem, LineItem, JobData } from '@/types'

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid')
}))

describe('SupplementValidator', () => {
  let validator: SupplementValidator
  let mockJobData: JobData
  let mockEstimateLineItems: LineItem[]

  beforeEach(() => {
    validator = new SupplementValidator()
    
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
        code: 'RFG 240',
        quantity: 25.5,
        unit: 'SQ',
        unitPrice: 150,
        totalPrice: 3825
      },
      {
        description: 'Ridge Cap - comp shingles',
        code: 'RFG RIDGC',
        quantity: 50,
        unit: 'LF',
        unitPrice: 8,
        totalPrice: 400
      }
    ]
  })

  describe('validateSupplement', () => {
    test('should validate a legitimate supplement item', () => {
      const supplement: SupplementItem = {
        id: 'test-1',
        job_id: 'test-job-id',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG DRIP',
        quantity: 150,
        unit: 'LF',
        reason: 'Missing drip edge for rake protection',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.issues).toHaveLength(0)
    })

    test('should detect items that already exist in estimate', () => {
      const supplement: SupplementItem = {
        id: 'test-2',
        job_id: 'test-job-id',
        line_item: 'Ridge Cap',
        xactimate_code: 'RFG RIDGC',
        quantity: 55, // Closer to existing 50 LF to trigger duplicate detection
        unit: 'LF',
        reason: 'Missing ridge cap coverage',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(false)
      expect(result.issues.some(issue => issue.includes('already exists in estimate'))).toBe(true)
      expect(result.confidence).toBeLessThan(0.2)
    })

    test('should adjust quantity when existing item is insufficient', () => {
      const supplement: SupplementItem = {
        id: 'test-3',
        job_id: 'test-job-id',
        line_item: 'Ridge Cap',
        xactimate_code: 'RFG RIDGC',
        quantity: 75, // More than existing 50 LF
        unit: 'LF',
        reason: 'Insufficient ridge cap coverage',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(true)
      expect(result.adjustments).toHaveLength(1)
      expect(result.adjustments[0].adjustedQuantity).toBe(25) // 75 - 50
      expect(supplement.line_item).toBe('Additional Ridge Cap')
      expect(supplement.quantity).toBe(25)
    })

    test('should validate against excessive quantities', () => {
      const supplement: SupplementItem = {
        id: 'test-4',
        job_id: 'test-job-id',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG DRIP',
        quantity: 1000, // Excessive for 150 LF rake
        unit: 'LF',
        reason: 'Drip edge needed',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(false)
      expect(result.issues.some(issue => issue.includes('seems excessive'))).toBe(true)
      expect(result.confidence).toBeLessThan(0.9)
    })

    test('should validate Xactimate codes', () => {
      const supplement: SupplementItem = {
        id: 'test-5',
        job_id: 'test-job-id',
        line_item: 'Ice & Water Barrier',
        xactimate_code: 'INVALID_CODE',
        quantity: 100,
        unit: 'SF',
        reason: 'Code requirement',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.issues.some(issue => issue.includes('Invalid or unknown Xactimate code'))).toBe(true)
      expect(result.confidence).toBeLessThan(0.9)
    })

    test('should validate unit appropriateness', () => {
      const supplement: SupplementItem = {
        id: 'test-6',
        job_id: 'test-job-id',
        line_item: 'Drip Edge Linear Footage',
        xactimate_code: 'RFG DRIP',
        quantity: 150,
        unit: 'SF', // Wrong unit - should be LF
        reason: 'Edge protection needed',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.issues.some(issue => issue.includes('Unusual unit'))).toBe(true)
      expect(result.confidence).toBeLessThan(0.9)
    })
  })

  describe('validateSupplements', () => {
    test('should filter valid and invalid supplements', () => {
      const supplements: SupplementItem[] = [
        {
          id: 'valid-1',
          job_id: 'test-job-id',
          line_item: 'Drip Edge',
          xactimate_code: 'RFG DRIP',
          quantity: 150,
          unit: 'LF',
          reason: 'Missing drip edge',
          confidence_score: 0.9
        },
        {
          id: 'invalid-1',
          job_id: 'test-job-id',
          line_item: 'Ridge Cap',
          xactimate_code: 'RFG RIDGC',
          quantity: 50, // Same as existing
          unit: 'LF',
          reason: 'Missing ridge cap',
          confidence_score: 0.9
        },
        {
          id: 'valid-2',
          job_id: 'test-job-id',
          line_item: 'Ice & Water Barrier',
          xactimate_code: 'RFG IWS',
          quantity: 100,
          unit: 'SF',
          reason: 'Code requirement',
          confidence_score: 0.85
        }
      ]

      const result = validator.validateSupplements(supplements, mockEstimateLineItems, mockJobData)

      expect(result.validSupplements).toHaveLength(2)
      expect(result.invalidSupplements).toHaveLength(1)
      expect(result.validationResults.size).toBe(3)
      expect(result.summary).toContain('2/3 supplements valid')

      const validIds = result.validSupplements.map(s => s.id)
      expect(validIds).toContain('valid-1')
      expect(validIds).toContain('valid-2')
      expect(validIds).not.toContain('invalid-1')
    })

    test('should handle empty supplements array', () => {
      const result = validator.validateSupplements([], mockEstimateLineItems, mockJobData)

      expect(result.validSupplements).toHaveLength(0)
      expect(result.invalidSupplements).toHaveLength(0)
      expect(result.summary).toContain('0/0 supplements valid')
    })
  })

  describe('roofing item similarity detection', () => {
    test('should detect similar roofing terms', () => {
      const supplements: SupplementItem[] = [
        {
          id: 'test-1',
          job_id: 'test-job-id',
          line_item: 'Hip & Ridge Cap',
          xactimate_code: 'RFG RIDGC+',
          quantity: 75,
          unit: 'LF',
          reason: 'Missing hip ridge',
          confidence_score: 0.9
        }
      ]

      // Should detect similarity with existing "Ridge Cap - comp shingles"
      const result = validator.validateSupplements(supplements, mockEstimateLineItems, mockJobData)

      expect(result.invalidSupplements).toHaveLength(1)
      expect(result.validationResults.get('test-1')?.issues.some(issue => issue.includes('already exists'))).toBe(true)
    })

    test('should detect ice & water barrier variations', () => {
      const iceBarrierVariations = [
        'Ice & Water Shield',
        'Ice and Water Barrier', 
        'Ice Water Shield',
        'Ice Barrier'
      ]

      // Add existing ice barrier to estimate
      const estimateWithIce = [
        ...mockEstimateLineItems,
        {
          description: 'Ice & water barrier',
          code: 'RFG IWS',
          quantity: 100,
          unit: 'SF',
          unitPrice: 1.2,
          totalPrice: 120
        }
      ]

      for (const variation of iceBarrierVariations) {
        const supplement: SupplementItem = {
          id: 'test-ice',
          job_id: 'test-job-id',
          line_item: variation,
          xactimate_code: 'RFG IWS',
          quantity: 150,
          unit: 'SF',
          reason: 'Missing ice barrier',
          confidence_score: 0.9
        }

        const result = validator.validateSupplements([supplement], estimateWithIce, mockJobData)
        
        // Should detect all variations as existing item
        expect(result.invalidSupplements.length + result.validSupplements.filter(s => s.line_item.startsWith('Additional')).length).toBeGreaterThan(0)
      }
    })
  })

  describe('quantity analysis and adjustments', () => {
    test('should calculate reasonable ice & water barrier quantities', () => {
      const supplement: SupplementItem = {
        id: 'test-ice',
        job_id: 'test-job-id',
        line_item: 'Ice & Water Barrier',
        xactimate_code: 'RFG IWS',
        quantity: 1320, // 200*6 + 40*3 = 1320 SF (reasonable)
        unit: 'SF',
        reason: 'Code requirement calculation',
        confidence_score: 0.92
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(true)
      expect(result.issues).not.toContain(
        expect.stringContaining('excessive')
      )
    })

    test('should flag unreasonable quantities', () => {
      const supplement: SupplementItem = {
        id: 'test-excessive',
        job_id: 'test-job-id',
        line_item: 'Starter Row',
        xactimate_code: 'RFG STARTER',
        quantity: 1000, // Way too much for 200 LF eave
        unit: 'LF',
        reason: 'Starter needed',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(false)
      expect(result.issues.some(issue => issue.includes('excessive for eave length'))).toBe(true)
    })
  })

  describe('Xactimate code management', () => {
    test('should allow adding new codes', () => {
      validator.addXactimateCode('TEST CODE', 'Test Description')
      
      const codes = validator.getKnownCodes()
      expect(codes.get('TEST CODE')).toBe('Test Description')
    })

    test('should validate against known codes', () => {
      const supplement: SupplementItem = {
        id: 'test-known-code',
        job_id: 'test-job-id',
        line_item: 'Ridge Cap',
        xactimate_code: 'RFG RIDGC',
        quantity: 75,
        unit: 'LF',
        reason: 'Missing ridge coverage',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: [],
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.issues.some(issue => issue.includes('Invalid or unknown Xactimate code'))).toBe(false)
    })
  })

  describe('edge cases and error handling', () => {
    test('should handle supplements with zero or negative quantities', () => {
      const supplement: SupplementItem = {
        id: 'test-zero',
        job_id: 'test-job-id',
        line_item: 'Test Item',
        xactimate_code: 'TEST',
        quantity: 0,
        unit: 'EA',
        reason: 'Test reason',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: mockJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      expect(result.isValid).toBe(false)
      expect(result.issues.some(issue => issue.includes('Invalid quantity: 0'))).toBe(true)
    })

    test('should handle missing job data gracefully', () => {
      const incompleteJobData = {
        id: 'test-id',
        job_id: 'test-job-id'
      } as JobData

      const supplement: SupplementItem = {
        id: 'test-missing-data',
        job_id: 'test-job-id',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG DRIP',
        quantity: 100,
        unit: 'LF',
        reason: 'Missing drip edge',
        confidence_score: 0.9
      }

      const context: SupplementValidationContext = {
        supplement,
        estimateLineItems: mockEstimateLineItems,
        jobData: incompleteJobData,
        xactimateCodeMap: validator.getKnownCodes()
      }

      const result = validator.validateSupplement(context)

      // Should not crash and should still perform basic validation
      expect(result.isValid).toBe(true)
    })

    test('should handle empty estimate line items', () => {
      const supplement: SupplementItem = {
        id: 'test-empty-estimate',
        job_id: 'test-job-id',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG DRIP',
        quantity: 150,
        unit: 'LF',
        reason: 'Missing drip edge',
        confidence_score: 0.9
      }

      const result = validator.validateSupplements([supplement], [], mockJobData)

      expect(result.validSupplements).toHaveLength(1)
      expect(result.invalidSupplements).toHaveLength(0)
    })
  })
})