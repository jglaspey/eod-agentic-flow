/**
 * Manual Queue Trigger Endpoint
 * Called by frontend polling to process queued jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueueStatus, claimNextJob, processJob, markJobCompleted, markJobFailed } from '@/lib/queue';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log('🔄 Queue trigger called by frontend polling');
  
  try {
    const status = await getQueueStatus();
    
    if (status.queuedJobs === 0) {
      return NextResponse.json({
        success: true,
        message: 'No jobs to process',
        queueStatus: status
      });
    }
    
    // Process one job directly
    const job = await claimNextJob();
    if (!job) {
      return NextResponse.json({
        success: true,
        message: 'No jobs available (all may be processing)',
        queueStatus: status
      });
    }
    
    console.log(`⚙️ Processing job ${job.jobId} via frontend trigger`);
    
    try {
      await processJob(job.jobId, job.fileUrls);
      await markJobCompleted(job.jobId);
      console.log(`✅ Job ${job.jobId} completed via frontend trigger`);
      
      return NextResponse.json({
        success: true,
        message: `Job ${job.jobId} processed successfully`,
        jobId: job.jobId,
        remainingJobs: status.queuedJobs - 1
      });
      
    } catch (error) {
      console.error(`❌ Job ${job.jobId} failed:`, error);
      await markJobFailed(job.jobId, error instanceof Error ? error.message : 'Processing failed');
      
      return NextResponse.json({
        success: false,
        message: `Job ${job.jobId} failed`,
        error: error instanceof Error ? error.message : 'Processing failed'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('💥 Queue trigger error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const status = await getQueueStatus();
  
  return NextResponse.json({
    message: 'Use POST to trigger queue processing',
    queueStatus: status
  });
}