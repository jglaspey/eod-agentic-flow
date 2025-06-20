/**
 * Queue Processing Endpoint
 * Processes a single job from the queue to avoid timeout issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimNextJob, processJob, markJobCompleted, markJobFailed, getQueueStatus } from '@/lib/queue';

export const maxDuration = 60; // Maximum function duration

export async function POST(request: NextRequest) {
  console.log('⚡ Queue process endpoint triggered');
  
  try {
    // Verify internal trigger (basic security)
    const triggerHeader = request.headers.get('x-queue-trigger');
    if (triggerHeader !== 'internal' && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Process ONE job (not a loop, to avoid timeouts)
    const job = await claimNextJob();
    
    if (!job) {
      console.log('📭 No jobs to process');
      return NextResponse.json({ 
        success: true, 
        message: 'No jobs in queue',
        processed: 0 
      });
    }

    console.log(`⚙️ Processing job ${job.jobId}`);
    
    try {
      // Process the job
      await processJob(job.jobId, job.fileUrls);
      await markJobCompleted(job.jobId);
      
      console.log(`✅ Job ${job.jobId} completed successfully`);
      
      // Check if more jobs need processing
      const queueStatus = await getQueueStatus();
      
      // If more jobs exist, trigger another processing round
      if (queueStatus.queuedJobs > 0) {
        console.log(`📋 ${queueStatus.queuedJobs} more jobs in queue, triggering next...`);
        
        // Trigger next job processing (fire and forget)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://eod-agentic-flow-queue-mode.vercel.app'}/api/queue/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-queue-trigger': 'internal'
          }
        }).catch(err => {
          console.error('Failed to trigger next job:', err);
        });
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'Job processed successfully',
        jobId: job.jobId,
        processed: 1,
        remaining: queueStatus.queuedJobs
      });
      
    } catch (error) {
      console.error(`❌ Job ${job.jobId} failed:`, error);
      await markJobFailed(job.jobId, error instanceof Error ? error.message : 'Processing failed');
      
      // Even on failure, try to process next job
      const queueStatus = await getQueueStatus();
      if (queueStatus.queuedJobs > 0) {
        console.log('📋 Triggering next job despite failure...');
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://eod-agentic-flow-queue-mode.vercel.app'}/api/queue/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-queue-trigger': 'internal'
          }
        }).catch(() => {});
      }
      
      return NextResponse.json({ 
        success: false, 
        message: 'Job processing failed',
        jobId: job.jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
  } catch (error) {
    console.error('💥 Queue processor error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { 
      status: 500 
    });
  }
}

// GET endpoint for manual triggering
export async function GET() {
  console.log('🔍 Queue status check');
  
  try {
    const status = await getQueueStatus();
    
    return NextResponse.json({
      success: true,
      queueStatus: status,
      message: 'Use POST to process queue'
    });
    
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { 
      status: 500 
    });
  }
}