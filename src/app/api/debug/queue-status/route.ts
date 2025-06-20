/**
 * Debug Queue Status Endpoint
 * Provides detailed queue information for troubleshooting
 */

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getQueueStatus } from '@/lib/queue';
import { getEnvironmentInfo } from '@/lib/url-utils';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    // 1. Get overall queue status
    const queueStatus = await getQueueStatus();
    
    // 2. Get detailed job information
    const { data: allJobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }
    
    // 3. Get recent job logs for processing jobs
    const processingJobs = allJobs?.filter(job => job.status === 'processing') || [];
    let recentLogs = null;
    
    if (processingJobs.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from('job_logs')
        .select('*')
        .in('job_id', processingJobs.map(job => job.id))
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (!logsError) {
        recentLogs = logs;
      }
    }
    
    // 4. Check storage health
    let storageTest = null;
    try {
      const testResult = await supabase.storage
        .from('job-files')
        .list('', { limit: 1 });
      
      storageTest = {
        canList: !testResult.error,
        error: testResult.error?.message
      };
    } catch (error) {
      storageTest = {
        canList: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
    
    // 5. Environment information
    const envInfo = getEnvironmentInfo();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      queueStatus,
      environmentInfo: envInfo,
      recentJobs: allJobs?.slice(0, 5).map(job => ({
        id: job.id,
        status: job.status,
        created_at: job.created_at,
        queue_position: job.queue_position,
        processing_started_at: job.processing_started_at,
        file_urls: job.file_urls,
        error_message: job.error_message
      })),
      processingJobsCount: processingJobs.length,
      recentLogs: recentLogs?.slice(0, 10).map(log => ({
        job_id: log.job_id,
        level: log.level,
        step: log.step,
        message: log.message,
        created_at: log.created_at
      })),
      storageHealth: storageTest,
      diagnostics: {
        hasQueuedJobs: queueStatus.queuedJobs > 0,
        hasProcessingJobs: queueStatus.processingJobs > 0,
        oldestProcessingJob: processingJobs[0]?.created_at,
        shouldTriggerProcessing: queueStatus.queuedJobs > 0 && queueStatus.processingJobs === 0
      }
    });
    
  } catch (error) {
    console.error('Debug queue status error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}