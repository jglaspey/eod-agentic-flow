import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { logStreamer, LogEvent } from '@/lib/log-streamer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jobs/[id]/logs
 * Returns a Server-Sent Events (SSE) stream of log events for a specific job.
 * - Polls LogStreamer for new events.
 * - Automatically closes the stream if the job status changes to 'completed' or 'failed',
 *   or if the client disconnects.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
  }
  
  // Debug logging for SSE connection
  console.log(`[SSE] Client connecting to logs for job ${jobId}`);
  const existingLogsCount = logStreamer.getLogs(jobId).length;
  console.log(`[SSE] Job ${jobId} has ${existingLogsCount} existing logs`);

  const supabase = getSupabaseClient()

  const encoder = new TextEncoder()
  let interval: NodeJS.Timeout | null = null
  let isClosed = false
  
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSentLogIndex = -1
      let jobMonitoringInterval: NodeJS.Timeout
      let logListenerCleanup: () => void

      const sendLog = (log: LogEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      // Send existing logs immediately
      const existingLogs = logStreamer.getLogs(jobId)
      console.log(`[SSE] Sending ${existingLogs.length} existing logs for job ${jobId}`)
      existingLogs.forEach(sendLog)
      lastSentLogIndex = existingLogs.length - 1

      // Set up listener for new logs
      logListenerCleanup = logStreamer.addLogListener(jobId, (newLog) => {
        // Check if this log has already been sent (e.g. if it was part of initial batch)
        // This simple index check might need refinement if logs can be added out of order
        // or if getLogs doesn't guarantee order, but for now it should be okay.
        const currentLogs = logStreamer.getLogs(jobId)
        const newLogIndex = currentLogs.findIndex(l => l.id === newLog.id)
        if (newLogIndex > lastSentLogIndex) {
          sendLog(newLog)
          lastSentLogIndex = newLogIndex
        }
      })

      // Function to check job status and close stream if completed/failed
      const checkJobStatus = async () => {
        try {
          const { data: job, error } = await supabase
            .from('jobs')
            .select('status')
            .eq('id', jobId)
            .single()

          if (error) {
            console.error(`SSE: Error fetching job ${jobId} status:`, error)
            // Don't close stream on fetch error, just log it and continue polling
            return
          }

          if (job && (job.status === 'completed' || job.status === 'failed')) {
            logStreamer.logDebug(jobId, 'sse-stream', `Job ${jobId} status is ${job.status}. Closing SSE stream.`)
            controller.enqueue(encoder.encode(`event: job_finished\ndata: ${JSON.stringify({ status: job.status })}\n\n`))
            controller.close()
            clearInterval(jobMonitoringInterval)
            if (logListenerCleanup) logListenerCleanup()
          }
        } catch (err) {
          console.error(`SSE: Unexpected error in checkJobStatus for ${jobId}:`, err)
          // Continue polling despite unexpected error
        }
      }

      // Start polling for job status
      // Check immediately once, then set interval
      checkJobStatus()
      jobMonitoringInterval = setInterval(checkJobStatus, 3000) // Check job status every 3 seconds

      // Cleanup when the client disconnects
      request.signal.addEventListener('abort', () => {
        console.log(`SSE: Client disconnected for job ${jobId}. Cleaning up.`)
        clearInterval(jobMonitoringInterval)
        if (logListenerCleanup) logListenerCleanup()
        try {
          controller.close()
        } catch (e) {
          // Controller might already be closed, ignore
        }
      })
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

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
