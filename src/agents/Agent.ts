import { 
  AgentConfig, 
  AgentResult, 
  AgentExecutionPlan, 
  AgentTask, 
  TaskContext, 
  ValidationResult, 
  Tool,
  AgentType,
  LogLevel,
  AgentLog
} from './types'
import { logStreamer } from '@/lib/log-streamer'
import { v4 as uuidv4 } from 'uuid'

/**
 * Abstract base class for all agents in the system.
 * Provides common functionality for planning, execution, validation, and retry logic.
 */
export abstract class Agent {
  protected config: AgentConfig
  protected tools: Map<string, Tool> = new Map()
  protected logs: AgentLog[] = []

  constructor(config: AgentConfig) {
    this.config = config
    this.log(LogLevel.INFO, 'agent-initialized', `${config.name} v${config.version} initialized`)
  }

  /**
   * Abstract methods that must be implemented by concrete agents
   */
  abstract get agentType(): AgentType
  
  /**
   * Plan the execution strategy for the given input
   */
  abstract plan(input: any, context: TaskContext): Promise<AgentExecutionPlan>
  
  /**
   * Execute the core logic of the agent
   */
  abstract act(input: any, context: TaskContext): Promise<AgentResult>
  
  /**
   * Validate the result quality and correctness
   */
  abstract validate(result: any, context: TaskContext): Promise<ValidationResult>

  /**
   * Main entry point for agent execution with built-in retry logic
   */
  async execute(input: any, context: TaskContext): Promise<AgentResult> {
    this.log(LogLevel.INFO, 'execution-start', `Starting execution for task ${context.taskId}`)
    const startTime = Date.now()
    
    let lastError: Error | null = null
    let attempt = 0
    
    while (attempt <= context.maxRetries) {
      try {
        // Plan the execution
        this.log(LogLevel.DEBUG, 'planning-start', `Planning execution attempt ${attempt + 1}`)
        const plan = await this.plan(input, { ...context, retryCount: attempt })
        
        this.log(LogLevel.INFO, 'plan-created', 
          `Execution plan created: ${plan.tasks.length} tasks, estimated ${plan.estimatedDuration}ms`,
          { plan: { taskCount: plan.tasks.length, estimatedDuration: plan.estimatedDuration } }
        )
        
        // Execute the plan
        this.log(LogLevel.INFO, 'execution-acting', 'Executing agent logic')
        const result = await this.act(input, { ...context, retryCount: attempt })
        
        // Validate the result
        this.log(LogLevel.DEBUG, 'validation-start', 'Validating execution result')
        const validation = await this.validate(result.data, context)
        
        const finalResult: AgentResult = {
          ...result,
          validation,
          processingTimeMs: Date.now() - startTime
        }
        
        // Check if result meets quality thresholds
        if (validation.isValid && validation.confidence >= this.config.confidenceThreshold) {
          this.log(LogLevel.SUCCESS, 'execution-success', 
            `Task completed successfully with confidence ${validation.confidence.toFixed(3)}`,
            { 
              confidence: validation.confidence, 
              processingTime: finalResult.processingTimeMs,
              attempts: attempt + 1
            }
          )
          return finalResult
        } else {
          this.log(LogLevel.WARN, 'validation-failed', 
            `Result validation failed: valid=${validation.isValid}, confidence=${validation.confidence.toFixed(3)} (threshold: ${this.config.confidenceThreshold})`,
            { validation }
          )
          
          if (attempt < context.maxRetries) {
            await this.waitForRetry(attempt)
            attempt++
            continue
          } else {
            // Return the result even if it doesn't meet thresholds on final attempt
            this.log(LogLevel.WARN, 'execution-completed-with-issues', 
              'Returning result despite validation issues (max retries reached)'
            )
            return finalResult
          }
        }
        
      } catch (error) {
        lastError = error as Error
        this.log(LogLevel.ERROR, 'execution-error', 
          `Attempt ${attempt + 1} failed: ${lastError.message}`,
          { error: lastError.message, stack: lastError.stack }
        )
        
        if (attempt < context.maxRetries) {
          await this.waitForRetry(attempt)
          attempt++
        } else {
          break
        }
      }
    }
    
    // All attempts failed
    const errorMessage = `Agent execution failed after ${attempt} attempts. Last error: ${lastError?.message || 'Unknown error'}`
    this.log(LogLevel.ERROR, 'execution-failed', errorMessage, { attempts: attempt })
    throw new Error(errorMessage)
  }

