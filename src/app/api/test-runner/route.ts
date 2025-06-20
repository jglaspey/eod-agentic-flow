/**
 * Test endpoint for simplified queue system
 * Triggers processing and shows queue status
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Test endpoint called (simplified approach)');
    
    // Import available queue functions
    const { getQueueStatus } = await import('@/lib/queue');
    const { getSupabaseClient } = await import('@/lib/supabase');
    
    // Get current queue status
    const queueStatus = await getQueueStatus('anonymous');
    console.log('📊 Current queue status:', queueStatus);
    
    // Check jobs in database
    const supabase = getSupabaseClient();
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, status, created_at, queue_position')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('❌ Error fetching jobs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log('📋 Jobs in queue/processing:', jobs);
    
    // Fire-and-forget trigger (like job creation does)
    console.log('🚀 Triggering queue processing (fire-and-forget)...');
    fetch('/api/jobs/process', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Processing trigger sent (simplified approach)',
      queueStatus,
      jobs: jobs || [],
      approach: 'simplified-fire-and-forget'
    });
    
  } catch (error) {
    console.error('💥 Test endpoint error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Same as GET for easy testing
  return GET();
}