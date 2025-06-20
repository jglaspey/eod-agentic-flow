import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from '@/lib/supabase'
import { logStreamer } from '@/lib/log-streamer'
import { processFilesWithNewAgent } from '@/lib/job-processor'

export const maxDuration = 300;  // Allow up to 5-minute runtime for long-running AI/ocr pipeline (Vercel Pro max for Node.js)

export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase configuration missing. Please check your environment variables.' },
        { status: 500 }
      )
    }

    // Check if this is a rerun request
    const contentType = request.headers.get('content-type')
    let isRerun = false
    let jobId: string
    let estimateFile: File | null = null
    let roofReportFile: File | null = null

    if (contentType?.includes('application/json')) {
      // This is a rerun request - for now, return error as we don't store files
      return NextResponse.json(
        { error: 'Rerun functionality requires re-uploading files. Please upload the files again for reprocessing.' },
        { status: 400 }
      )
    } else {
      // This is a new file upload
      const formData = await request.formData()
      estimateFile = formData.get('estimate') as File
      roofReportFile = formData.get('roofReport') as File | null

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

      // Validate file sizes (Vercel limit is ~4.5MB per request)
      const maxFileSize = 4 * 1024 * 1024 // 4MB per file (but total request must be under 4.5MB)
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

      // Check total request size (Vercel limit is 4.5MB)
      const totalSize = estimateFile.size + (roofReportFile?.size || 0)
      const maxTotalSize = 4.2 * 1024 * 1024 // 4.2MB to leave room for form data overhead
      if (totalSize > maxTotalSize) {
        return NextResponse.json(
          { error: `Combined file size too large (${(totalSize / 1024 / 1024).toFixed(1)}MB). Maximum total is ${(maxTotalSize / 1024 / 1024).toFixed(1)}MB` },
          { status: 413 }
        )
      }

      jobId = uuidv4()
    }

    const startTime = Date.now()

    const supabase = getSupabaseClient()

    const { error: jobError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        status: 'processing',
        created_at: new Date().toISOString()
      })

    if (jobError) {
      console.error('Database error creating job:', jobError)
      return NextResponse.json(
        { error: `Failed to create job record: ${jobError.message}` },
        { status: 500 }
      )
    }

    // Add immediate log to verify job creation
    logStreamer.logStep(jobId, 'job-creation-confirmed', `Job ${jobId} created successfully, starting processing`);
    console.log(`[API] Job ${jobId} created, about to start processing`);
    
    // Test LogStreamer immediately
    const testLog = logStreamer.getLogs(jobId);
    console.log(`[API] Immediate test: Job ${jobId} has ${testLog.length} logs after creation`);

    // Process synchronously to avoid serverless timeout issues
    console.log(`[${jobId}] Starting synchronous processing to avoid timeout`);
    
    try {
      await processFilesWithNewAgent(jobId, estimateFile, roofReportFile, startTime);
      console.log(`[${jobId}] Processing completed successfully`);
    } catch (error) {
      console.error(`[${jobId}] Processing failed:`, error);
      
      // Update job status to failed on error
      await getSupabaseClient()
        .from('jobs')
        .update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Processing failed' })
        .eq('id', jobId);
    }

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error('API error in POST /api/process:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

