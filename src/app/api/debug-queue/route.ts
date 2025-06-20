/**
 * Debug endpoint to inspect queue state
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();
    
    // Get all jobs with their status
    const { data: allJobs, error: allError } = await supabase
      .from('jobs')
      .select('id, status, created_at, queue_position, file_urls, user_id, processing_started_at')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }
    
    // Check if claim_next_job function exists
    const { data: claimResult, error: claimError } = await supabase.rpc('claim_next_job');
    
    return NextResponse.json({
      allJobs,
      claimResult: claimError ? { error: claimError.message } : claimResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}