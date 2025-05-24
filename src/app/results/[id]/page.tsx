import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { Job, JobData, SupplementItem } from '@/types'
import ResultsDisplay from '@/components/ResultsDisplay'

interface ResultsPageProps {
  params: {
    id: string
  }
}

async function getJobData(jobId: string) {
  const supabase = getSupabaseClient()
  const MAX_RETRIES = 7 // Increased retries
  const RETRY_DELAY_MS = 4000 // Increased delay

  console.log(`[Client Job ID: ${jobId}] getJobData: Initializing fetch. Retries: ${MAX_RETRIES}, Delay: ${RETRY_DELAY_MS}ms`)

  for (let i = 0; i < MAX_RETRIES; i++) {
    if (i > 0) {
      console.log(`[Client Job ID: ${jobId}] getJobData: Waiting ${RETRY_DELAY_MS}ms before retry ${i + 1}`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
    console.log(`[Client Job ID: ${jobId}] getJobData: Attempt ${i + 1}/${MAX_RETRIES} to fetch job details.`)

    try {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (jobError || !job) {
        console.error(`[Client Job ID: ${jobId}] getJobData: Error fetching job record or job not found (Attempt ${i + 1}). Error: ${jobError?.message}`)
        if (i === MAX_RETRIES - 1) {
          console.error(`[Client Job ID: ${jobId}] getJobData: FINAL - Job record not found or unfetchable after ${MAX_RETRIES} retries.`)
          return null // Leads to notFound()
        }
        continue // Next retry
      }

      console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Job record found. Status: ${job.status}, Error Message: ${job.error_message}`)

      if (job.status === 'failed') {
        console.warn(`[Client Job ID: ${jobId}] getJobData: Job processing FAILED. Error from DB: ${job.error_message}`)
        // Fetch associated job_data if any, to show partial info if available
        const { data: jobDataRow } = await supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle()
        return {
          job: job as Job,
          data: jobDataRow as JobData | null,
          supplements: [] // Supplements might not exist for a failed job
        }
      }

      if (job.status === 'completed') {
        console.log(`[Client Job ID: ${jobId}] getJobData: Job status is COMPLETED. Fetching associated data...`)
        const [dataResult, supplementsResult] = await Promise.all([
          supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle(),
          supabase.from('supplement_items').select('*').eq('job_id', jobId)
        ])

        if (dataResult.error) {
          console.error(`[Client Job ID: ${jobId}] getJobData: Error fetching job_data for completed job: ${dataResult.error.message}`)
          // Potentially return job with null data or retry depending on desired behavior for this specific error
        }
        if (supplementsResult.error) {
          console.error(`[Client Job ID: ${jobId}] getJobData: Error fetching supplement_items for completed job: ${supplementsResult.error.message}`)
        }

        if (dataResult.data) {
          console.log(`[Client Job ID: ${jobId}] getJobData: Job COMPLETED and all data found.`)
          return {
            job: job as Job,
            data: dataResult.data as JobData,
            supplements: (supplementsResult.data as SupplementItem[]) || []
          }
        } else {
          console.warn(`[Client Job ID: ${jobId}] getJobData: Job COMPLETED but no job_data found. This might indicate an issue during the final save. Error from job: ${job.error_message}`)
          // If it's the last retry, return with what we have (completed job, null data)
          if (i === MAX_RETRIES - 1) {
            return { job: job as Job, data: null, supplements: [] }
          }
          // Otherwise, continue retrying, hoping data appears.
        }
      }

      // If job is still 'processing'
      if (job.status === 'processing') {
        if (i === MAX_RETRIES - 1) {
          console.log(`[Client Job ID: ${jobId}] getJobData: FINAL - Job still PROCESSING after ${MAX_RETRIES} retries. Returning current state.`)
          const { data: partialData } = await supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle()
          return {
            job: job as Job,
            data: partialData as JobData | null,
            supplements: []
          }
        }
        console.log(`[Client Job ID: ${jobId}] getJobData: Job status: PROCESSING. Waiting and retrying...`)
      }

    } catch (fetchError: any) {
      console.error(`[Client Job ID: ${jobId}] getJobData: Unhandled exception during fetch attempt ${i + 1}:`, fetchError)
      if (i === MAX_RETRIES - 1) {
        console.error(`[Client Job ID: ${jobId}] getJobData: FINAL - Unhandled exception on last retry.`)
        return null // Leads to notFound()
      }
      // Continue to next retry if an unexpected error occurs during a fetch attempt
    }
  }

  console.error(`[Client Job ID: ${jobId}] getJobData: Exited retry loop unexpectedly. This should not happen.`)
  return null // Fallback
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const jobData = await getJobData(params.id)

  if (!jobData) {
    notFound()
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Analysis Results
        </h1>
        <p className="text-gray-600">
          Job ID: {params.id}
        </p>
      </div>

      <ResultsDisplay
        job={jobData.job}
        jobData={jobData.data}
        supplements={jobData.supplements}
      />
    </div>
  )
}