import pdf from 'pdf-parse'

export class PDFProcessor {
  static async extractText(buffer: Buffer): Promise<string> {
    try {
      const data = await pdf(buffer)
      return data.text
    } catch (error) {
      console.error('PDF text extraction failed:', error)
      throw new Error('Failed to extract text from PDF')
    }
  }

  static async convertToImages(buffer: Buffer): Promise<string[]> {
    // This would require additional setup for image conversion
    // For now, we'll focus on text extraction
    // In production, this would integrate with a service like pdf2pic or similar
    throw new Error('Image conversion not implemented yet')
  }

  static validatePDF(buffer: Buffer): boolean {
    // Basic PDF validation - check for PDF signature
    const header = buffer.slice(0, 4).toString()
    return header === '%PDF'
  }

  static extractMetadata(buffer: Buffer): Promise<any> {
    return pdf(buffer, { max: 1 }).then(data => ({
      pages: data.numpages,
      info: data.info,
      metadata: data.metadata
    }))
  }
}