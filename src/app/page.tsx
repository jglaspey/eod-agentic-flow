import UploadInterface from '@/components/UploadInterface'
import { PreviousJobsDashboard } from '@/components/PreviousJobsDashboard'
import { Suspense } from 'react'

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        Roofing Estimate Analyzer
      </h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <UploadInterface />
      </div>

      <Suspense fallback={<p className="text-center mt-8 text-gray-500">Loading previous jobs...</p>}>
        <PreviousJobsDashboard />
      </Suspense>
    </div>
  )
}