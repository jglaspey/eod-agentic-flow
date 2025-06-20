/**
 * V2 Queue System Core Implementation
 * Handles async job queuing, processing, and safety mechanisms
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from './supabase';
import { uploadJobFiles, downloadJobFile, cleanupJobFiles } from './storage';
import { logStreamer } from './log-streamer';
// Removed triggerInternalApi import - using simplified approach

// For local development without storage, set this to true
const USE_LOCAL_STORAGE_BYPASS = process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('supabase.co');

export interface QueuedJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  file_urls: {
    estimate?: string;
    roofReport?: string;
  };
  user_id: string;
  queue_position?: number;
  processing_started_at?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

export interface EnqueueJobOptions {
  estimateFile: File;
  roofReportFile?: File | null;
  userId?: string;
  maxRetries?: number;
}

export interface EnqueueJobResult {
  success: boolean;
  jobId?: string;
  queuePosition?: number;
  error?: string;
}

/**
 * Add a new job to the queue with file upload
 */
export async function enqueueJob(options: EnqueueJobOptions): Promise<EnqueueJobResult> {
  const jobId = uuidv4();
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseClient();
    
    // Rate limiting check - max 10 queued/processing jobs per user
    const { data: userJobs, error: countError } = await supabase
      .from('jobs')
      .select('id', { count: 'exact' })
      .eq('user_id', options.userId || 'anonymous')
      .in('status', ['queued', 'processing']);

    if (countError) {
      console.error('Error checking user job count:', countError);
      return {
        success: false,
        error: `Rate limit check failed: ${countError.message}`
      };
    }

    if ((userJobs?.length ?? 0) >= 10) {
      return {
        success: false,
        error: 'Too many jobs queued. Please wait for existing jobs to complete. (Limit: 10 jobs)'
      };
    }

    // Upload files to storage first (this is the time-consuming part)
    logStreamer.logStep(jobId, 'file-upload-start', 'Uploading files to storage');
    
    const uploadResult = await uploadJobFiles(
      jobId, 
      options.estimateFile, 
      options.roofReportFile
    );

    if (!uploadResult.success) {
      logStreamer.logError(jobId, 'file-upload-failed', uploadResult.error || 'Unknown upload error');
      return {
        success: false,
        error: uploadResult.error || 'File upload failed'
      };
    }

    const uploadTime = Date.now() - startTime;
    logStreamer.logStep(jobId, 'file-upload-complete', `Files uploaded in ${uploadTime}ms`);

    // Create job record in database
    const { error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        status: 'queued',
        file_urls: uploadResult.fileUrls,
        user_id: options.userId || 'anonymous',
        retry_count: 0,
        max_retries: options.maxRetries || 2,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error creating job record:', insertError);
      // Cleanup uploaded files on failure
      await cleanupJobFiles(jobId);
      return {
        success: false,
        error: `Failed to create job: ${insertError.message}`
      };
    }

    // Update queue positions
    await updateQueuePositions();

    // Get the queue position for this job
    const { data: jobData, error: fetchError } = await supabase
      .from('jobs')
      .select('queue_position')
      .eq('id', jobId)
      .single();

    const queuePosition = jobData?.queue_position;

    logStreamer.logStep(jobId, 'job-queued', `Job queued successfully at position ${queuePosition}`);

    // Note: Queue processing is triggered from the API route with request context

    const totalTime = Date.now() - startTime;
    console.log(`Job ${jobId} enqueued successfully in ${totalTime}ms (upload: ${uploadTime}ms)`);

    return {
      success: true,
      jobId,
      queuePosition
    };

  } catch (error) {
    console.error('Unexpected error enqueuing job:', error);
    // Cleanup uploaded files on failure
    await cleanupJobFiles(jobId);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update queue positions for all queued jobs
 */
export async function updateQueuePositions(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.rpc('update_queue_positions');
  } catch (error) {
    console.error('Error updating queue positions:', error);
  }
}

// Removed startRunnerIfNeeded() - using simplified fire-and-forget approach

// Removed startRunner() - using simplified single job processing

/**
 * Claim the next job in the queue atomically
 */
