import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { logStreamer, LogEvent } from '@/lib/log-streamer'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseClient()

  const encoder = new TextEncoder()
  let interval: NodeJS.Timeout | null = null
  let isClosed = false
  
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastIndex = 0
      controller.enqueue(encoder.encode('retry: 1000\n'))

      interval = setInterval(async () => {
        // Check if already closed to prevent multiple close calls
        if (isClosed) {
          return
        }
        
        try {
          const logs = logStreamer.getLogs(params.id)
          while (lastIndex < logs.length) {
            const log: LogEvent = logs[lastIndex]
            const data = JSON.stringify(log)
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            lastIndex++
          }
          
          const { data: job } = await supabase
            .from('jobs')
            .select('status')
            .eq('id', params.id)
            .single()
            
          if (job && job.status !== 'processing') {
            // Mark as closed before actually closing
            isClosed = true
            if (interval) {
              clearInterval(interval)
              interval = null
            }
            controller.close()
            logStreamer.clearLogs(params.id)
          }
        } catch (error) {
          console.error('Error in log streaming:', error)
          // If there's an error, close the stream gracefully
          if (!isClosed) {
            isClosed = true
            if (interval) {
              clearInterval(interval)
              interval = null
            }
            controller.close()
          }
        }
      }, 500)
    },
    
    cancel() {
      // Handle early client disconnection
      isClosed = true
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
