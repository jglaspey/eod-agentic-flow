/**
 * Manual Queue Trigger Endpoint
 * For manually starting queue processing when jobs are stuck
 */

import { NextResponse } from 'next/server';
import { getQueueStatus } from '@/lib/queue';

export async function GET() {
  try {
    const status = await getQueueStatus();
    
    if (status.queuedJobs === 0 && status.processingJobs === 0) {
      return NextResponse.json({
        success: true,
        message: 'No jobs to process',
        queueStatus: status
      });
    }
    
    // Trigger queue processing
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://eod-agentic-flow-queue-mode.vercel.app'}/api/queue/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-queue-trigger': 'internal'
      }
    });
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Queue processing triggered',
      queueStatus: status,
      processingResult: result
    });
    
  } catch (error) {
    console.error('Error triggering queue:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger queue'
    }, { status: 500 });
  }
}