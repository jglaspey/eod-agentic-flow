/**
 * Queue Cron Job - Backup Queue Processor
 * 
 * This endpoint runs every minute as a fallback to ensure jobs don't get stuck.
 * It's the backup system for Option 2 when the primary HTTP triggering fails.
 * 
 * Features:
 * - Processes stuck jobs that haven't been picked up
 * - Cleans up ancient processing jobs
 * - Provides queue health monitoring
 * - Logs queue statistics for debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { cleanupStuckJobs, getQueueStatus } from '@/lib/queue';
import { triggerInternalApi } from '@/lib/url-utils';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  console.log('⏰ Queue cron job started');
  
  // Verify this is actually a cron job call (Vercel adds this header)
  const cronSecret = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && !cronSecret?.includes('Bearer')) {
    console.log('⚠️ Cron job called without proper authorization header');
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // 1. Get queue status
    const status = await getQueueStatus();
    console.log(`📊 Queue status: ${status.queuedJobs} queued, ${status.processingJobs} processing`);
    
    // 2. Clean up stuck jobs (processing > 5 minutes)
    const cleanedCount = await cleanupStuckJobs();
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} stuck jobs`);
    }
    
    // 3. Check for jobs that should be processing but aren't
    const { data: queuedJobs, error } = await supabase
      .from('jobs')
      .select('id, created_at, queue_position')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(5); // Only check first 5 jobs
    
    if (error) {
      console.error('❌ Error checking queued jobs:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 });
    }
    
    // 4. If there are queued jobs and no recent processing jobs, trigger processing
    if (queuedJobs && queuedJobs.length > 0 && status.processingJobs === 0) {
      console.log(`🚀 Found ${queuedJobs.length} queued jobs with no processing jobs. Triggering processor...`);
      
      // Check if the oldest job is more than 2 minutes old (stuck)
      const oldestJob = queuedJobs[0];
      const jobAge = Date.now() - new Date(oldestJob.created_at).getTime();
      const maxWaitTime = 2 * 60 * 1000; // 2 minutes
      
      if (jobAge > maxWaitTime) {
        console.log(`⚠️ Oldest job is ${Math.round(jobAge / 1000)}s old, triggering backup processing`);
        await triggerInternalApi('/api/queue/process', request);
      } else {
        console.log(`⏳ Oldest job is only ${Math.round(jobAge / 1000)}s old, waiting for primary processing`);
      }
    }
    
    // 5. Log queue health statistics
    const healthData = {
      timestamp: new Date().toISOString(),
      queuedJobs: status.queuedJobs,
      processingJobs: status.processingJobs,
      cleanedJobs: cleanedCount,
      oldestQueuedJob: queuedJobs?.[0]?.created_at
    };
    
    console.log('📈 Queue health:', healthData);
    
    return NextResponse.json({
      success: true,
      message: 'Queue cron job completed',
      health: healthData,
      actionsTaken: {
        cleanedStuckJobs: cleanedCount,
        triggeredProcessing: queuedJobs && queuedJobs.length > 0 && status.processingJobs === 0
      }
    });
    
  } catch (error) {
    console.error('💥 Queue cron job error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown cron error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Also handle POST requests (for manual triggering)
export async function POST(request: NextRequest) {
  return GET(request);
}