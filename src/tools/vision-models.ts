import { OpenAI } from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'

export interface VisionModelConfig {
  provider: 'openai' | 'anthropic'
  model: string
  maxTokens?: number
  temperature?: number
}

export interface VisionAnalysisResult {
  extractedText: string
  confidence: number
  model: string
  processingTimeMs: number
  cost?: number
}

/**
 * Vision model integration for processing PDF images
 * Supports both OpenAI GPT-4V and Anthropic Claude Vision models
 */
export class VisionModelProcessor {
  private openai: OpenAI | null = null
  private anthropic: Anthropic | null = null

  constructor() {
    // Initialize clients if API keys are available
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    }
    
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      })
    }
  }

  /**
   * Analyze images using vision models to extract text and data
   */
  async analyzeImages(
    imageDataUrls: string[],
    prompt: string,
    config: VisionModelConfig
  ): Promise<VisionAnalysisResult> {
    const startTime = Date.now()

    try {
      let result: string
      let model: string

      if (config.provider === 'openai' && this.openai) {
        result = await this.processWithOpenAI(imageDataUrls, prompt, config)
        model = config.model
      } else if (config.provider === 'anthropic' && this.anthropic) {
        result = await this.processWithAnthropic(imageDataUrls, prompt, config)
        model = config.model
      } else {
        throw new Error(`Vision model provider ${config.provider} not available or not configured`)
      }

      const processingTimeMs = Date.now() - startTime
      
      // Calculate confidence based on response quality
      const confidence = this.calculateVisionConfidence(result, imageDataUrls.length)

      return {
        extractedText: result,
        confidence,
        model,
        processingTimeMs,
        cost: this.estimateCost(config.provider, imageDataUrls.length, result.length)
      }

    } catch (error) {
      throw new Error(`Vision analysis failed: ${error}`)
    }
  }

  /**
   * Process images with OpenAI GPT-4V
   */
  private async processWithOpenAI(
    imageDataUrls: string[],
    prompt: string,
    config: VisionModelConfig
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized')
    }

    // Build messages with images
    const imageMessages = imageDataUrls.map(url => ({
      type: 'image_url' as const,
      image_url: {
        url,
        detail: 'high' as const
      }
    }))

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          ...imageMessages
        ]
      }
    ]

    const response = await this.openai.chat.completions.create({
      model: config.model || 'gpt-4o',
      messages,
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.1
    })

    return response.choices[0]?.message?.content || ''
  }

  /**
   * Process images with Anthropic Claude Vision
   */
  private async processWithAnthropic(
    imageDataUrls: string[],
    prompt: string,
    config: VisionModelConfig
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized')
    }

    // Convert data URLs to Anthropic format
    const imageContent = imageDataUrls.map(url => {
      const [header, base64Data] = url.split(',')
      const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
      
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as 'image/jpeg' | 'image/png',
          data: base64Data
        }
      }
    })

    const response = await this.anthropic.messages.create({
      model: config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            ...imageContent
          ]
        }
      ]
    })

    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  /**
   * Calculate confidence score for vision analysis results
   */
  private calculateVisionConfidence(result: string, imageCount: number): number {
    let confidence = 0.5 // Base confidence for vision processing

    // Increase confidence based on result length and structure
    if (result.length > 100) confidence += 0.1
    if (result.length > 500) confidence += 0.1
    
    // Check for structured data patterns
    if (result.includes('$') || result.includes('Address:') || result.includes('Claim')) {
      confidence += 0.15
    }
    
    // Check for numeric patterns (measurements, amounts)
    const numberMatches = result.match(/\d+(?:\.\d+)?/g)
    if (numberMatches && numberMatches.length > 3) {
      confidence += 0.1
    }
    
    // Adjust for multiple images (more context usually means better extraction)
    if (imageCount > 1) {
      confidence += Math.min(0.1, imageCount * 0.02)
    }

    return Math.min(0.95, confidence) // Cap at 95% for vision processing
  }

  /**
   * Estimate API cost for vision processing
   */
  private estimateCost(provider: string, imageCount: number, outputLength: number): number {
    if (provider === 'openai') {
      // GPT-4V pricing (approximate)
      const imageCost = imageCount * 0.01 // ~$0.01 per image
      const outputCost = (outputLength / 1000) * 0.03 // ~$0.03 per 1K output tokens
      return imageCost + outputCost
    } else if (provider === 'anthropic') {
      // Claude Vision pricing (approximate)
      const imageCost = imageCount * 0.008 // ~$0.008 per image
      const outputCost = (outputLength / 1000) * 0.015 // ~$0.015 per 1K output tokens
      return imageCost + outputCost
    }
    
    return 0
  }

  /**
   * Check if vision models are available
   */
  isAvailable(provider?: 'openai' | 'anthropic'): boolean {
    if (provider === 'openai') {
      return this.openai !== null
    } else if (provider === 'anthropic') {
      return this.anthropic !== null
    } else {
      return this.openai !== null || this.anthropic !== null
    }
  }

  /**
   * Get available vision models
   */
  getAvailableModels(): VisionModelConfig[] {
    const models: VisionModelConfig[] = []

    if (this.openai) {
      models.push(
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'openai', model: 'gpt-4o-mini' }
      )
    }

    if (this.anthropic) {
      models.push(
        { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
        { provider: 'anthropic', model: 'claude-3-haiku-20240307' }
      )
    }

    return models
  }
} 