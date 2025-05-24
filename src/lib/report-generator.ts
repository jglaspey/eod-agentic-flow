import { EstimateData, RoofData, SupplementItem } from '@/types'
import { logStreamer } from './log-streamer'
import { getSupabaseClient } from './supabase'

export async function generateAndSaveReport(
  jobId: string,
  estimateData: EstimateData | null,
  roofData: RoofData | null,
  supplementItems: SupplementItem[],
  status: string,
  errorMessage?: string | null
): Promise<void> {
  const supabase = getSupabaseClient()
  const logs = logStreamer.getLogs(jobId)

  const reportLines: string[] = []
  reportLines.push(`# Report for Job ${jobId}`)
  reportLines.push('')
  reportLines.push(`**Status:** ${status}`)
  if (errorMessage) {
    reportLines.push(`**Error:** ${errorMessage}`)
  }
  reportLines.push('')
  reportLines.push('## Estimate Data')
  reportLines.push('```json')
  reportLines.push(JSON.stringify(estimateData ?? {}, null, 2))
  reportLines.push('```')
  reportLines.push('')
  reportLines.push('## Roof Data')
  reportLines.push('```json')
  reportLines.push(JSON.stringify(roofData ?? {}, null, 2))
  reportLines.push('```')
  reportLines.push('')
  reportLines.push('## Supplement Items')
  reportLines.push('```json')
  reportLines.push(JSON.stringify(supplementItems ?? [], null, 2))
  reportLines.push('```')
  reportLines.push('')
  reportLines.push('## Logs')
  reportLines.push('```')
  reportLines.push(
    logs
      .map(l => `[${l.timestamp.toISOString()}] (${l.step}) ${l.message}`)
      .join('\n')
  )
  reportLines.push('```')

  const report_md = reportLines.join('\n')

  await supabase.from('job_reports').insert({ job_id: jobId, report_md })
}
