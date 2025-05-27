'use server'

import { getSupabaseClient } from '@/lib/supabase'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table' // Assuming you have Shadcn UI table components
import Link from 'next/link'
import { Badge } from '@/components/ui/badge' // For status display

interface JobDisplayData {
  id: string
  property_address: string | null
  insurance_carrier: string | null
  status: string
  created_at: string
}

export async function PreviousJobsDashboard() {
  const supabase = getSupabaseClient()

  // Fetch jobs and their associated job_data for address and carrier
  // Ordered by creation date, newest first
  const { data: jobs, error } = await supabase
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
    .limit(20) // Let's limit to the latest 20 for now

  if (error) {
    console.error('Error fetching jobs for dashboard:', error)
    return <p className="text-red-500">Error loading previous jobs. Please try refreshing.</p>
  }

  if (!jobs || jobs.length === 0) {
    return <p className="text-gray-500 mt-4">No previous jobs found.</p>
  }

  // Flatten the data for easier display
  const displayData: JobDisplayData[] = jobs.map((job: any) => ({
    id: job.id,
    // job_data is an array because of the one-to-many possibility, but we expect one for job_data per job
    property_address: job.job_data && job.job_data.length > 0 ? job.job_data[0].property_address : 'N/A',
    insurance_carrier: job.job_data && job.job_data.length > 0 ? job.job_data[0].insurance_carrier : 'N/A',
    status: job.status,
    created_at: new Date(job.created_at).toLocaleString(),
  }))

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
            {displayData.map((job) => (
              <TableRow key={job.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <Link href={`/results/${job.id}`} className="hover:underline text-blue-600">
                    {job.property_address || 'Not Available'}
                  </Link>
                </TableCell>
                <TableCell>{job.insurance_carrier || 'Not Available'}</TableCell>
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