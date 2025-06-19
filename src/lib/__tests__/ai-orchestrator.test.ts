import { AIOrchestrator } from '../ai-orchestrator'
import { SupplementItem } from '@/types'

// Mock OpenAI and Anthropic
jest.mock('openai', () => ({
  OpenAI: jest.fn()
}))

jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn()
}))

// Mock dependencies
jest.mock('../supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ 
            data: { 
              step_name: 'test', 
              provider: 'anthropic', 
              model: 'claude-3', 
              prompt: 'test prompt', 
              temperature: 0.1, 
              max_tokens: 1000 
            }, 
            error: null 
          }))
        }))
      }))
    }))
  }))
}))

jest.mock('../log-streamer', () => ({
  logStreamer: {
    logStep: jest.fn(),
    logDebug: jest.fn(),
    logSuccess: jest.fn(),
    logError: jest.fn(),
    logAIPrompt: jest.fn(),
    logAIResponse: jest.fn()
  }
}))

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid')
}))

describe('AIOrchestrator - Enhanced Multi-Item Parsing', () => {
  let orchestrator: AIOrchestrator
  
  beforeEach(() => {
    orchestrator = new AIOrchestrator('test-job-id')
    // Clear all mocks
    jest.clearAllMocks()
  })

  describe('parseSupplementSuggestions', () => {
    test('should parse valid JSON array with multiple items', async () => {
      const mockResponse = JSON.stringify([
        {
          line_item: "Drip Edge",
          reason: "Missing drip edge for rake protection",
          xactimate_code: "RFG DRIP",
          quantity: 120,
          unit: "LF",
          confidence_score: 0.85
        },
        {
          line_item: "Ice & Water Barrier",
          reason: "Code required ice barrier missing",
          xactimate_code: "RFG IWS",
          quantity: 85,
          unit: "SF",
          confidence_score: 0.92
        }
      ])

      // Access private method for testing
      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        line_item: "Drip Edge",
        reason: "Missing drip edge for rake protection",
        xactimate_code: "RFG DRIP",
        quantity: 120,
        unit: "LF",
        confidence_score: 0.85
      })
      expect(result[1]).toMatchObject({
        line_item: "Ice & Water Barrier",
        reason: "Code required ice barrier missing", 
        xactimate_code: "RFG IWS",
        quantity: 85,
        unit: "SF",
        confidence_score: 0.92
      })
    })

    test('should parse JSON from markdown code blocks', async () => {
      const mockResponse = `
Here are the missing items:

\`\`\`json
[
  {
    "line_item": "Gutter Apron",
    "reason": "Required for eave water management",
    "quantity": 150,
    "unit": "LF"
  }
]
\`\`\`
      `

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(1)
      expect(result[0].line_item).toBe("Gutter Apron")
      expect(result[0].reason).toBe("Required for eave water management")
    })

    test('should handle single object (not array) by wrapping in array', async () => {
      const mockResponse = JSON.stringify({
        line_item: "Ridge Cap",
        reason: "Missing ridge cap coverage",
        quantity: 45,
        unit: "LF"
      })

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(1)
      expect(result[0].line_item).toBe("Ridge Cap")
    })

    test('should extract items from structured text with patterns', async () => {
      const mockResponse = `
Analysis shows the following missing items:

1. Drip Edge - Missing proper edge protection
   Code: RFG DRIP
   Quantity: 120
   Unit: LF

2. Ice & Water Barrier - Code requirement not met
   Code: RFG IWS  
   Quantity: 85
   Unit: SF
      `

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result.length).toBeGreaterThan(0)
      // Should extract at least the items from the structured text
    })

    test('should handle malformed JSON gracefully with line-by-line fallback', async () => {
      const mockResponse = `
Based on analysis, missing items include:
- Drip Edge: Required for rake protection
- Ice & Water Barrier: Code compliance issue
- Starter Row: Improper installation detected
      `

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result.length).toBeGreaterThan(0)
      // Should extract items even from unstructured text
      expect(result.some(item => item.line_item.includes('Drip Edge'))).toBe(true)
      expect(result.some(item => item.line_item.includes('Ice & Water Barrier'))).toBe(true)
      expect(result.some(item => item.line_item.includes('Starter Row'))).toBe(true)
    })

    test('should generate default reasons when reason is missing', async () => {
      const mockResponse = JSON.stringify([
        {
          line_item: "Drip Edge",
          quantity: 120,
          unit: "LF"
          // Missing reason field
        }
      ])

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(1)
      expect(result[0].reason).toContain('Drip edge required for proper roof edge protection')
    })

    test('should intelligently detect units based on description', async () => {
      const mockResponse = JSON.stringify([
        {
          line_item: "Drip Edge Linear Footage",
          reason: "Missing edge protection"
          // Missing unit and quantity
        },
        {
          line_item: "Ice Water Barrier Area", 
          reason: "Code requirement"
          // Missing unit and quantity
        }
      ])

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(2)
      expect(result[0].unit).toBe('LF') // Should detect linear footage
      expect(result[1].unit).toBe('SF') // Should detect area/square footage
    })

    test('should handle completely empty or invalid responses', async () => {
      const invalidResponses = [
        '',
        '   ',
        'No items found',
        '{"invalid": "json"',
        '[]'
      ]

      for (const response of invalidResponses) {
        const result = (orchestrator as any).parseSupplementSuggestions(response, 'test-step')
        expect(Array.isArray(result)).toBe(true)
        // Should not crash and return empty array for truly empty responses
      }
    })

    test('should preserve confidence scores and adjust based on data quality', async () => {
      const mockResponse = JSON.stringify([
        {
          line_item: "Drip Edge",
          reason: "Missing protection", 
          xactimate_code: "RFG DRIP",
          quantity: 120,
          unit: "LF",
          confidence_score: 0.95
        },
        {
          line_item: "Unknown Item",
          reason: "Something missing",
          // No code - should reduce confidence
          quantity: 1,
          unit: "EA",
          confidence_score: 0.90
        }
      ])

      const result = (orchestrator as any).parseSupplementSuggestions(mockResponse, 'test-step')
      
      expect(result).toHaveLength(2)
      expect(result[0].confidence_score).toBe(0.95) // Should preserve high confidence
      expect(result[1].confidence_score).toBeLessThan(0.90) // Should reduce due to missing code
    })
  })

  describe('createSupplementFromSuggestion', () => {
    test('should handle various description field names', async () => {
      const suggestions = [
        { description: "Test Item 1", reason: "Test reason" },
        { line_item: "Test Item 2", reason: "Test reason" },
        { item: "Test Item 3", reason: "Test reason" },
        { name: "Test Item 4", reason: "Test reason" },
        { title: "Test Item 5", reason: "Test reason" }
      ]

      for (const [index, suggestion] of suggestions.entries()) {
        const result = (orchestrator as any).createSupplementFromSuggestion(suggestion, index, 'test-step')
        expect(result).not.toBeNull()
        expect(result.line_item).toContain(`Test Item ${index + 1}`)
      }
    })

    test('should reject suggestions with no valid description', async () => {
      const invalidSuggestions = [
        { reason: "Has reason but no description" },
        { description: "", reason: "Empty description" },
        { description: "   ", reason: "Whitespace description" },
        { description: null, reason: "Null description" },
        { description: 123, reason: "Non-string description" }
      ]

      for (const suggestion of invalidSuggestions) {
        const result = (orchestrator as any).createSupplementFromSuggestion(suggestion, 0, 'test-step')
        expect(result).toBeNull()
      }
    })

    test('should generate intelligent default reasons', async () => {
      const testCases = [
        { description: "Drip Edge", expectedReason: "Drip edge required for proper roof edge protection" },
        { description: "Ice & Water Barrier", expectedReason: "Ice & water barrier required by building code" },
        { description: "Ridge Cap", expectedReason: "Ridge cap required for proper roof ridge coverage" },
        { description: "Starter Row", expectedReason: "Starter row required for proper shingle installation" },
        { description: "Gutter Apron", expectedReason: "Gutter apron required for proper water management" },
        { description: "Random Item", expectedReason: "Random Item identified as missing or insufficient based on analysis" }
      ]

      for (const testCase of testCases) {
        const result = (orchestrator as any).createSupplementFromSuggestion(
          { line_item: testCase.description }, 
          0, 
          'test-step'
        )
        expect(result.reason).toBe(testCase.expectedReason)
      }
    })
  })
})

