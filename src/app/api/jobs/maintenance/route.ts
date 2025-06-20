/**
 * V2 Queue System - Simplified Health Endpoint
 * Provides queue health monitoring (maintenance operations removed in simplified approach)
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60;

/**
 * POST /api/jobs/maintenance
 * Trigger simple queue processing (no complex maintenance in simplified approach)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const operation = body.operation;

    switch (operation) {
      case 'trigger-processing':
        // Simple fire-and-forget trigger like job creation does
        const processingUrl = new URL('/api/jobs/process', request.url).toString();
        fetch(processingUrl, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return NextResponse.json({
          success: true,
          message: 'Processing trigger sent (fire-and-forget)'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid operation. Supported: trigger-processing' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Maintenance operation failed:', error);
    return NextResponse.json(
      { error: `Maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/maintenance
 * Get queue health status
 */
export async function GET() {
  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    // Get counts by status
    const [queuedResult, processingResult, completedResult, failedResult] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact' }).eq('status', 'queued'),
      supabase.from('jobs').select('id', { count: 'exact' }).eq('status', 'processing'),
      supabase.from('jobs').select('id', { count: 'exact' }).eq('status', 'completed'),
      supabase.from('jobs').select('id', { count: 'exact' }).eq('status', 'failed')
    ]);

    // Get oldest processing job to check for stuck jobs
    const { data: oldestProcessing } = await supabase
      .from('jobs')
      .select('id, processing_started_at')
      .eq('status', 'processing')
      .order('processing_started_at', { ascending: true })
      .limit(1);

    const now = new Date();
    const stuckJobThreshold = new Date(now.getTime() - 65 * 60 * 1000); // 65 minutes ago
    
    const potentialStuckJobs = oldestProcessing?.[0]?.processing_started_at ? 
      new Date(oldestProcessing[0].processing_started_at) < stuckJobThreshold : false;

    return NextResponse.json({
      queueHealth: {
        queued: queuedResult.count || 0,
        processing: processingResult.count || 0,
        completed: completedResult.count || 0,
        failed: failedResult.count || 0,
        potentialStuckJobs,
        oldestProcessingJob: oldestProcessing?.[0] || null
      },
      recommendations: generateHealthRecommendations({
        queued: queuedResult.count || 0,
        processing: processingResult.count || 0,
        potentialStuckJobs
      })
    });

  } catch (error) {
    console.error('Failed to get queue health status:', error);
    return NextResponse.json(
      { error: `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

function generateHealthRecommendations(status: {
  queued: number;
  processing: number;
  potentialStuckJobs: boolean;
}): string[] {
  const recommendations: string[] = [];

  if (status.potentialStuckJobs) {
    recommendations.push('Stuck jobs detected. In simplified approach, manually mark as failed if needed.');
  }

  if (status.queued > 10) {
    recommendations.push('High queue backlog. Consider increasing processing capacity.');
  }

  if (status.processing > 2) {
    recommendations.push('Multiple jobs processing simultaneously. Monitor for resource contention.');
  }

  if (status.processing === 0 && status.queued > 0) {
    recommendations.push('Queue has jobs but none processing. Use trigger-processing operation.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Queue health looks good.');
  }

  return recommendations;
}