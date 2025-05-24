'use client'

import { Job, JobData, SupplementItem } from '@/types'

interface ResultsDisplayProps {
  job: Job
  jobData: JobData | null
  supplements: SupplementItem[]
}

export default function ResultsDisplay({ job, jobData, supplements }: ResultsDisplayProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (typeof amount !== 'number') return 'N/A'; // Or some other placeholder
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-yellow-100 text-yellow-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (job.status === 'processing' && !jobData) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-white rounded-lg shadow-md p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Processing Estimate...</h2>
        <p className="text-gray-500">Please wait a moment. This page will update automatically when results are ready.</p>
        <p className="text-sm text-gray-400 mt-4">Job ID: {job.id}</p>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-md shadow-md">
        <div className="flex">
          <div className="flex-shrink-0">
            {/* Heroicon name: solid/x-circle */}
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L10 8.586 7.707 6.293a1 1 0 00-1.414 1.414L8.586 10l-2.293 2.293a1 1 0 001.414 1.414L10 11.414l2.293 2.293a1 1 0 001.414-1.414L11.414 10l2.293-2.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-red-800">Analysis Failed</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>We encountered an error while processing your documents for Job ID: {job.id}.</p>
              {job.error_message && (
                <p className="mt-1"><strong>Details:</strong> {job.error_message}</p>
              )}
              <p className="mt-3">Please try uploading the files again. If the problem persists, contact support.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for when jobData is null even if status is not 'failed' or 'processing' (should be rare)
  if (!jobData && job.status === 'completed') {
     return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-md shadow-md">
        <div className="flex">
          <div className="flex-shrink-0">
            {/* Heroicon name: solid/exclamation */}
            <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.001-1.742 3.001H4.42c-1.53 0-2.493-1.667-1.743-3.001l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1.75-3.5a1.75 1.75 0 00-3.5 0A1.75 1.75 0 006.5 11H10V9.5zM11.5 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-yellow-800">Data Inconsistency</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>The job (ID: {job.id}) is marked as completed, but the detailed analysis data is currently unavailable.</p>
              {job.error_message && (
                <p className="mt-1"><strong>Error reported:</strong> {job.error_message}</p>
              )}
              <p className="mt-3">This might be a temporary issue. Please try refreshing the page in a few moments. If the problem persists, contact support.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Status */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Processing Status</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{formatDate(job.created_at)}</p>
          </div>
          {job.processing_time_ms && (
            <div>
              <p className="text-sm text-gray-500">Processing Time</p>
              <p className="font-medium">{(job.processing_time_ms / 1000).toFixed(1)}s</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Supplements Found</p>
            <p className="font-medium">{supplements.length}</p>
          </div>
        </div>
      </div>

      {/* Extracted Data */}
      {jobData && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Extracted Information</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Property Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Property Details</h3>
              <div className="space-y-2">
                {jobData.property_address && (
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium">{jobData.property_address}</p>
                  </div>
                )}
                {jobData.claim_number && (
                  <div>
                    <p className="text-sm text-gray-500">Claim Number</p>
                    <p className="font-medium">{jobData.claim_number}</p>
                  </div>
                )}
                {jobData.insurance_carrier && (
                  <div>
                    <p className="text-sm text-gray-500">Insurance Carrier</p>
                    <p className="font-medium">{jobData.insurance_carrier}</p>
                  </div>
                )}
                {jobData.total_rcv && (
                  <div>
                    <p className="text-sm text-gray-500">Total RCV</p>
                    <p className="font-medium">{formatCurrency(jobData.total_rcv)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Roof Measurements */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Roof Measurements</h3>
              <div className="space-y-2">
                {jobData.roof_area_squares && (
                  <div>
                    <p className="text-sm text-gray-500">Total Area</p>
                    <p className="font-medium">{jobData.roof_area_squares} squares</p>
                  </div>
                )}
                {jobData.eave_length && (
                  <div>
                    <p className="text-sm text-gray-500">Eave Length</p>
                    <p className="font-medium">{jobData.eave_length} LF</p>
                  </div>
                )}
                {jobData.rake_length && (
                  <div>
                    <p className="text-sm text-gray-500">Rake Length</p>
                    <p className="font-medium">{jobData.rake_length} LF</p>
                  </div>
                )}
                {jobData.ridge_hip_length && (
                  <div>
                    <p className="text-sm text-gray-500">Ridge/Hip Length</p>
                    <p className="font-medium">{jobData.ridge_hip_length} LF</p>
                  </div>
                )}
                {jobData.valley_length && (
                  <div>
                    <p className="text-sm text-gray-500">Valley Length</p>
                    <p className="font-medium">{jobData.valley_length} LF</p>
                  </div>
                )}
                {jobData.stories && (
                  <div>
                    <p className="text-sm text-gray-500">Stories</p>
                    <p className="font-medium">{jobData.stories}</p>
                  </div>
                )}
                {jobData.pitch && (
                  <div>
                    <p className="text-sm text-gray-500">Pitch</p>
                    <p className="font-medium">{jobData.pitch}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplement Items */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Supplement Items ({supplements.length})
        </h2>

        {supplements.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No supplement items identified</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Line Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {supplements.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{item.line_item}</div>
                      {item.calculation_details && (
                        <div className="text-sm text-gray-500">{item.calculation_details}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.xactimate_code || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{item.reason}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getConfidenceColor(item.confidence_score)}`}>
                        {(item.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Export Options</h2>
        <div className="flex space-x-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
            Export to Xactimate
          </button>
          <button className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
            Export to CSV
          </button>
          <button className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
            Generate Report
          </button>
        </div>
      </div>
    </div>
  )
}