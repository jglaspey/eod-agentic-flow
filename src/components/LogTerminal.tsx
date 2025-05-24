'use client'
import { useEffect, useRef, useState } from 'react'

interface LogTerminalProps {
  jobId: string
  onComplete?: () => void
  readonly?: boolean
}

interface LogEvent {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'error' | 'debug'
  step: string
  message: string
}

export default function LogTerminal({ jobId, onComplete, readonly }: LogTerminalProps) {
  const [logs, setLogs] = useState<LogEvent[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const source = new EventSource(`/api/jobs/${jobId}/logs`)
    source.onmessage = (e) => {
      try {
        const event: LogEvent = JSON.parse(e.data)
        setLogs(prev => [...prev, event])
        if (event.step === 'job-completed' && onComplete) {
          onComplete()
        }
      } catch {
        // ignore parse errors
      }
    }
    return () => source.close()
  }, [jobId, onComplete])

  useEffect(() => {
    const div = terminalRef.current
    if (div) {
      div.scrollTop = div.scrollHeight
    }
  }, [logs])

  const levelColor: Record<LogEvent['level'], string> = {
    info: 'text-gray-200',
    success: 'text-green-300',
    error: 'text-red-300',
    debug: 'text-yellow-300',
  }

  return (
    <div className="bg-black text-sm p-3 rounded-md h-64 overflow-y-auto font-mono" ref={terminalRef}>
      {logs.map(log => (
        <div key={log.id} className={levelColor[log.level]}>
          [{new Date(log.timestamp).toLocaleTimeString()}] ({log.step}) {log.message}
        </div>
      ))}
      {logs.length === 0 && <div className="text-gray-400">Waiting for logs...</div>}
    </div>
  )
}