export async function claimNextJob(): Promise<{jobId: string, fileUrls: any} | null> {
  try {
    const supabase = getSupabaseClient();
    
    console.log('🔍 Calling claim_next_job database function...');
    const { data, error } = await supabase.rpc('claim_next_job');
    
    if (error) {
      console.error('❌ Error claiming next job:', error);
      return null;
    }

    console.log('📊 claim_next_job response:', { data, dataLength: data?.length });

    if (!data || data.length === 0) {
      console.log('📭 No jobs claimed - queue might be empty or job already claimed');
      return null; // No jobs available
    }

    const result = data[0];
    console.log('✅ Job claimed successfully:', { 
      jobId: result.job_id, 
      hasFileUrls: !!result.file_urls_data 
    });
    
    return {
      jobId: result.job_id,
      fileUrls: result.file_urls_data
    };

  } catch (error) {
    console.error('Unexpected error claiming next job:', error);
    return null;
  }
}

/**
 * Process a single job using the existing processing pipeline
 */
export async function processJob(jobId: string, fileUrls: any): Promise<void> {
  try {
    console.log(`📁 Processing job ${jobId} with file URLs:`, fileUrls);
    
    // Download files from storage
    console.log(`⬇️ Downloading estimate file from: ${fileUrls.estimate}`);
    const estimateFile = fileUrls.estimate ? 
      await downloadJobFile(fileUrls.estimate, 'estimate.pdf') : null;
    
    console.log(`⬇️ Downloading roof report file from: ${fileUrls.roofReport || 'none'}`);
    const roofReportFile = fileUrls.roofReport ? 
      await downloadJobFile(fileUrls.roofReport, 'roof-report.pdf') : null;

    if (!estimateFile) {
      console.error(`❌ Failed to download estimate file for job ${jobId}`);
      throw new Error('Failed to download estimate file from storage');
    }
    
    console.log(`✅ Files downloaded successfully for job ${jobId}`);

    // Import the extracted processing function
    console.log(`🔄 Starting processing pipeline for job ${jobId}`);
    const { processFilesWithNewAgent } = await import('./job-processor');
    
    // Process using existing pipeline
    await processFilesWithNewAgent(jobId, estimateFile, roofReportFile, Date.now());
    
    console.log(`✅ Processing completed for job ${jobId}`);

  } catch (error) {
    console.error(`❌ Processing failed for job ${jobId}:`, error);
    // Log error but re-throw to be handled by runner
    logStreamer.logError(jobId, 'job-processing-error', 
      error instanceof Error ? error.message : 'Unknown processing error');
    throw error;
  }
}

/**
 * Mark a job as completed and cleanup files
 */
export async function markJobCompleted(jobId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('jobs')
      .update({ 
        status: 'completed'
      })
      .eq('id', jobId);

    if (error) {
      console.error(`Failed to mark job ${jobId} as completed:`, error);
    }

    // Cleanup files after successful processing
    await cleanupJobFiles(jobId);
    
    logStreamer.logStep(jobId, 'job-marked-completed', 'Job marked as completed and files cleaned up');

  } catch (error) {
    console.error(`Error marking job ${jobId} as completed:`, error);
  }
}

/**
 * Mark a job as failed with error message
 */
export async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('jobs')
      .update({ 
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', jobId);

    if (error) {
      console.error(`Failed to mark job ${jobId} as failed:`, error);
    }

    logStreamer.logError(jobId, 'job-marked-failed', `Job marked as failed: ${errorMessage}`);

  } catch (error) {
    console.error(`Error marking job ${jobId} as failed:`, error);
  }
}

/**
 * Get queue status for a user
 */
export async function getQueueStatus(userId: string = 'anonymous'): Promise<{
  queuedJobs: number;
  processingJobs: number;
  userPosition?: number;
}> {
  try {
    const supabase = getSupabaseClient();
    
    // Get total counts
    const [queuedResult, processingResult, userJobsResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id', { count: 'exact' })
        .eq('status', 'queued'),
      
      supabase
        .from('jobs')
        .select('id', { count: 'exact' })
        .eq('status', 'processing'),
      
      supabase
        .from('jobs')
        .select('queue_position')
        .eq('user_id', userId)
        .eq('status', 'queued')
        .order('queue_position', { ascending: true })
        .limit(1)
    ]);

    const queuedJobs = queuedResult.count || 0;
    const processingJobs = processingResult.count || 0;
    const userPosition = userJobsResult.data?.[0]?.queue_position;

    return {
      queuedJobs,
      processingJobs,
      userPosition
    };

  } catch (error) {
    console.error('Error getting queue status:', error);
    return {
      queuedJobs: 0,
      processingJobs: 0
    };
  }
}

// Removed cleanupStuckJobs() - trusting simple approach without complex cleanup