import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from './supabase'

/**
 * Defines the structure for a log event.
 */
export interface LogEvent {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'error' | 'debug' | 'ai-prompt' | 'ai-response';
  step: string; // e.g., 'estimate-extraction', 'database-save'
  message: string;
  data?: any; // Optional structured data like AI confidence, specific extracted values
}

/**
 * In-memory log streamer for collecting and providing logs during job processing.
 * Logs are stored per job ID.
 */
export class LogStreamer {
  private static instance: LogStreamer;
  private jobLogs: Map<string, LogEvent[]> = new Map();
  private logListeners: Map<string, ((log: LogEvent) => void)[]> = new Map();

  private constructor() {}

  /**
   * Gets the singleton instance of LogStreamer.
   */
  public static getInstance(): LogStreamer {
    if (!LogStreamer.instance) {
      LogStreamer.instance = new LogStreamer();
    }
    return LogStreamer.instance;
  }

  /**
   * Adds a log event for a specific job.
   * @param jobId The ID of the job.
   * @param event The log event details (excluding id and timestamp, which are auto-generated).
   */
  public addLog(jobId: string, event: Omit<LogEvent, 'id' | 'timestamp'>): LogEvent {
    if (!this.jobLogs.has(jobId)) {
      this.jobLogs.set(jobId, []);
    }
    const newLog: LogEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
    };
    this.jobLogs.get(jobId)?.push(newLog);
    
    // Persist to Supabase (fire-and-forget to avoid blocking critical path)
    this.persistLogToDatabase(jobId, newLog).catch((error) => {
      // Swallow errors - logging must never fail the job
      console.warn(`[LogStreamer] Failed to persist log to database for job ${jobId}:`, error);
    });
    
    // Notify listeners for this job
    const listeners = this.logListeners.get(jobId);
    if (listeners) {
      listeners.forEach(listener => listener(newLog));
    }
    return newLog;
  }

  /**
   * Persists a log event to the Supabase database.
   * This ensures logs survive Lambda restarts on Vercel.
   */
  private async persistLogToDatabase(jobId: string, log: LogEvent): Promise<void> {
    // Only persist if we have service role key (production/staging environments)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('job_logs')
        .insert({
          id: log.id,
          job_id: jobId,
          ts: log.timestamp.toISOString(),
          level: log.level,
          step: log.step,
          message: log.message,
          data: log.data ?? null
        });
    } catch (error) {
      // Re-throw to be caught by caller's catch block
      throw error;
    }
  }

  /**
   * Retrieves all logs for a specific job.
   * @param jobId The ID of the job.
   * @returns An array of log events, or an empty array if no logs exist for the job.
   */
  public getLogs(jobId: string): LogEvent[] {
    return this.jobLogs.get(jobId) || [];
  }

  /**
   * Clears all logs for a specific job.
   * Typically called when a job is fully completed or archived.
   * @param jobId The ID of the job.
   */
  public clearLogs(jobId: string): void {
    this.jobLogs.delete(jobId);
    this.logListeners.delete(jobId); // Also clear listeners
  }

  /**
   * Adds a listener for new log events for a specific job.
   * Used by the SSE endpoint to stream logs.
   * @param jobId The ID of the job.
   * @param listener The callback function to execute when a new log is added.
   * @returns A function to remove the listener.
   */
  public addLogListener(jobId: string, listener: (log: LogEvent) => void): () => void {
    if (!this.logListeners.has(jobId)) {
      this.logListeners.set(jobId, []);
    }
    this.logListeners.get(jobId)?.push(listener);

    return () => {
      const listeners = this.logListeners.get(jobId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  // --- Structured logging methods ---

  /**
   * Logs a general step in the process.
   * @param jobId Job ID.
   * @param step A short identifier for the processing stage (e.g., 'pdf-parse', 'ai-analysis').
   * @param message A descriptive message about the step.
   * @param data Optional additional data.
   */
  public logStep(jobId: string, step: string, message: string, data?: any): void {
    this.addLog(jobId, { level: 'info', step, message, data });
  }

  /**
   * Logs an AI prompt being sent.
   * @param jobId Job ID.
   * @param step The step during which the AI call is made.
   * @param prompt The full prompt sent to the AI.
   * @param model The AI model being used.
   */
  public logAIPrompt(jobId: string, step: string, prompt: string, model?: string): void {
    this.addLog(jobId, { level: 'ai-prompt', step, message: `AI Prompt sent (model: ${model || 'N/A'}):`, data: { prompt } });
  }

  /**
   * Logs an AI response received.
   * @param jobId Job ID.
   * @param step The step during which the AI call was made.
   * @param response The raw or processed response from the AI.
   * @param confidence Optional confidence score from the AI.
   * @param rawResponse Optional raw response string.
   */
  public logAIResponse(jobId: string, step: string, message: string, data?: any, confidence?: number, rawResponse?: string): void {
    this.addLog(jobId, { 
      level: 'ai-response', 
      step, 
      message, 
      data: { ...data, confidence, rawResponse }
    });
  }
  
  /**
   * Logs an error that occurred during processing.
   * @param jobId Job ID.
   * @param step The step where the error occurred.
   * @param errorMessage The error message.
   * @param errorObject Optional error object or stack trace.
   */
  public logError(jobId: string, step: string, errorMessage: string, errorObject?: any): void {
    this.addLog(jobId, { level: 'error', step, message: errorMessage, data: { error: errorObject } });
  }

  /**
   * Logs a successful completion of a significant step or the entire job.
   * @param jobId Job ID.
   * @param step The step that succeeded.
   * @param message A success message.
   * @param data Optional additional data.
   */
  public logSuccess(jobId: string, step: string, message: string, data?: any): void {
    this.addLog(jobId, { level: 'success', step, message, data });
  }

   /**
   * Logs a debug message.
   * @param jobId Job ID.
   * @param step The step relevant to the debug message.
   * @param message The debug message.
   * @param data Optional additional data.
   */
  public logDebug(jobId: string, step: string, message: string, data?: any): void {
    this.addLog(jobId, { level: 'debug', step, message, data });
  }
}

// Export a singleton instance
export const logStreamer = LogStreamer.getInstance();
