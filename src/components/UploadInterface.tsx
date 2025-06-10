'use client'

import { useState, useCallback } from 'react'

interface UploadedFiles {
  estimate: File | null
  roofReport: File | null
}

interface UploadInterfaceProps {
  onJobCreated: (jobData: { id: string; status: 'processing'; created_at: string }) => void
}

export default function UploadInterface({ onJobCreated }: UploadInterfaceProps) {
  const [files, setFiles] = useState<UploadedFiles>({
    estimate: null,
    roofReport: null
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const validateFile = (file: File): boolean => {
    if (file.type !== 'application/pdf') {
      setError('Please upload PDF files only')
      return false
    }
    if (file.size > 2 * 1024 * 1024) { // 2MB limit for Vercel
      setError(`File size must be less than 2MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`)
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

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Files too large. Please use smaller PDF files (under 2MB each)')
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Processing failed')
      }

      const result = await response.json()
      
      // Call the callback to add the job to the dashboard
      onJobCreated({
        id: result.jobId,
        status: 'processing',
        created_at: new Date().toISOString()
      })

      // Clear the form and show success message
      setFiles({ estimate: null, roofReport: null })
      setSuccessMessage(`Job ${result.jobId} created successfully! Processing has started and will appear in the list below.`)
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
      
    } catch (err) {
      setError('Processing failed. Please try again.')
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