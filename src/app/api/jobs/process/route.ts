/**
 * Job Processing Endpoint (Layer 1 Pattern)
 * 
 * Simple, reliable job processor that:
 * 1. Atomically claims next available job
 * 2. Processes within 60s timeout constraint
 * 3. Updates job status (completed/failed)
 * 
 * No complex error recovery, no cron dependencies, no HTTP chaining.
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimNextJob, processJob, markJobCompleted, markJobFailed } from '@/lib/queue';

export const maxDuration = 60; // Accept the 60s constraint

export async function POST(request: NextRequest) {
  console.log('🔄 Job processor started');
  
  try {
    // 1. Atomically claim next job (uses FOR UPDATE SKIP LOCKED)
    const job = await claimNextJob();
    if (!job) {
      console.log('📭 No jobs available to process');
      return NextResponse.json({
        success: true,
        message: 'No jobs in queue'
      });
    }

    console.log(`⚙️ Processing job ${job.jobId}`);
    
    // 2. Process job within 60s constraint
    try {
      await processJob(job.jobId, job.fileUrls);
      await markJobCompleted(job.jobId);
      console.log(`✅ Job ${job.jobId} completed successfully`);
      
      return NextResponse.json({
        success: true,
        message: `Job ${job.jobId} completed`,
        jobId: job.jobId
      });
      
    } catch (error) {
      console.error(`❌ Job ${job.jobId} failed:`, error);
      await markJobFailed(job.jobId, error instanceof Error ? error.message : 'Processing failed');
      
      return NextResponse.json({
        success: false,
        message: `Job ${job.jobId} failed`,
        error: error instanceof Error ? error.message : 'Processing failed',
        jobId: job.jobId
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('💥 Job processor error:', error);
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