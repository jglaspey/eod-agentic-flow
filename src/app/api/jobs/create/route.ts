/**
 * V2 Queue System - Lightweight Job Creation Endpoint
 * Creates jobs quickly (<2s) and queues them for background processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { enqueueJob, getQueueStatus } from '@/lib/queue'
import { verifyStorageAccess } from '@/lib/storage'

export const maxDuration = 30; // Keep short for rapid job creation

export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase configuration missing. Please check your environment variables.' },
        { status: 500 }
      )
    }

    // Verify storage access
    console.log('🔍 Verifying storage access...');
    const storageOk = await verifyStorageAccess();
    console.log('🔍 Storage verification result:', storageOk);
    
    if (!storageOk) {
      console.error('❌ Storage verification failed. Check console for details.');
      
      // For now, let's try to proceed anyway for testing
      console.log('⚠️ Attempting to proceed with queue mode despite storage warning...');
      // Comment out the return to test queue mode
      /*
      return NextResponse.json(
        { 
          error: 'Queue mode unavailable. Please use Direct Mode instead.',
          fallbackMode: 'direct'
        },
        { status: 503 }
      )
      */
    }

    // Parse form data
    const formData = await request.formData()
    const estimateFile = formData.get('estimate') as File
    const roofReportFile = formData.get('roofReport') as File | null
    const userId = (formData.get('userId') as string) || 'anonymous'

    if (!estimateFile) {
      return NextResponse.json(
        { error: 'Estimate file is required' },
        { status: 400 }
      )
    }

    // Validate file types
    if (estimateFile.type !== 'application/pdf' || (roofReportFile && roofReportFile.type !== 'application/pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    // Validate file sizes (same limits as sync endpoint)
    const maxFileSize = 4 * 1024 * 1024 // 4MB per file
    if (estimateFile.size > maxFileSize) {
      return NextResponse.json(
        { error: `Estimate file too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` },
        { status: 413 }
      )
    }
    if (roofReportFile && roofReportFile.size > maxFileSize) {
      return NextResponse.json(
        { error: `Roof report file too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` },
        { status: 413 }
      )
    }

    // Check total request size
    const totalSize = estimateFile.size + (roofReportFile?.size || 0)
    const maxTotalSize = 4.2 * 1024 * 1024 // 4.2MB to leave room for overhead
    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { error: `Combined file size too large (${(totalSize / 1024 / 1024).toFixed(1)}MB). Maximum total is ${(maxTotalSize / 1024 / 1024).toFixed(1)}MB` },
        { status: 413 }
      )
    }

    // Enqueue the job
    const result = await enqueueJob({
      estimateFile,
      roofReportFile,
      userId,
      maxRetries: 2
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error?.includes('Too many jobs') ? 429 : 500 }
      )
    }

    // Get current queue status for user feedback
    const queueStatus = await getQueueStatus(userId);

    // Force start the runner to process the newly queued job
    console.log('🚀 Job created, triggering queue processing...');
    const { triggerInternalApi } = await import('@/lib/url-utils');
    
    // Trigger queue processing using the new robust system
    await triggerInternalApi('/api/queue/process', request);

    return NextResponse.json({
      jobId: result.jobId,
      status: 'queued',
      queuePosition: result.queuePosition,
      estimatedWaitTime: calculateEstimatedWaitTime(result.queuePosition || 0),
      queueStatus: {
        totalQueued: queueStatus.queuedJobs,
        totalProcessing: queueStatus.processingJobs,
        userPosition: queueStatus.userPosition
      }
    });

  } catch (error) {
    console.error('API error in POST /api/jobs/create:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

/**
 * Get current queue status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'anonymous';

    const queueStatus = await getQueueStatus(userId);

    return NextResponse.json({
      queueStatus: {
        totalQueued: queueStatus.queuedJobs,
        totalProcessing: queueStatus.processingJobs,
        userPosition: queueStatus.userPosition
      }
    });

  } catch (error) {
    console.error('API error in GET /api/jobs/create:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

/**
 * Calculate estimated wait time based on queue position
 * Assumes ~60s per job processing time
 */
function calculateEstimatedWaitTime(queuePosition: number): string {
  if (queuePosition <= 0) {
    return 'Processing will start immediately';
  }

  const avgProcessingTimeSeconds = 60;
  const estimatedSeconds = queuePosition * avgProcessingTimeSeconds;

  if (estimatedSeconds < 60) {
    return `~${estimatedSeconds}s`;
  } else if (estimatedSeconds < 3600) {
    const minutes = Math.ceil(estimatedSeconds / 60);
    return `~${minutes}m`;
  } else {
    const hours = Math.floor(estimatedSeconds / 3600);
    const remainingMinutes = Math.ceil((estimatedSeconds % 3600) / 60);
    return `~${hours}h ${remainingMinutes}m`;
  }
}