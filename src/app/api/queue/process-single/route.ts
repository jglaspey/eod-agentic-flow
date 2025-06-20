/**
 * Single Job Processor - Immediate Processing Endpoint
 * 
 * This endpoint processes a single job immediately.
 * Used as an alternative to cron jobs for reliable processing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimNextJob, processJob, markJobCompleted, markJobFailed } from '@/lib/queue';

export const maxDuration = 300; // 5 minutes for processing

export async function POST(request: NextRequest) {
  console.log('🚀 Single job processor started');
  
  try {
    // Claim and process exactly one job
    const job = await claimNextJob();
    if (!job) {
      console.log('📭 No jobs available to process');
      return NextResponse.json({
        success: true,
        message: 'No jobs in queue to process'
      });
    }

    console.log(`⚙️ Processing job ${job.jobId}...`);
    console.log(`📁 File URLs:`, job.fileUrls);
    
    try {
      await processJob(job.jobId, job.fileUrls);
      await markJobCompleted(job.jobId);
      console.log(`✅ Job ${job.jobId} completed successfully`);
      
      return NextResponse.json({
        success: true,
        message: `Job ${job.jobId} completed successfully`,
        jobId: job.jobId
      });
      
    } catch (error) {
      console.error(`❌ Job ${job.jobId} failed:`, error);
      await markJobFailed(job.jobId, error instanceof Error ? error.message : 'Processing failed');
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
        jobId: job.jobId
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('💥 Single job processor error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processor error'
    }, { status: 500 });
  }
}

// Also handle GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}