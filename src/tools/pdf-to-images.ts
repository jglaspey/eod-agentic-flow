import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

export interface PDFToImagesOptions {
  dpi?: number        // Default: 300
  format?: 'jpg' | 'png' // Default: jpg
  quality?: number    // Default: 30 (for JPG only)
}

export interface PDFImageResult {
  pageNumber: number
  imageBuffer: Buffer
  format: string
  size: number
}

/**
 * Convert PDF pages to images using the llm-pdf-to-images Python tool
 * This provides vision model fallback capability for scanned PDFs
 */
export class PDFToImagesTool {
  
  /**
   * Convert a PDF buffer to an array of image buffers (one per page)
   */
  static async convertPDFToImages(
    pdfBuffer: Buffer, 
    options: PDFToImagesOptions = {}
  ): Promise<PDFImageResult[]> {
    const { dpi = 300, format = 'jpg', quality = 30 } = options
    
    // Create temporary files
    const tempId = uuidv4()
    const tempPdfPath = join(tmpdir(), `pdf-${tempId}.pdf`)
    const tempOutputDir = join(tmpdir(), `pdf-images-${tempId}`)
    
    try {
      // Write PDF buffer to temporary file
      writeFileSync(tempPdfPath, pdfBuffer)
      
      // Build the Python command
      const pythonArgs = [
        '-c',
        `
import sys
import os
import tempfile
from pathlib import Path
import fitz  # PyMuPDF

def convert_pdf_to_images(pdf_path, output_dir, dpi=${dpi}, format='${format}', quality=${quality}):
    """Convert PDF pages to images using PyMuPDF directly"""
    os.makedirs(output_dir, exist_ok=True)
    
    # Open the PDF
    doc = fitz.open(pdf_path)
    results = []
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        
        # Create a matrix for the desired DPI
        mat = fitz.Matrix(dpi/72, dpi/72)
        
        # Render page to pixmap
        pix = page.get_pixmap(matrix=mat)
        
        # Save image
        if format.lower() == 'png':
            img_path = os.path.join(output_dir, f'page_{page_num + 1:03d}.png')
            pix.save(img_path)
        else:  # JPG
            img_path = os.path.join(output_dir, f'page_{page_num + 1:03d}.jpg')
            pix.save(img_path, jpg_quality=${quality})
        
        results.append({
            'page': page_num + 1,
            'path': img_path,
            'size': os.path.getsize(img_path)
        })
    
    doc.close()
    return results

# Execute conversion
results = convert_pdf_to_images('${tempPdfPath}', '${tempOutputDir}')
for result in results:
    print(f"{result['page']}|{result['path']}|{result['size']}")
        `
      ]
      
      // Execute Python script
      const pythonOutput = await this.executePython(pythonArgs)
      
      // Parse results and read image files
      const imageResults: PDFImageResult[] = []
      const lines = pythonOutput.trim().split('\n').filter(line => line.includes('|'))
      
      for (const line of lines) {
        const [pageStr, imagePath, sizeStr] = line.split('|')
        const pageNumber = parseInt(pageStr)
        const size = parseInt(sizeStr)
        
        if (imagePath && pageNumber && size) {
          try {
            const imageBuffer = readFileSync(imagePath)
            imageResults.push({
              pageNumber,
              imageBuffer,
              format,
              size
            })
            
            // Clean up individual image file
            unlinkSync(imagePath)
          } catch (error) {
            console.warn(`Failed to read image file ${imagePath}:`, error)
          }
        }
      }
      
      return imageResults.sort((a, b) => a.pageNumber - b.pageNumber)
      
    } catch (error) {
      throw new Error(`PDF to images conversion failed: ${error}`)
    } finally {
      // Clean up temporary files
      try {
        unlinkSync(tempPdfPath)
      } catch (error) {
        console.warn('Failed to clean up temp PDF file:', error)
      }
      
      try {
        // Try to remove temp directory (may fail if not empty, that's ok)
        const fs = require('fs')
        fs.rmSync(tempOutputDir, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error)
      }
    }
  }
  
  /**
   * Convert PDF to base64 data URLs for direct use in vision models
   */
  static async convertPDFToDataURLs(
    pdfBuffer: Buffer, 
    options: PDFToImagesOptions = {}
  ): Promise<string[]> {
    const images = await this.convertPDFToImages(pdfBuffer, options)
    
    return images.map(img => {
      const mimeType = img.format === 'png' ? 'image/png' : 'image/jpeg'
      const base64 = img.imageBuffer.toString('base64')
      return `data:${mimeType};base64,${base64}`
    })
  }
  
  /**
   * Get PDF page count without converting to images
   */
  static async getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
    const tempId = uuidv4()
    const tempPdfPath = join(tmpdir(), `pdf-count-${tempId}.pdf`)
    
    try {
      writeFileSync(tempPdfPath, pdfBuffer)
      
      const pythonArgs = [
        '-c',
        `
import fitz
doc = fitz.open('${tempPdfPath}')
print(len(doc))
doc.close()
        `
      ]
      
      const output = await this.executePython(pythonArgs)
      return parseInt(output.trim())
      
    } finally {
      try {
        unlinkSync(tempPdfPath)
      } catch (error) {
        console.warn('Failed to clean up temp PDF file:', error)
      }
    }
  }
  
  /**
   * Execute Python script and return output
   */
  private static async executePython(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', args)
      
      let stdout = ''
      let stderr = ''
      
      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      python.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      
      python.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`))
        }
      })
      
      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`))
      })
    })
  }
  
  /**
   * Check if the PDF-to-images tool is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await this.executePython(['-c', 'import fitz; print("OK")'])
      return true
    } catch (error) {
      console.warn('PDF-to-images tool not available:', error)
      return false
    }
  }
} 