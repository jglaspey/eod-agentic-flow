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
  AgentLog,
  AIConfig
} from './types'
import { logStreamer } from '@/lib/log-streamer'
import { v4 as uuidv4 } from 'uuid'
import { OpenAI } from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'

/**
 * Abstract base class for all agents in the system.
 * Provides common functionality for planning, execution, validation, and retry logic.
 */
export abstract class Agent {
  protected config: AgentConfig
  protected tools: Map<string, Tool> = new Map()
  protected logs: AgentLog[] = []
  protected openai: OpenAI | null = null
  protected anthropic: Anthropic | null = null

  constructor(config: AgentConfig) {
    this.config = config
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
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
    const allowedRetries = context.maxRetries ?? this.config.maxRetries; // Fallback to agent config if not provided
    
    while (attempt <= allowedRetries) {
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
          
          if (attempt < allowedRetries) {
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
        
        if (attempt < allowedRetries) {
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
    // Extract jobId from various possible sources in data
    let jobId = 'current-job';
    if (data?.jobId) {
      jobId = data.jobId;
    } else if (data?.context?.jobId) {
      jobId = data.context.jobId;
    } else if (data?.parentTaskId && typeof data.parentTaskId === 'string' && data.parentTaskId.length > 10) {
      jobId = data.parentTaskId;
    }
    
    // Convert LogLevel to the format expected by logStreamer
    const logLevel = level === LogLevel.DEBUG ? 'debug' : 
                    level === LogLevel.INFO ? 'info' : 
                    level === LogLevel.WARN ? 'info' : 
                    level === LogLevel.ERROR ? 'error' : 
                    level === LogLevel.SUCCESS ? 'success' : 'info';
    
    logStreamer.addLog(jobId, {
      level: logLevel as any,
      step: `${this.agentType}-${event}`,
      message,
      data
    });
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

  /**
   * Helper – send a prompt to an LLM according to an AIConfig
   * This method is now part of the base Agent class for all agents to use.
   */
  protected async callAI(
    config: AIConfig,
    prompt: string,
    jobId: string, // Retained jobId as it's often useful for logging/context in AI calls
    agentTypeOverride?: AgentType // Optional override for logging, defaults to this.agentType
  ): Promise<string> {
    const agentTypeForLog = agentTypeOverride || this.agentType;
    this.log(LogLevel.DEBUG, 'ai-call-start', 
      `Calling ${config.model_provider} model ${config.model_name} for job ${jobId}`,
      { agentType: agentTypeForLog, provider: config.model_provider, model: config.model_name }
    );
    const startTime = Date.now();
    try {
      let responseText = '';
      const messages = [{ role: 'user' as const, content: prompt }];

      if (config.model_provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: config.model_name || 'gpt-4-turbo-preview',
          messages: messages,
          max_tokens: config.max_tokens || 1000,
          temperature: config.temperature || 0.5,
          response_format: config.json_mode ? { type: "json_object" } : undefined,
        });
        responseText = response.choices[0]?.message?.content || '';
      } else if (config.model_provider === 'anthropic' && this.anthropic) {
        // Anthropic system prompt needs to be outside the messages array if used.
        // If json_mode is true, Claude needs specific prompting for JSON output.
        let systemPrompt: string | undefined = undefined;
        if (config.json_mode) {
            // This is a generic way to ask for JSON. Specific instructions in the main prompt are better.
            systemPrompt = "Your response MUST be in JSON format."; 
        }

        const response = await this.anthropic.messages.create({
          model: config.model_name || 'claude-3-sonnet-20240229',
          max_tokens: config.max_tokens || 1000,
          temperature: config.temperature || 0.5,
          system: systemPrompt, 
          messages: messages
        });
        responseText = Array.isArray(response.content) && response.content[0]?.type === 'text' ? response.content[0].text : '';
      } else {
        throw new Error(`Unsupported AI provider or client not initialized: ${config.model_provider}`);
      }
      
      const duration = Date.now() - startTime;
      this.log(LogLevel.INFO, 'ai-call-success', 
        `${config.model_provider} call for ${jobId} completed in ${duration}ms. Output length: ${responseText.length}`,
        { agentType: agentTypeForLog, duration, outputLength: responseText.length, provider: config.model_provider, model: config.model_name }
      );
      return responseText;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.log(LogLevel.ERROR, 'ai-call-error', 
        `${config.model_provider} call for ${jobId} failed after ${duration}ms: ${error.message}`,
        { agentType: agentTypeForLog, duration, error: error.toString(), provider: config.model_provider, model: config.model_name }
      );
      throw error;
    }
  }

  // Add public getter for config
  public getConfig(): AgentConfig {
    return this.config;
  }
} 