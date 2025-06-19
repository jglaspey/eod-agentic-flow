import { SupplementGeneratorAgent } from '../SupplementGeneratorAgent'
import { TaskContext } from '../types'
import { JobData, LineItem } from '@/types'

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ error: null }))
    }))
  }))
}))

jest.mock('@/lib/ai-orchestrator', () => ({
  AIOrchestrator: jest.fn().mockImplementation(() => ({
    analyzeDiscrepanciesAndSuggestSupplements: jest.fn().mockResolvedValue([
      {
        id: 'ai-supplement-1',
        job_id: 'test-job-id',
        line_item: 'Drip Edge',
        xactimate_code: 'RFG DRIP',
        quantity: 120,
        unit: 'LF',
        reason: 'Missing drip edge for rake protection',
        confidence_score: 0.85
      }
    ])
  }))
}))

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid')
}))

// Mock the Agent base class log method
const mockLog = jest.fn()
jest.mock('../Agent', () => ({
  Agent: class MockAgent {
    config: any
    constructor(config: any) {
      this.config = config
    }
    log = mockLog
  }
}))

describe('SupplementGeneratorAgent - Multi-Pass Integration', () => {
  let agent: SupplementGeneratorAgent
  let mockJobData: JobData
  let mockEstimateLineItems: LineItem[]
  let mockContext: TaskContext

  beforeEach(() => {
    agent = new SupplementGeneratorAgent()
    
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
      }
    ]

    mockContext = {
      taskId: 'test-task-id',
      jobId: 'test-job-id',
      userId: 'test-user-id',
      traceId: 'test-trace-id'
    }

    // Clear all mocks
    jest.clearAllMocks()
  })

  test('should execute multi-pass workflow successfully', async () => {
    const input = {
      jobId: 'test-job-id',
      jobData: mockJobData,
      actualEstimateLineItems: mockEstimateLineItems
    }

    const result = await agent.act(input, mockContext)

    // Verify the result structure
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('validation')
    expect(result.model).toBe('multi_pass_system')

    // Verify logging calls were made for each pass
    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String), // LogLevel
      'supplement-generation-start-multipass', 
      expect.stringContaining('Starting multi-pass supplement generation'),
      expect.any(Object)
    )

    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-1-ai-suggestions',
      expect.stringContaining('Pass 1: Getting initial AI suggestions'),
      expect.any(Object)
    )

    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-2-business-rules',
      expect.stringContaining('Pass 2: Running business rules validation'),
      expect.any(Object)
    )

    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-3-validation',
      expect.stringContaining('Pass 3: Cross-reference validation'),
      expect.any(Object)
    )

    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-5-confidence',
      expect.stringContaining('Pass 5: Calculating final confidence score'),
      expect.any(Object)
    )

    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'multi-pass-complete',
      expect.stringContaining('Multi-pass supplement generation completed'),
      expect.any(Object)
    )

    // Verify output structure
    expect(result.data.jobId).toBe('test-job-id')
    expect(result.data.generatedSupplements).toBeDefined()
    expect(result.data.supplementRationales).toBeDefined()
    expect(result.data.issuesOrSuggestions).toBeDefined()
    expect(result.data.overallConfidence).toBeDefined()
    expect(typeof result.data.overallConfidence).toBe('number')
  })

  test('should handle missing input data gracefully', async () => {
    const input = {
      jobId: 'test-job-id',
      jobData: null as any,
      actualEstimateLineItems: mockEstimateLineItems
    }

    const result = await agent.act(input, mockContext)

    expect(result.data.generatedSupplements).toHaveLength(0)
    expect(result.data.overallConfidence).toBe(0.0)
    expect(result.data.issuesOrSuggestions).toContain('Critical: Missing input data.')
    expect(result.validation.isValid).toBe(false)
  })

  test('should continue processing when AI fails', async () => {
    // Mock AI to throw an error
    const mockAIOrchestrator = jest.fn().mockImplementation(() => ({
      analyzeDiscrepanciesAndSuggestSupplements: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
    }))
    
    const { AIOrchestrator } = require('@/lib/ai-orchestrator')
    AIOrchestrator.mockImplementation(mockAIOrchestrator)

    const input = {
      jobId: 'test-job-id',
      jobData: mockJobData,
      actualEstimateLineItems: mockEstimateLineItems
    }

    const result = await agent.act(input, mockContext)

    // Should still complete successfully even if AI fails
    expect(result).toHaveProperty('data')
    expect(result.model).toBe('multi_pass_system')
    
    // Should log AI failure
    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-1-failed',
      expect.stringContaining('Pass 1 AI suggestions failed'),
      expect.any(Object)
    )

    // Should continue with business rules
    expect(mockLog).toHaveBeenCalledWith(
      expect.any(String),
      'pass-2-business-rules',
      expect.stringContaining('Pass 2: Running business rules validation'),
      expect.any(Object)
    )
  })

  test('should validate output structure', async () => {
    const input = {
      jobId: 'test-job-id',
      jobData: mockJobData,
      actualEstimateLineItems: mockEstimateLineItems
    }

    const result = await agent.act(input, mockContext)
    const validation = await agent.validate(result.data, mockContext)

    expect(validation).toHaveProperty('isValid')
    expect(validation).toHaveProperty('confidence')
    expect(validation).toHaveProperty('errors')
    expect(validation).toHaveProperty('warnings')
    expect(validation).toHaveProperty('suggestions')
    
    expect(typeof validation.isValid).toBe('boolean')
    expect(typeof validation.confidence).toBe('number')
    expect(Array.isArray(validation.errors)).toBe(true)
    expect(Array.isArray(validation.warnings)).toBe(true)
    expect(Array.isArray(validation.suggestions)).toBe(true)
  })
})