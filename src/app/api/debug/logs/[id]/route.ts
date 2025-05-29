import { NextRequest, NextResponse } from 'next/server'
import { logStreamer } from '@/lib/log-streamer'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id
  
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
  }
  
  const logs = logStreamer.getLogs(jobId)
  
  return NextResponse.json({
    jobId,
    logCount: logs.length,
    logs: logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level,
      step: log.step,
      message: log.message
    }))
  })
}