'use client'
import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { Job, JobData, SupplementItem } from '@/types'
import ResultsDisplay from '@/components/ResultsDisplay'
import LogTerminal from '@/components/LogTerminal'
import Link from 'next/link'

interface ResultsPageProps {
  params: {
    id: string
  }
}

// Fetch all logs from database for download/copy
async function fetchAllLogs(jobId: string): Promise<string> {
  const supabase = getSupabaseClient()
  
  try {
    // Fetch logs from job_logs table
    const { data: logs, error } = await supabase
      .from('job_logs')
      .select('ts, level, step, message, data')
      .eq('job_id', jobId)
      .order('ts', { ascending: true })
    
    if (error) {
      console.error('Error fetching logs:', error)
      return 'Error fetching logs'
    }
    
    if (!logs || logs.length === 0) {
      return 'No logs found for this job'
    }
    
    // Format logs for export
    const formattedLogs = logs.map(log => {
      const timestamp = new Date(log.ts).toLocaleString()
      const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : ''
      return `[${timestamp}] ${log.level.toUpperCase()} (${log.step}) ${log.message}${dataStr}`
    }).join('\n\n')
    
    return `Job Logs - ID: ${jobId}\nGenerated: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n${formattedLogs}`
  } catch (err) {
    console.error('Unexpected error fetching logs:', err)
    return 'Error fetching logs'
  }
}

// Fetch only multi-pass logs
async function fetchMultiPassLogs(jobId: string): Promise<string> {
  const supabase = getSupabaseClient()
  
  try {
    // Fetch only multi-pass related logs
    const { data: logs, error } = await supabase
      .from('job_logs')
      .select('ts, level, step, message, data')
      .eq('job_id', jobId)
      .like('step', 'multi-pass%')
      .order('ts', { ascending: true })
    
    if (error) {
      console.error('Error fetching multi-pass logs:', error)
      return 'Error fetching multi-pass logs'
    }
    
    if (!logs || logs.length === 0) {
      return 'No multi-pass logs found for this job'
    }
    
    // Format logs for export with nice grouping
    const formattedLogs = logs.map(log => {
      const timestamp = new Date(log.ts).toLocaleString()
      const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : ''
      return `[${timestamp}] ${log.level.toUpperCase()} (${log.step}) ${log.message}${dataStr}`
    }).join('\n\n')
    
    return `Multi-Pass Logs - Job ID: ${jobId}\nGenerated: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n${formattedLogs}`
  } catch (err) {
    console.error('Unexpected error fetching multi-pass logs:', err)
    return 'Error fetching multi-pass logs'
  }
}

