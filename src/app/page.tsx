'use client'

import { useState } from 'react'
import UploadInterface from '@/components/UploadInterface'
import { PreviousJobsDashboard } from '@/components/PreviousJobsDashboard'

export default function Home() {
  const [newJob, setNewJob] = useState<{
    id: string
    status: 'processing'
    created_at: string
  } | null>(null)

  const handleJobCreated = (jobData: { id: string; status: 'processing'; created_at: string }) => {
    setNewJob(jobData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        Roofing Estimate Analyzer
      </h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <UploadInterface onJobCreated={handleJobCreated} />
      </div>

      <PreviousJobsDashboard newJob={newJob} />
    </div>
  )
}