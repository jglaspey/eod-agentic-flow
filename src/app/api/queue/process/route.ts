/**
 * Queue Processing Endpoint
 * Processes a single job from the queue to avoid timeout issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimNextJob, processJob, markJobCompleted, markJobFailed, getQueueStatus } from '@/lib/queue';
import { triggerInternalApi } from '@/lib/url-utils';

export const maxDuration = 60; // Maximum function duration

export async function POST(request: NextRequest) {
  console.log('⚡ Queue process endpoint triggered');
  console.log('🔍 Request headers:', {
    host: request.headers.get('host'),
    'x-queue-trigger': request.headers.get('x-queue-trigger'),
    'user-agent': request.headers.get('user-agent')
  });
  
  try {
    // Verify internal trigger (basic security)
    const triggerHeader = request.headers.get('x-queue-trigger');
    if (triggerHeader !== 'internal' && process.env.NODE_ENV === 'production') {
      console.log('❌ Unauthorized queue trigger attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔒 Authorization verified, proceeding with job processing');

    // Process ONE job (not a loop, to avoid timeouts)
    console.log('📋 Attempting to claim next job...');
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
        
        // Trigger next job processing using dynamic URL detection
        await triggerInternalApi('/api/queue/process', request);
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
        await triggerInternalApi('/api/queue/process', request);
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