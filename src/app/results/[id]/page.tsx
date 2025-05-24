'use client'
import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { Job, JobData, SupplementItem } from '@/types'
import ResultsDisplay from '@/components/ResultsDisplay'
import LogTerminal from '@/components/LogTerminal'

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
      // Step 1: Fetch the main job record
      console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching job record...`)
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
        // Step 2a: Fetch associated job_data for failed job (if any)
        console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching job_data for FAILED job...`)
        const { data: jobDataRow, error: jobDataError } = await supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle()
        if (jobDataError) {
          console.warn(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Error fetching job_data for FAILED job: ${jobDataError.message}`)
        }
        return {
          job: job as Job,
          data: jobDataRow as JobData | null,
          supplements: [] // Supplements might not exist for a failed job
        }
      }

      if (job.status === 'completed') {
        console.log(`[Client Job ID: ${jobId}] getJobData: Job status is COMPLETED. Fetching associated data sequentially...`)
        
        // Step 2b: Fetch job_data for completed job
        console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching job_data for COMPLETED job...`)
        const { data: dataResultData, error: dataResultError } = await supabase.from('job_data').select('*').eq('job_id', jobId).maybeSingle()
        if (dataResultError) {
          console.error(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Error fetching job_data for COMPLETED job: ${dataResultError.message}`)
          // If critical, could retry or return job with null data
        }

        // Step 3: Fetch supplement_items for completed job
        console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching supplement_items for COMPLETED job...`)
        const { data: supplementsResultData, error: supplementsResultError } = await supabase.from('supplement_items').select('*').eq('job_id', jobId)
        if (supplementsResultError) {
          console.error(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Error fetching supplement_items for COMPLETED job: ${supplementsResultError.message}`)
        }

        if (dataResultData) {
          console.log(`[Client Job ID: ${jobId}] getJobData: Job COMPLETED and all data found (fetched sequentially).`)
          return {
            job: job as Job,
            data: dataResultData as JobData,
            supplements: (supplementsResultData as SupplementItem[]) || []
          }
        } else {
          console.warn(`[Client Job ID: ${jobId}] getJobData: Job COMPLETED but no job_data found (fetched sequentially). Error from job: ${job.error_message}`)
          if (i === MAX_RETRIES - 1) {
            return { job: job as Job, data: null, supplements: (supplementsResultData as SupplementItem[]) || [] }
          }
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
      if (fetchError.message && fetchError.message.includes('Body has already been consumed')) {
        console.error(`[Client Job ID: ${jobId}] getJobData: 'Body already consumed' error caught specifically.`)
        // Potentially implement a more aggressive backoff or a different client re-initialization strategy here if this persists
      }
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

export default function ResultsPage({ params }: ResultsPageProps) {
  const [jobData, setJobData] = useState<{
    job: Job
    data: JobData | null
    supplements: SupplementItem[]
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(true)
  const [showLogs, setShowLogs] = useState(true)

  useEffect(() => {
    getJobData(params.id).then(data => {
      if (!data) {
        setIsProcessing(false)
        return
      }
      setJobData(data)
      setIsProcessing(data.job.status === 'processing')
    })
  }, [params.id])

  if (!jobData) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Analysis Results</h1>
        <p className="text-gray-600">Job ID: {params.id}</p>
      </div>
      {isProcessing ? (
        <LogTerminal jobId={params.id} onComplete={async () => {
          const fresh = await getJobData(params.id)
          if (fresh) {
            setJobData(fresh)
            setIsProcessing(false)
            setShowLogs(false)
          }
        }} />
      ) : (
        <>
          <button
            className="mb-4 px-3 py-1 rounded bg-gray-200"
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? 'Hide' : 'Show'} Processing Logs
          </button>
          {showLogs && <LogTerminal jobId={params.id} readonly />}
          <ResultsDisplay job={jobData.job} jobData={jobData.data} supplements={jobData.supplements} />
        </>
      )}
    </div>
  )
}