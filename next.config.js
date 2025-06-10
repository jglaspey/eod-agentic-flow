/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdf2pic']
  },
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Increase body size limit for PDF uploads
    },
  },
}

module.exports = nextConfig