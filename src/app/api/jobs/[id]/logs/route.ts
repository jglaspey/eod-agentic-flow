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
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastIndex = 0
      controller.enqueue(encoder.encode('retry: 1000\n'))

      const interval = setInterval(async () => {
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
          clearInterval(interval)
          controller.close()
          logStreamer.clearLogs(params.id)
        }
      }, 500)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
