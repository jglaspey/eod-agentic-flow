/**
 * Manual Queue Trigger Endpoint
 * For manually starting queue processing when jobs are stuck
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueueStatus } from '@/lib/queue';
import { triggerInternalApi } from '@/lib/url-utils';

export async function GET(request: NextRequest) {
  try {
    const status = await getQueueStatus();
    
    if (status.queuedJobs === 0 && status.processingJobs === 0) {
      return NextResponse.json({
        success: true,
        message: 'No jobs to process',
        queueStatus: status
      });
    }
    
    // Trigger queue processing using dynamic URL detection
    await triggerInternalApi('/api/queue/process', request);
    
    return NextResponse.json({
      success: true,
      message: 'Queue processing triggered via dynamic URL detection',
      queueStatus: status
    });
    
  } catch (error) {
    console.error('Error triggering queue:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger queue'
    }, { status: 500 });
  }
}