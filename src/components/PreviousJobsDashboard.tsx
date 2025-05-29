'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface JobDisplayData {
  id: string
  property_address: string | null
  insurance_carrier: string | null
  status: string
  created_at: string
}

interface PreviousJobsDashboardProps {
  newJob?: {
    id: string
    status: 'processing'
    created_at: string
  } | null
}

export function PreviousJobsDashboard({ newJob }: PreviousJobsDashboardProps) {
  const [jobs, setJobs] = useState<JobDisplayData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const supabase = getSupabaseClient()
      
      const { data: jobsData, error: fetchError } = await supabase
        .from('jobs')
        .select(`
          id,
          status,
          created_at,
          job_data (
            property_address,
            insurance_carrier
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      if (fetchError) {
        console.error('Error fetching jobs for dashboard:', fetchError)
        setError('Error loading previous jobs. Please try refreshing.')
        return
      }

      if (!jobsData) {
        setJobs([])
        return
      }

      // Flatten the data for easier display
      const displayData: JobDisplayData[] = jobsData.map((job: any) => ({
        id: job.id,
        property_address: job.job_data && job.job_data.length > 0 ? job.job_data[0].property_address : null,
        insurance_carrier: job.job_data && job.job_data.length > 0 ? job.job_data[0].insurance_carrier : null,
        status: job.status,
        created_at: new Date(job.created_at).toLocaleString(),
      }))

      setJobs(displayData)
      setError(null)
    } catch (err) {
      console.error('Error in fetchJobs:', err)
      setError('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll for status updates on processing jobs
  useEffect(() => {
    const pollProcessingJobs = async () => {
      const processingJobs = jobs.filter(job => job.status === 'processing')
      
      if (processingJobs.length === 0) return

      try {
        const supabase = getSupabaseClient()
        
        for (const job of processingJobs) {
          const { data: statusData, error: statusError } = await supabase
            .from('jobs')
            .select(`
              status,
              job_data (
                property_address,
                insurance_carrier
              )
            `)
            .eq('id', job.id)
            .single()

          if (!statusError && statusData && statusData.status !== 'processing') {
            // Job completed, update the job in our list
            setJobs(prevJobs => 
              prevJobs.map(prevJob => 
                prevJob.id === job.id 
                  ? {
                      ...prevJob,
                      status: statusData.status,
                      property_address: statusData.job_data && statusData.job_data.length > 0 
                        ? statusData.job_data[0].property_address 
                        : prevJob.property_address,
                      insurance_carrier: statusData.job_data && statusData.job_data.length > 0 
                        ? statusData.job_data[0].insurance_carrier 
                        : prevJob.insurance_carrier,
                    }
                  : prevJob
              )
            )
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err)
      }
    }

    const interval = setInterval(pollProcessingJobs, 3000) // Poll every 3 seconds
    return () => clearInterval(interval)
  }, [jobs])

  // Add new job to the list when it's created
  useEffect(() => {
    if (newJob) {
      const newJobDisplay: JobDisplayData = {
        id: newJob.id,
        property_address: null, // Will be filled when processing completes
        insurance_carrier: null, // Will be filled when processing completes
        status: newJob.status,
        created_at: new Date(newJob.created_at).toLocaleString(),
      }

      setJobs(prevJobs => {
        // Check if job already exists to avoid duplicates
        if (prevJobs.some(job => job.id === newJob.id)) {
          return prevJobs
        }
        return [newJobDisplay, ...prevJobs]
      })
    }
  }, [newJob])

  // Initial load
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const getStatusVariant = (status: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case 'completed':
        return 'default' // Greenish in default shadcn
      case 'failed':
      case 'failed_partial':
        return 'destructive' // Reddish
      case 'processing':
        return 'secondary' // Bluish/Grayish
      default:
        return 'outline'
    }
  }

  if (loading) {
    return <p className="text-center mt-8 text-gray-500">Loading previous jobs...</p>
  }

  if (error) {
    return <p className="text-red-500 mt-8">{error}</p>
  }

  if (jobs.length === 0) {
    return <p className="text-gray-500 mt-8">No previous jobs found.</p>
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-semibold mb-6 text-gray-700">Previous Analyses</h2>
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[350px]">Property Address</TableHead>
              <TableHead>Insurance Carrier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {job.status === 'processing' ? (
                    <span className="text-gray-500 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      {job.property_address || 'Processing...'}
                    </span>
                  ) : (
                    <Link href={`/results/${job.id}`} className="hover:underline text-blue-600">
                      {job.property_address || 'Not Available'}
                    </Link>
                  )}
                </TableCell>
                <TableCell>{job.insurance_carrier || (job.status === 'processing' ? 'Processing...' : 'Not Available')}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(job.status)} className="capitalize">
                    {job.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-gray-500">{job.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
} 