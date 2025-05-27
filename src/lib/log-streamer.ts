export interface LogEvent {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'error' | 'debug';
  step: string;
  message: string;
  data?: any;
}

class LogStreamer {
  private logs: Map<string, LogEvent[]> = new Map();

  addLog(jobId: string, event: Omit<LogEvent, 'id' | 'timestamp'>) {
    const log: LogEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...event,
    };
    const jobLogs = this.logs.get(jobId) || [];
    jobLogs.push(log);
    this.logs.set(jobId, jobLogs);
  }

  getLogs(jobId: string): LogEvent[] {
    return this.logs.get(jobId) || [];
  }

  clearLogs(jobId: string) {
    this.logs.delete(jobId);
  }

  logStep(jobId: string, step: string, message: string, traceData?: any) {
    this.addLog(jobId, { level: 'info', step, message, data: traceData });
  }

  logAIPrompt(jobId: string, step: string, prompt: string, traceData?: any) {
    this.addLog(jobId, { level: 'debug', step, message: `PROMPT:\n${prompt}`, data: traceData });
  }

  logAIResponse(jobId: string, step: string, response: string, confidence?: number, traceData?: any) {
    this.addLog(jobId, {
      level: 'debug',
      step,
      message: `RESPONSE${confidence ? ` (confidence: ${confidence})` : ''}:\n${response}`,
      data: traceData,
    });
  }

  logError(jobId: string, step: string, error: string, traceData?: any) {
    this.addLog(jobId, { level: 'error', step, message: error, data: traceData });
  }

  logSuccess(jobId: string, step: string, message: string, traceData?: any) {
    this.addLog(jobId, { level: 'success', step, message, data: traceData });
  }
}

export const logStreamer = new LogStreamer();
