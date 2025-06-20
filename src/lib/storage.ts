/**
 * Supabase Storage utilities for V2 Queue System
 * Handles uploading job files to persistent storage for async processing
 */

import { getSupabaseClient } from './supabase';

export interface FileUploadResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

export interface JobFilesUploadResult {
  success: boolean;
  fileUrls?: {
    estimate?: string;
    roofReport?: string;
  };
  error?: string;
}

/**
 * Upload a single file to Supabase Storage
 */
export async function uploadJobFile(
  jobId: string,
  file: File,
  fileType: 'estimate' | 'roof-report'
): Promise<FileUploadResult> {
  try {
    const supabase = getSupabaseClient();
    const fileExtension = file.name.split('.').pop() || 'pdf';
    const fileName = `${jobId}/${fileType}.${fileExtension}`;
    
    // Convert File to ArrayBuffer for upload
    const fileBuffer = await file.arrayBuffer();
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('job-files')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true, // Overwrite if exists (for retries)
        cacheControl: '3600', // Cache for 1 hour
      });

    if (error) {
      console.error(`Failed to upload ${fileType} file for job ${jobId}:`, error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`
      };
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('job-files')
      .getPublicUrl(fileName);

    console.log(`File uploaded successfully: ${fileName}`);
    return {
      success: true,
      fileUrl: urlData.publicUrl
    };

  } catch (error) {
    console.error(`Unexpected error uploading ${fileType} file:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Upload both estimate and roof report files for a job
 */
export async function uploadJobFiles(
  jobId: string,
  estimateFile: File,
  roofReportFile?: File | null
): Promise<JobFilesUploadResult> {
  try {
    const results: {
      estimate?: string;
      roofReport?: string;
    } = {};

    // Upload estimate file (required)
    const estimateResult = await uploadJobFile(jobId, estimateFile, 'estimate');
    if (!estimateResult.success) {
      return {
        success: false,
        error: `Failed to upload estimate: ${estimateResult.error}`
      };
    }
    results.estimate = estimateResult.fileUrl;

    // Upload roof report file (optional)
    if (roofReportFile) {
      const roofReportResult = await uploadJobFile(jobId, roofReportFile, 'roof-report');
      if (!roofReportResult.success) {
        return {
          success: false,
          error: `Failed to upload roof report: ${roofReportResult.error}`
        };
      }
      results.roofReport = roofReportResult.fileUrl;
    }

    return {
      success: true,
      fileUrls: results
    };

  } catch (error) {
    console.error('Unexpected error uploading job files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Download a file from Supabase Storage and convert to File object
 */
export async function downloadJobFile(
  fileUrl: string,
  fileName: string
): Promise<File | null> {
  try {
    const supabase = getSupabaseClient();
    
    // Extract the file path from the public URL
    const urlParts = fileUrl.split('/job-files/');
    if (urlParts.length !== 2) {
      console.error('Invalid file URL format:', fileUrl);
      return null;
    }
    
    const filePath = urlParts[1];
    
    // Download from Supabase Storage
    const { data, error } = await supabase.storage
      .from('job-files')
      .download(filePath);

    if (error) {
      console.error('Failed to download file:', error);
      return null;
    }

    // Convert Blob to File
    return new File([data], fileName, {
      type: 'application/pdf'
    });

  } catch (error) {
    console.error('Unexpected error downloading file:', error);
    return null;
  }
}

/**
 * Clean up job files from storage (call after successful processing)
 */
export async function cleanupJobFiles(jobId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    // List all files for this job
    const { data: files, error: listError } = await supabase.storage
      .from('job-files')
      .list(jobId);

    if (listError) {
      console.error(`Failed to list files for cleanup of job ${jobId}:`, listError);
      return;
    }

    if (!files || files.length === 0) {
      console.log(`No files to cleanup for job ${jobId}`);
      return;
    }

    // Delete all files for this job
    const filePaths = files.map(file => `${jobId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from('job-files')
      .remove(filePaths);

    if (deleteError) {
      console.error(`Failed to cleanup files for job ${jobId}:`, deleteError);
    } else {
      console.log(`Successfully cleaned up ${filePaths.length} files for job ${jobId}`);
    }

  } catch (error) {
    console.error(`Unexpected error cleaning up files for job ${jobId}:`, error);
  }
}

/**
 * Check if the storage bucket exists and is accessible
 * Updated to work around RLS policy issues with bucket listing
 */
export async function verifyStorageAccess(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    
    console.log('🧪 Testing storage with upload/download test (bypassing bucket listing)...');
    
    // Skip bucket listing due to RLS issues - test with actual file operations
    const testFileName = `test-access-${Date.now()}.txt`;
    const testContent = 'Storage verification test';
    
    // Test upload
    const { error: uploadError } = await supabase.storage
      .from('job-files')
      .upload(testFileName, new Blob([testContent], { type: 'text/plain' }), {
        upsert: true
      });
      
    if (uploadError) {
      console.error('❌ Storage upload test failed:', uploadError);
      console.error('Error details:', uploadError);
      
      // Check if error indicates bucket doesn't exist
      if (uploadError.message?.includes('bucket') && uploadError.message?.includes('not found')) {
        console.error('❌ job-files bucket not found. Please create it manually in Supabase Dashboard > Storage.');
        console.error('   1. Create bucket named "job-files"');
        console.error('   2. Set it to Public (for testing) or Private with proper RLS policies');
        console.error('   3. File size limit: 10MB');
        return false;
      }
      
      // Check for permission/policy issues
      if (uploadError.message?.includes('policy') || uploadError.message?.includes('permission')) {
        console.error('❌ Storage permission error. Try making the job-files bucket PUBLIC in Supabase Dashboard for testing.');
        return false;
      }
      
      console.error('❌ Storage upload failed. Check bucket settings and permissions.');
      return false;
    }
    
    console.log('✅ Upload test successful');
    
    // Test download
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('job-files')
      .download(testFileName);
      
    if (downloadError) {
      console.error('❌ Storage download test failed:', downloadError);
      // Clean up test file
      await supabase.storage.from('job-files').remove([testFileName]);
      return false;
    }
    
    console.log('✅ Download test successful');
    
    // Clean up test file
    const { error: deleteError } = await supabase.storage.from('job-files').remove([testFileName]);
    if (deleteError) {
      console.warn('⚠️ Failed to clean up test file (non-critical):', deleteError);
    } else {
      console.log('🧹 Test file cleaned up');
    }
    
    console.log('✅ Storage verification complete - job-files bucket is fully accessible');
    return true;

  } catch (error) {
    console.error('💥 Unexpected error verifying storage access:', error);
    return false;
  }
}