/**
 * Test endpoint to manually start the queue runner
 * This bypasses auth for debugging
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Test runner endpoint called');
    
    // Import queue functions
    const { startRunnerIfNeeded, getQueueStatus, cleanupStuckJobs } = await import('@/lib/queue');
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
    
    // Try to cleanup stuck jobs first
    console.log('🧹 Cleaning up stuck jobs...');
    const cleanedCount = await cleanupStuckJobs();
    console.log(`🧹 Cleaned ${cleanedCount} stuck jobs`);
    
    // Start the runner
    console.log('🚀 Starting queue runner...');
    await startRunnerIfNeeded();
    
    return NextResponse.json({
      success: true,
      message: 'Queue runner started',
      queueStatus,
      jobs,
      cleanedCount
    });
    
  } catch (error) {
    console.error('💥 Test runner error:', error);
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