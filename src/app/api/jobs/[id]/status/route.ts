/**
 * Job Status Endpoint
 * 
 * Simple endpoint to check job status for frontend polling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    const supabase = getSupabaseClient();
    
    // Get job status and basic info
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, status, created_at, error_message')
      .eq('id', jobId)
      .single();
    
    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    // If completed, get results
    let results = null;
    if (job.status === 'completed') {
      const { data: supplements } = await supabase
        .from('supplement_items')
        .select('*')
        .eq('job_id', jobId);
      
      const { data: jobData } = await supabase
        .from('job_data')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      results = {
        supplements: supplements || [],
        jobData: jobData
      };
    }
    
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
      error: job.error_message,
      results
    });
    
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}