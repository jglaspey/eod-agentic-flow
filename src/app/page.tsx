import UploadInterface from '@/components/UploadInterface'

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        Roofing Estimate Analyzer
      </h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <UploadInterface />
      </div>
    </div>
  )
}