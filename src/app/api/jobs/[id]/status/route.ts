import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient()
    
    const { data: job, error } = await supabase
      .from('jobs')
      .select('status, error_message')
      .eq('id', params.id)
      .single()
    
    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      status: job.status,
      error: job.error_message
    })
  } catch (error) {
    console.error('Error fetching job status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 