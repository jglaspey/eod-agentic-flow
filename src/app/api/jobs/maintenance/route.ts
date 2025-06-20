/**
 * V2 Queue System - Maintenance Endpoint
 * Handles stuck job cleanup and queue health monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupStuckJobs, startRunnerIfNeeded } from '@/lib/queue'

export const maxDuration = 60; // Allow time for cleanup operations

/**
 * POST /api/jobs/maintenance
 * Manually trigger maintenance operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const operation = body.operation;

    switch (operation) {
      case 'cleanup-stuck':
        const cleanedCount = await cleanupStuckJobs();
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${cleanedCount} stuck jobs`,
          cleanedJobCount: cleanedCount
        });

      case 'restart-runner':
        await startRunnerIfNeeded();
        return NextResponse.json({
          success: true,
          message: 'Queue runner restart triggered'
        });

      case 'full-maintenance':
        const stuck = await cleanupStuckJobs();
        await startRunnerIfNeeded();
        return NextResponse.json({
          success: true,
          message: `Full maintenance complete. Cleaned ${stuck} stuck jobs and restarted runner.`,
          cleanedJobCount: stuck
        });

      default:
        return NextResponse.json(
          { error: 'Invalid operation. Supported: cleanup-stuck, restart-runner, full-maintenance' },
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
    recommendations.push('Stuck jobs detected. Run cleanup-stuck operation.');
  }

  if (status.queued > 10) {
    recommendations.push('High queue backlog. Consider increasing processing capacity.');
  }

  if (status.processing > 2) {
    recommendations.push('Multiple jobs processing simultaneously. Monitor for resource contention.');
  }

  if (status.processing === 0 && status.queued > 0) {
    recommendations.push('Queue has jobs but none processing. Run restart-runner operation.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Queue health looks good.');
  }

  return recommendations;
}