import { notFound } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { Job, JobData, SupplementItem } from '@/types'
import ResultsDisplay from '@/components/ResultsDisplay'

interface ResultsPageProps {
  params: {
    id: string
  }
}

async function getJobData(jobId: string) {
  const supabase = createSupabaseClient()
  const MAX_RETRIES = 5 // Retry up to 5 times
  const RETRY_DELAY_MS = 3000 // Wait 3 seconds between retries

  for (let i = 0; i < MAX_RETRIES; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      console.log(`[Client Job ID: ${jobId}] Retrying job data fetch (${i + 1}/${MAX_RETRIES})...`)
    }

    const [jobResult, dataResult, supplementsResult] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(), // Job ID must exist
      supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle(), // Data might not exist yet
      supabase.from('supplement_items').select('*').eq('job_id', jobId) // Supplements might be empty
    ])

    console.log(`[Client Job ID: ${jobId}] Attempt ${i + 1}: Job status: ${jobResult.data?.status}, Job error: ${jobResult.error?.message}, Data found: ${!!dataResult.data}, Data error: ${dataResult.error?.message}, Supplements found: ${supplementsResult.data?.length}`);

    if (jobResult.error || !jobResult.data) { // Critical error fetching job itself or job doesn't exist
      console.error(`[Client Job ID: ${jobId}] Job record fetch error or job not found (attempt ${i + 1}):`, jobResult.error?.message)
      if (i === MAX_RETRIES - 1) {
        console.error(`[Client Job ID: ${jobId}] FINAL: Job record not found or unfetchable after ${MAX_RETRIES} retries.`);
        return null; // Will lead to notFound()
      }
      continue // Continue to next retry
    }

    // At this point, jobResult.data is guaranteed to exist.
    const currentJob = jobResult.data as Job;

    if (currentJob.status === 'failed') {
      console.warn(`[Client Job ID: ${jobId}] Job processing FAILED. Error: ${currentJob.error_message}`);
      return {
        job: currentJob,
        data: dataResult.data as JobData | null, 
        supplements: supplementsResult.data as SupplementItem[] || []
      }
    }

    if (currentJob.status === 'completed') {
      if (dataResult.data) {
        console.log(`[Client Job ID: ${jobId}] Job COMPLETED and data found. Proceeding with display.`);
        return {
          job: currentJob,
          data: dataResult.data as JobData,
          supplements: supplementsResult.data as SupplementItem[] || []
        }
      } else {
        // This is an edge case: job is 'completed' but no job_data. This implies an error during data saving on the backend.
        console.error(`[Client Job ID: ${jobId}] Job COMPLETED but no job_data found. Error on job: ${currentJob.error_message}`);
        // We'll let it fall through to the retry logic for now, hoping data appears or job status changes to failed on a later retry.
        // If it's the last retry, it will eventually return the 'completed' job with null data.
      }
    }

    // If job is still 'processing'
    if (currentJob.status === 'processing') {
      // If it's the last retry and still processing, return the current state to display a "processing" message
      if (i === MAX_RETRIES - 1) {
        console.log(`[Client Job ID: ${jobId}] FINAL: Job still PROCESSING after ${MAX_RETRIES} retries. Returning current state.`);
        return {
          job: currentJob,
          data: dataResult.data as JobData | null,
          supplements: supplementsResult.data as SupplementItem[] || []
        };
      }
      // Otherwise, log and continue retrying
      console.log(`[Client Job ID: ${jobId}] Job status: PROCESSING. Data found: ${!!dataResult.data}. Waiting...`)
    }
  }

  // If loop finishes without returning (should ideally be caught by MAX_RETRIES - 1 conditions above)
  console.error(`[Client Job ID: ${jobId}] UNEXPECTED: Exited retry loop without returning a result. This should not happen.`);
  return null; // Fallback, will lead to notFound()
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