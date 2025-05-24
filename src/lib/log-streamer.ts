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

  logStep(jobId: string, step: string, message: string) {
    this.addLog(jobId, { level: 'info', step, message });
  }

  logAIPrompt(jobId: string, step: string, prompt: string) {
    this.addLog(jobId, { level: 'debug', step, message: `PROMPT:\n${prompt}` });
  }

  logAIResponse(jobId: string, step: string, response: string, confidence?: number) {
    this.addLog(jobId, {
      level: 'debug',
      step,
      message: `RESPONSE${confidence ? ` (confidence: ${confidence})` : ''}:\n${response}`,
    });
  }

  logError(jobId: string, step: string, error: string) {
    this.addLog(jobId, { level: 'error', step, message: error });
  }

  logSuccess(jobId: string, step: string, message: string) {
    this.addLog(jobId, { level: 'success', step, message });
  }
}

export const logStreamer = new LogStreamer();
