'use client'

import { useState, useCallback, useEffect } from 'react'

interface UploadedFiles {
  estimate: File | null
  roofReport: File | null
}

interface QueueStatus {
  totalQueued: number
  totalProcessing: number
  userPosition?: number
}

interface UploadInterfaceProps {
  onJobCreated: (jobData: { 
    id: string; 
    status: 'processing' | 'queued'; 
    created_at: string;
    queuePosition?: number;
    estimatedWaitTime?: string;
    queueStatus?: QueueStatus;
  }) => void
}

export default function UploadInterface({ onJobCreated }: UploadInterfaceProps) {
  const [files, setFiles] = useState<UploadedFiles>({
    estimate: null,
    roofReport: null
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  // Always show queue mode toggle for testing
  const queueModeAvailable = true;
  const [useQueueMode, setUseQueueMode] = useState(true) // Default to queue mode
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [isProcessingQueue, setIsProcessingQueue] = useState(false)

  // Manual queue trigger function
  const triggerQueueProcessing = async () => {
    setIsProcessingQueue(true)
    try {
      const response = await fetch('/api/queue/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await response.json()
      
      if (result.success) {
        setSuccessMessage(`Queue processing triggered! ${result.message}`)
        // Refresh queue status
        await checkQueueStatus()
      } else {
        setError(`Queue processing failed: ${result.error}`)
      }
    } catch (error) {
      setError('Failed to trigger queue processing')
    } finally {
      setIsProcessingQueue(false)
    }
  }

  // Check current queue status
  const checkQueueStatus = async () => {
    try {
      const response = await fetch('/api/jobs/create')
      const data = await response.json()
      setQueueStatus(data.queueStatus)
    } catch (error) {
      console.error('Failed to check queue status:', error)
    }
  }

  // Check queue status on component mount
  useEffect(() => {
    if (useQueueMode) {
      checkQueueStatus()
    }
  }, [useQueueMode])

  const validateFile = (file: File): boolean => {
    if (file.type !== 'application/pdf') {
      setError('Please upload PDF files only')
      return false
    }
    if (file.size > 4 * 1024 * 1024) { // 4MB limit per file for Vercel
      setError(`File size must be less than 4MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return false
    }
    return true
  }

  const handleFileUpload = useCallback((type: 'estimate' | 'roofReport') => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file && validateFile(file)) {
        setFiles(prev => ({ ...prev, [type]: file }))
        setError(null)
        setSuccessMessage(null)
      }
    }
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDrop = useCallback((type: 'estimate' | 'roofReport') => {
    return (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      
      const file = event.dataTransfer.files[0]
      if (file && validateFile(file)) {
        setFiles(prev => ({ ...prev, [type]: file }))
        setError(null)
        setSuccessMessage(null)
      }
    }
  }, [])

  const handleSubmit = async () => {
    if (!files.estimate || !files.roofReport) {
      setError('Please upload both files')
      return
    }

    setIsProcessing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const formData = new FormData()
      formData.append('estimate', files.estimate)
      formData.append('roofReport', files.roofReport)
      formData.append('userId', 'user-' + Date.now()) // Simple user ID for demo

      const endpoint = useQueueMode ? '/api/jobs/create' : '/api/process'
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Files too large. Please use smaller PDF files (under 4MB each)')
        }
        if (response.status === 429) {
          throw new Error('Too many jobs queued. Please wait for existing jobs to complete.')
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        // Handle storage unavailable error by falling back to direct mode
        if (response.status === 503 && errorData.fallbackMode === 'direct') {
          setUseQueueMode(false)
          setError('Queue mode unavailable. Switching to Direct Mode.')
          // Retry with direct mode
          const directResponse = await fetch('/api/process', {
            method: 'POST',
            body: formData
          })
          
          if (!directResponse.ok) {
            const directError = await directResponse.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(directError.error || 'Processing failed')
          }
          
          const directResult = await directResponse.json()
          onJobCreated({
            id: directResult.jobId,
            status: 'processing',
            created_at: new Date().toISOString()
          })
          
          setSuccessMessage(`Job ${directResult.jobId} created successfully! Processing has started.`)
          setFiles({ estimate: null, roofReport: null })
          setTimeout(() => setSuccessMessage(null), 7000)
          
          return // Exit early since we handled it
        }
        
        throw new Error(errorData.error || 'Processing failed')
      }

      const result = await response.json()
      
      // Call the callback to add the job to the dashboard
      if (useQueueMode) {
        onJobCreated({
          id: result.jobId,
          status: result.status, // 'queued'
          created_at: new Date().toISOString(),
          queuePosition: result.queuePosition,
          estimatedWaitTime: result.estimatedWaitTime,
          queueStatus: result.queueStatus
        })
        
        setSuccessMessage(
          `Job ${result.jobId} queued successfully! ` +
          `Position in queue: ${result.queuePosition || 'Unknown'}.${result.estimatedWaitTime ? ` Estimated wait: ${result.estimatedWaitTime}` : ''}`
        )
        
        // Refresh queue status to show the new job
        await checkQueueStatus()
      } else {
        onJobCreated({
          id: result.jobId,
          status: 'processing',
          created_at: new Date().toISOString()
        })
        
        setSuccessMessage(`Job ${result.jobId} created successfully! Processing has started and will appear in the list below.`)
      }

      // Clear the form
      setFiles({ estimate: null, roofReport: null })
      
      // Clear success message after 7 seconds
      setTimeout(() => setSuccessMessage(null), 7000)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Upload Documents
        </h2>
        <p className="text-gray-600">
          Upload your insurance estimate and roof inspection report to begin analysis
        </p>
        
        {/* Queue Mode Toggle */}
        <div className="mt-4 inline-flex items-center space-x-3 bg-gray-50 rounded-lg p-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only"
              checked={useQueueMode}
              onChange={(e) => setUseQueueMode(e.target.checked)}
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              useQueueMode ? 'bg-blue-600' : 'bg-gray-300'
            }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                useQueueMode ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className="ml-2 text-sm text-gray-700">
              {useQueueMode ? 'Queue Mode (Fast)' : 'Direct Mode (Wait)'}
            </span>
          </label>
          <div className="text-xs text-gray-500">
            {useQueueMode 
              ? '~2s response, background processing' 
              : '~60s wait, immediate results'
            }
          </div>
        </div>
        
        {/* Queue Status and Manual Trigger */}
        {useQueueMode && queueStatus && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium text-blue-900">Queue Status:</span>
                <span className="ml-2 text-blue-700">
                  {queueStatus.totalQueued} queued, {queueStatus.totalProcessing} processing
                </span>
              </div>
              {queueStatus.totalQueued > 0 && queueStatus.totalProcessing === 0 && (
                <button
                  onClick={triggerQueueProcessing}
                  disabled={isProcessingQueue}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessingQueue ? 'Triggering...' : 'Process Queue'}
                </button>
              )}
            </div>
            {queueStatus.totalQueued > 0 && queueStatus.totalProcessing === 0 && (
              <div className="mt-1 text-xs text-blue-600">
                ⚠️ Jobs are queued but not processing. Click "Process Queue" to start.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Insurance Estimate Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Insurance Carrier Estimate
          </label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
            onDragOver={handleDragOver}
            onDrop={handleDrop('estimate')}
          >
            {files.estimate ? (
              <div className="text-green-600">
                <svg className="mx-auto h-8 w-8 mb-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium">{files.estimate.name}</p>
              </div>
            ) : (
              <div>
                <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop your PDF here, or{' '}
                  <label className="text-blue-600 hover:text-blue-500 cursor-pointer">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={handleFileUpload('estimate')}
                    />
                  </label>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Roof Report Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Roof Inspection Report
          </label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
            onDragOver={handleDragOver}
            onDrop={handleDrop('roofReport')}
          >
            {files.roofReport ? (
              <div className="text-green-600">
                <svg className="mx-auto h-8 w-8 mb-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium">{files.roofReport.name}</p>
              </div>
            ) : (
              <div>
                <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop your PDF here, or{' '}
                  <label className="text-blue-600 hover:text-blue-500 cursor-pointer">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={handleFileUpload('roofReport')}
                    />
                  </label>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={handleSubmit}
          disabled={!files.estimate || !files.roofReport || isProcessing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition-colors"
        >
          {isProcessing ? 'Processing...' : 'Analyze Documents'}
        </button>
      </div>

      {isProcessing && (
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 font-medium text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Processing your documents...
          </div>
        </div>
      )}
    </div>
  )
}