describe('AIOrchestrator - Integration', () => {
  test('should handle real-world AI response patterns', async () => {
    const orchestrator = new AIOrchestrator('integration-test-job')
    
    // Simulate a realistic but imperfect AI response
    const realisticResponse = `
Based on the analysis, I found the following discrepancies:

\`\`\`json
[
  {
    "line_item": "Drip Edge", 
    "reason": "The roof report shows 258 LF of rake edges but no drip edge found in estimate",
    "xactimate_code": "RFG DRIP",
    "quantity": 258,
    "unit": "LF",
    "confidence_score": 0.89
  },
  {
    "line_item": "Ice & Water Barrier",
    "reason": "Code requires 85 SF for eaves but only 50 SF found in estimate", 
    "xactimate_code": "RFG IWS",
    "quantity": 35,
    "unit": "SF",
    "confidence_score": 0.94
  }
]
\`\`\`

These items should be added to ensure code compliance and proper roof protection.
    `

    const result = (orchestrator as any).parseSupplementSuggestions(realisticResponse, 'integration-test')
    
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      line_item: "Drip Edge",
      xactimate_code: "RFG DRIP", 
      quantity: 258,
      unit: "LF"
    })
    expect(result[1]).toMatchObject({
      line_item: "Ice & Water Barrier",
      xactimate_code: "RFG IWS",
      quantity: 35,
      unit: "SF"
    })
  })
})