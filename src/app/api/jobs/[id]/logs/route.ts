import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { LogEvent } from '@/lib/log-streamer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jobs/[id]/logs
 * Returns a Server-Sent Events (SSE) stream of log events for a specific job.
 * - Reads logs from Supabase database to work across Vercel Lambda boundaries.
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

  const supabase = getSupabaseClient()

  const encoder = new TextEncoder()
  let interval: NodeJS.Timeout | null = null
  let isClosed = false
  
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSentTimestamp = new Date(0).toISOString() // Start from epoch
      let jobMonitoringInterval: NodeJS.Timeout

      const sendLog = (log: any) => {
        // Convert database row to LogEvent format
        const logEvent: LogEvent = {
          id: log.id,
          timestamp: new Date(log.ts),
          level: log.level,
          step: log.step,
          message: log.message,
          data: log.data
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(logEvent)}\n\n`))
      }

      // Function to fetch and send new logs from database
      const fetchAndSendLogs = async () => {
        try {
          const { data: newLogs, error } = await supabase
            .from('job_logs')
            .select('id, ts, level, step, message, data')
            .eq('job_id', jobId)
            .gt('ts', lastSentTimestamp)
            .order('ts', { ascending: true })
            .limit(100); // Prevent overwhelming the client

          if (error) {
            console.error(`[SSE] Error fetching logs for job ${jobId}:`, error);
            return;
          }

          if (newLogs && newLogs.length > 0) {
            console.log(`[SSE] Sending ${newLogs.length} new logs for job ${jobId}`);
            newLogs.forEach(sendLog);
            // Update lastSentTimestamp to the timestamp of the last log sent
            lastSentTimestamp = newLogs[newLogs.length - 1].ts;
          }
        } catch (error) {
          console.error(`[SSE] Unexpected error fetching logs for job ${jobId}:`, error);
        }
      };

      // Send existing logs immediately
      await fetchAndSendLogs();

      // Set up polling for new logs every 2 seconds
      const logPollingInterval = setInterval(fetchAndSendLogs, 2000);

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
            console.log(`[SSE] Job ${jobId} status is ${job.status}. Closing SSE stream.`);
            controller.enqueue(encoder.encode(`event: job_finished\ndata: ${JSON.stringify({ status: job.status })}\n\n`))
            controller.close()
            clearInterval(jobMonitoringInterval)
            clearInterval(logPollingInterval)
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
        clearInterval(logPollingInterval)
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
