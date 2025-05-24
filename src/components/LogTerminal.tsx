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
  const [connectionError, setConnectionError] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    let source: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let fallbackInterval: NodeJS.Timeout | null = null
    
    const connectEventSource = () => {
      try {
        source = new EventSource(`/api/jobs/${jobId}/logs`)
        setConnectionError(false)
        
        source.onmessage = (e) => {
          try {
            const event: LogEvent = JSON.parse(e.data)
            setLogs(prev => [...prev, event])
            if (event.step === 'job-completed' && onComplete && !completedRef.current) {
              completedRef.current = true
              onComplete()
            }
          } catch {
            // ignore parse errors
          }
        }
        
        source.onerror = (e) => {
          console.error('EventSource error:', e)
          setConnectionError(true)
          source?.close()
          
          // Try to reconnect after 2 seconds
          if (!completedRef.current && !readonly) {
            reconnectTimeout = setTimeout(() => {
              console.log('Attempting to reconnect EventSource...')
              connectEventSource()
            }, 2000)
          }
        }
        
        source.onopen = () => {
          console.log('EventSource connected successfully')
          setConnectionError(false)
        }
      } catch (error) {
        console.error('Failed to create EventSource:', error)
        setConnectionError(true)
        
        // Fallback to polling if EventSource fails
        if (!completedRef.current && !readonly) {
          startFallbackPolling()
        }
      }
    }
    
    const startFallbackPolling = () => {
      console.log('Starting fallback polling mechanism...')
      fallbackInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/jobs/${jobId}/status`)
          if (response.ok) {
            const data = await response.json()
            if (data.status !== 'processing' && onComplete && !completedRef.current) {
              completedRef.current = true
              onComplete()
              if (fallbackInterval) {
                clearInterval(fallbackInterval)
              }
            }
          }
        } catch (error) {
          console.error('Fallback polling error:', error)
        }
      }, 3000)
    }
    
    // Initial connection
    connectEventSource()
    
    // Cleanup
    return () => {
      source?.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (fallbackInterval) clearInterval(fallbackInterval)
    }
  }, [jobId, onComplete, readonly])

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
    <div className="space-y-2">
      {connectionError && !readonly && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-yellow-800 text-sm">
            Connection interrupted. Attempting to reconnect...
          </p>
        </div>
      )}
      <div className="bg-black text-sm p-3 rounded-md h-64 overflow-y-auto font-mono" ref={terminalRef}>
        {logs.map(log => (
          <div key={log.id} className={levelColor[log.level]}>
            [{new Date(log.timestamp).toLocaleTimeString()}] ({log.step}) {log.message}
          </div>
        ))}
        {logs.length === 0 && <div className="text-gray-400">Waiting for logs...</div>}
      </div>
    </div>
  )
}