  /**
   * Register a tool for use by this agent
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool)
    this.log(LogLevel.DEBUG, 'tool-registered', `Registered tool: ${tool.name}`)
  }

  /**
   * Execute a specific tool
   */
  protected async useTool(toolName: string, input: any, context: TaskContext): Promise<any> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`)
    }
    
    this.log(LogLevel.DEBUG, 'tool-execution-start', `Using tool: ${toolName}`)
    const startTime = Date.now()
    
    try {
      const result = await tool.execute(input, context)
      const duration = Date.now() - startTime
      
      this.log(LogLevel.DEBUG, 'tool-execution-success', 
        `Tool ${toolName} completed in ${duration}ms`,
        { tool: toolName, duration, resultPreview: this.truncateForLog(result) }
      )
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      this.log(LogLevel.ERROR, 'tool-execution-failed', 
        `Tool ${toolName} failed after ${duration}ms: ${(error as Error).message}`,
        { tool: toolName, duration, error: (error as Error).message }
      )
      throw error
    }
  }

  /**
   * Calculate confidence score based on multiple factors
   */
  protected calculateConfidence(factors: {
    extractionQuality?: number // 0-1
    validationScore?: number   // 0-1
    sourceReliability?: number // 0-1
    consistencyScore?: number  // 0-1
    completenessScore?: number // 0-1
  }): number {
    const weights = {
      extractionQuality: 0.3,
      validationScore: 0.25,
      sourceReliability: 0.2,
      consistencyScore: 0.15,
      completenessScore: 0.1
    }
    
    let totalScore = 0
    let totalWeight = 0
    
    for (const [factor, score] of Object.entries(factors)) {
      if (score !== undefined) {
        const weight = weights[factor as keyof typeof weights]
        totalScore += score * weight
        totalWeight += weight
      }
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  /**
   * Log agent activity with structured data
   */
  protected log(
    level: LogLevel, 
    event: string, 
    message: string, 
    data?: any, 
    duration?: number
  ): void {
    const logEntry: AgentLog = {
      timestamp: new Date(),
      level,
      agentType: this.agentType,
      taskId: 'current', // This should be passed from context in real implementation
      message: `[${event.toUpperCase()}] ${message}`,
      data,
      duration
    }
    
    this.logs.push(logEntry)
    
    // Also send to the existing log streamer for real-time UI updates
    logStreamer.logStep(
      'current-job', // This should be passed from context
      `${this.agentType}-${event}`,
      message
    )
  }

  /**
   * Wait before retrying with exponential backoff
   */
  private async waitForRetry(attemptNumber: number): Promise<void> {
    const baseDelay = 1000 // 1 second
    const backoffMultiplier = 2
    const maxDelay = 10000 // 10 seconds
    
    const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attemptNumber), maxDelay)
    
    this.log(LogLevel.INFO, 'retry-wait', `Waiting ${delay}ms before retry attempt ${attemptNumber + 2}`)
    
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Truncate data for logging to prevent huge log entries
   */
  private truncateForLog(data: any): any {
    if (typeof data === 'string') {
      return data.length > 200 ? data.substring(0, 200) + '...' : data
    }
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data).substring(0, 200) + '...'
    }
    return data
  }

  /**
   * Get agent metrics and performance data
   */
  getMetrics(): {
    totalLogs: number
    errorCount: number
    successCount: number
    averageExecutionTime: number
    lastExecutionTime?: number
  } {
    const errorLogs = this.logs.filter(log => log.level === LogLevel.ERROR)
    const successLogs = this.logs.filter(log => log.level === LogLevel.SUCCESS)
    const executionLogs = this.logs.filter(log => log.duration !== undefined)
    
    const avgExecutionTime = executionLogs.length > 0 
      ? executionLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / executionLogs.length
      : 0
    
    const lastExecutionLog = executionLogs[executionLogs.length - 1]
    
    return {
      totalLogs: this.logs.length,
      errorCount: errorLogs.length,
      successCount: successLogs.length,
      averageExecutionTime: avgExecutionTime,
      lastExecutionTime: lastExecutionLog?.duration
    }
  }

  /**
   * Clear logs (useful for testing or memory management)
   */
  clearLogs(): void {
    this.logs = []
    this.log(LogLevel.DEBUG, 'logs-cleared', 'Agent logs cleared')
  }
} 