// Download logs as a file
function downloadLogs(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function getJobData(jobId: string) {
  const supabase = getSupabaseClient()
  const MAX_RETRIES = 10 // Increased retries for Vercel
  const RETRY_DELAY_MS = 5000 // Increased delay for database replication

  console.log(`[Client Job ID: ${jobId}] getJobData: Initializing fetch. Retries: ${MAX_RETRIES}, Delay: ${RETRY_DELAY_MS}ms`)

  for (let i = 0; i < MAX_RETRIES; i++) {
    if (i > 0) {
      console.log(`[Client Job ID: ${jobId}] getJobData: Waiting ${RETRY_DELAY_MS}ms before retry ${i + 1}`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
    console.log(`[Client Job ID: ${jobId}] getJobData: Attempt ${i + 1}/${MAX_RETRIES} to fetch job details.`)

    try {
      // Step 1: Fetch the main job record with cache busting
      console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching job record...`)
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .order('created_at', { ascending: false }) // Force fresh read
        .limit(1)
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
        
        // Add a small delay to ensure database replication on Vercel
        if (i === 0) {
          console.log(`[Client Job ID: ${jobId}] getJobData: First attempt on completed job, waiting for DB replication...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        
        // Step 2b: Fetch job_data for completed job with cache busting
        console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching job_data for COMPLETED job...`)
        const { data: dataResultData, error: dataResultError } = await supabase
          .from('job_data')
          .select('*')
          .eq('job_id', jobId)
          .order('id', { ascending: false }) // Force fresh read
          .limit(1)
          .maybeSingle()
        if (dataResultError) {
          console.error(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Error fetching job_data for COMPLETED job: ${dataResultError.message}`)
          // If critical, could retry or return job with null data
        }

        // Step 3: Fetch supplement_items for completed job with cache busting
        console.log(`[Client Job ID: ${jobId}] getJobData: (Attempt ${i + 1}) Fetching supplement_items for COMPLETED job...`)
        const { data: supplementsResultData, error: supplementsResultError } = await supabase
          .from('supplement_items')
          .select('*')
          .eq('job_id', jobId)
          .order('id', { ascending: false }) // Force fresh read
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
          // On Vercel, data might take longer to replicate, so retry more aggressively
          if (i < MAX_RETRIES - 1) {
            console.log(`[Client Job ID: ${jobId}] getJobData: Retrying due to missing job_data on completed job...`)
            continue
          }
          return { job: job as Job, data: null, supplements: (supplementsResultData as SupplementItem[]) || [] }
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
  const [showLogs, setShowLogs] = useState(false) // Collapsed by default
  const [error, setError] = useState<string | null>(null)
  const [showLogOptions, setShowLogOptions] = useState(false)

  useEffect(() => {
    getJobData(params.id).then(data => {
      if (!data) {
        setError('Job not found')
        setIsProcessing(false)
        return
      }
      setJobData(data)
      setIsProcessing(data.job.status === 'processing')
    }).catch(err => {
      console.error('Error loading job data:', err)
      setError('Failed to load job data')
      setIsProcessing(false)
    })
  }, [params.id])

  // Click outside handler for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showLogOptions && !(event.target as HTMLElement).closest('.log-options-dropdown')) {
        setShowLogOptions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLogOptions])

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  if (!jobData) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Analysis Results</h1>
        <p className="text-gray-600">Job ID: {params.id}</p>
        <Link
          href="/"
          className="inline-block mt-2 text-blue-600 hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
      {isProcessing ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">Processing Job...</h2>
            <p className="text-blue-700">Your analysis is in progress. Logs will appear below.</p>
          </div>
          <LogTerminal jobId={params.id} onComplete={async () => {
            // Add a delay before fetching to ensure database replication on Vercel
            console.log('Job completed, waiting for database replication...')
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            const fresh = await getJobData(params.id)
            if (fresh) {
              setJobData(fresh)
              setIsProcessing(false)
              setShowLogs(true) // Keep logs visible after completion
            } else {
              setError('Failed to load completed job data')
              setIsProcessing(false)
            }
          }} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Results Display First */}
          <ResultsDisplay job={jobData.job} jobData={jobData.data} supplements={jobData.supplements} />
          
          {/* Collapsible Logs Section at Bottom */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
              <button
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
                onClick={() => setShowLogs(!showLogs)}
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${showLogs ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">Processing Logs</span>
              </button>
              
              <div className="flex items-center gap-2">
                <div className="relative log-options-dropdown">
                  <button
                    className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1"
                    onClick={() => setShowLogOptions(!showLogOptions)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export Logs
                  </button>
                  
                  {showLogOptions && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                      <div className="p-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1">
                          Copy to Clipboard
                        </div>
                        <button
                          className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                          onClick={async () => {
                            const logs = await fetchAllLogs(params.id)
                            await navigator.clipboard.writeText(logs)
                            alert('All logs copied to clipboard!')
                            setShowLogOptions(false)
                          }}
                        >
                          All Logs (Database)
                        </button>
                        <button
                          className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                          onClick={async () => {
                            const logs = await fetchMultiPassLogs(params.id)
                            await navigator.clipboard.writeText(logs)
                            alert('Multi-pass logs copied to clipboard!')
                            setShowLogOptions(false)
                          }}
                        >
                          Multi-Pass Logs Only
                        </button>
                        
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1 mt-2">
                          Download as File
                        </div>
                        <button
                          className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                          onClick={async () => {
                            const logs = await fetchAllLogs(params.id)
                            downloadLogs(logs, `job-${params.id}-all-logs.txt`)
                            setShowLogOptions(false)
                          }}
                        >
                          All Logs (Database)
                        </button>
                        <button
                          className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                          onClick={async () => {
                            const logs = await fetchMultiPassLogs(params.id)
                            downloadLogs(logs, `job-${params.id}-multipass-logs.txt`)
                            setShowLogOptions(false)
                          }}
                        >
                          Multi-Pass Logs Only
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {showLogs && (
              <div className="p-4">
                <LogTerminal jobId={params.id} readonly />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}