/**
 * V2 Queue System Core Implementation
 * Handles async job queuing, processing, and safety mechanisms
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from './supabase';
import { uploadJobFiles, downloadJobFile, cleanupJobFiles } from './storage';
import { logStreamer } from './log-streamer';

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

    // Start the runner if no jobs are currently processing
    startRunnerIfNeeded();

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

/**
 * Start the queue runner if no jobs are currently processing
 */
export async function startRunnerIfNeeded(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    // Check if any jobs are currently processing (only recent ones, not ancient stuck jobs)
    const { data: processingJobs, error } = await supabase
      .from('jobs')
      .select('id, created_at')
      .eq('status', 'processing')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Only jobs from last 2 hours
      .limit(1);

    if (error) {
      console.error('Error checking processing jobs:', error);
      return;
    }

    console.log(`🔍 Found ${processingJobs?.length || 0} recent jobs currently processing`);

    // If no recent jobs are processing, start the runner
    if (!processingJobs || processingJobs.length === 0) {
      console.log('🚀 No jobs currently processing. Starting queue runner.');
      
      // Check if there are queued jobs
      const { data: queuedJobs, error: queueError } = await supabase
        .from('jobs')
        .select('id')
        .eq('status', 'queued')
        .limit(1);
        
      if (queueError) {
        console.error('Error checking queued jobs:', queueError);
        return;
      }
      
      console.log(`🔍 Found ${queuedJobs?.length || 0} jobs in queue`);
      
      if (queuedJobs && queuedJobs.length > 0) {
        console.log('🎯 Starting queue runner for queued jobs...');
        // In serverless, we need to trigger the runner via HTTP
        // Can't use setImmediate as function will terminate
        console.log('🔄 Triggering queue runner via HTTP...');
        
        // Fire and forget HTTP request to start runner
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://eod-agentic-flow-queue-mode.vercel.app'}/api/queue/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-queue-trigger': 'internal'
          }
        }).catch(err => {
          console.error('Failed to trigger queue runner:', err);
        });
      } else {
        console.log('📭 No queued jobs to process');
      }
    } else {
      console.log('⏳ Jobs already processing, runner not needed');
    }
  } catch (error) {
    console.error('Error in startRunnerIfNeeded:', error);
  }
}

/**
 * Main queue processing loop (iterative, not recursive)
 */
export async function startRunner(): Promise<void> {
  console.log('🏃‍♂️ Queue runner started');
  
  let jobCount = 0;
  try {
    while (true) {
      console.log(`🔄 Queue runner iteration ${jobCount + 1}`);
      
      const job = await claimNextJob();
      if (!job) {
        console.log('📭 No more jobs in queue. Runner stopping.');
        break;
      }

      jobCount++;
      console.log(`⚙️ Processing job ${job.jobId} (${jobCount})`);
      console.log(`📁 File URLs:`, job.fileUrls);
      
      try {
        await processJob(job.jobId, job.fileUrls);
        await markJobCompleted(job.jobId);
        console.log(`✅ Job ${job.jobId} completed successfully`);
      } catch (error) {
        console.error(`❌ Job ${job.jobId} failed:`, error);
        await markJobFailed(job.jobId, error instanceof Error ? error.message : 'Processing failed');
      }
    }
  } catch (error) {
    console.error('💥 Fatal error in queue runner:', error);
    // Runner will stop, but can be restarted by next job enqueue
  }
  
  console.log(`🏁 Queue runner stopped after processing ${jobCount} jobs`);
}

/**
 * Claim the next job in the queue atomically
 */
export async function claimNextJob(): Promise<{jobId: string, fileUrls: any} | null> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.rpc('claim_next_job');
    
    if (error) {
      console.error('Error claiming next job:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null; // No jobs available
    }

    const result = data[0];
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

/**
 * Cleanup stuck jobs (called periodically)
 */
export async function cleanupStuckJobs(): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.rpc('cleanup_stuck_jobs', { 
      timeout_minutes: 65 
    });

    if (error) {
      console.error('Error cleaning up stuck jobs:', error);
      return 0;
    }

    const cleanedCount = data?.length || 0;
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} stuck jobs`);
      // Restart runner if we freed up processing slots
      startRunnerIfNeeded();
    }

    return cleanedCount;

  } catch (error) {
    console.error('Unexpected error cleaning up stuck jobs:', error);
    return 0;
  }
}