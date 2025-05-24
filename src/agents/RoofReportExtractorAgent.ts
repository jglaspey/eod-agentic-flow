import { Agent } from './Agent';
import {
  AgentType,
  AgentConfig,
  AgentResult,
  AgentExecutionPlan,
  TaskContext,
  ValidationResult,
  RoofMeasurements,
  ExtractedField,
  ExtractionStrategy,
  LogLevel,
  AIConfig
} from './types';
import { PDFProcessor } from '@/lib/pdf-processor';
import { PDFToImagesTool, PDFToImagesOptions } from '@/tools/pdf-to-images';
import { VisionModelProcessor, VisionModelConfig } from '@/tools/vision-models';
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';

interface RoofReportExtractionInput {
  pdfBuffer: Buffer;
  strategy?: ExtractionStrategy;
}

/**
 * Specialized agent for extracting data from roof report PDFs.
 * Focuses on measurements, pitch, facets, and other roof-specific data.
 * Uses text extraction first, falls back to vision models for diagrams or complex tables.
 */
export class RoofReportExtractorAgent extends Agent {
  private visionProcessor: VisionModelProcessor;
  private supabase = getSupabaseClient();
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor() {
    const config: AgentConfig = {
      name: 'RoofReportExtractorAgent',
      version: '1.0.0',
      capabilities: ['text_extraction', 'vision_processing', 'measurement_validation'],
      defaultTimeout: 75000, // Increased timeout for potentially complex vision tasks
      maxRetries: 2,
      confidenceThreshold: 0.75, // Higher threshold for critical measurements
      tools: ['pdf_processor', 'pdf_to_images', 'vision_models']
    };
    
    super(config);
    this.visionProcessor = new VisionModelProcessor();

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  get agentType(): AgentType {
    return AgentType.ROOF_REPORT_EXTRACTOR;
  }

  async plan(input: RoofReportExtractionInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-roof-report', `Planning extraction for roof report task ${context.taskId}`);
    const tasks = [
      {
        id: uuidv4(),
        type: 'extract_text_roof',
        input: input.pdfBuffer,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        type: 'extract_fields_text_roof',
        input: null, // Populated by extract_text_roof
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    if (input.strategy === ExtractionStrategy.VISION_ONLY ||
        input.strategy === ExtractionStrategy.HYBRID ||
        input.strategy === ExtractionStrategy.FALLBACK) {
      tasks.push({
        id: uuidv4(),
        type: 'extract_fields_vision_roof',
        input: input.pdfBuffer,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const dependencies = new Map<string, string[]>();
    dependencies.set(tasks[1].id, [tasks[0].id]); // extract_fields_text_roof depends on extract_text_roof

    return {
      tasks,
      dependencies,
      estimatedDuration: 45000, // Adjusted for roof report complexity
      confidence: 0.85
    };
  }

  async act(input: RoofReportExtractionInput, context: TaskContext): Promise<AgentResult<RoofMeasurements>> {
    this.log(LogLevel.INFO, 'roof-extraction-start', `Starting roof report data extraction for task ${context.taskId}`);
    
    let textExtractionResult: string = '';
    let textConfidence = 0;
    let textMeasurements: RoofMeasurements | null = null;
    let visionMeasurements: RoofMeasurements | null = null;

    try {
      // 1. Text Extraction
      this.log(LogLevel.DEBUG, 'text-extraction-roof', 'Extracting text from roof report PDF', { taskId: context.taskId });
      textExtractionResult = await PDFProcessor.extractText(input.pdfBuffer);
      textConfidence = this.calculateTextQuality(textExtractionResult); // Using a generic text quality for now
      this.log(LogLevel.INFO, 'text-extracted-roof', 
        `Text extraction from roof report completed. Quality: ${textConfidence.toFixed(3)}`,
        { textLength: textExtractionResult.length, quality: textConfidence, taskId: context.taskId }
      );

      // 2. Text-based Measurement Extraction
      if (textConfidence > 0.4 && // Slightly lower threshold for text attempt, as roof reports can be sparse
          (input.strategy === ExtractionStrategy.TEXT_ONLY || 
           input.strategy === ExtractionStrategy.HYBRID || 
           input.strategy === ExtractionStrategy.FALLBACK)) {
        this.log(LogLevel.DEBUG, 'measurement-extraction-text-roof', 'Extracting roof measurements from text', { taskId: context.taskId });
        try {
          textMeasurements = await this.extractMeasurementsFromText(textExtractionResult, context);
        } catch (error) {
          this.log(LogLevel.WARN, 'text-measurement-error', `Roof measurement extraction from text failed: ${error}`, { taskId: context.taskId, error });
        }
      }

      // 3. Vision-based Measurement Extraction
      const shouldUseVision = (
        input.strategy === ExtractionStrategy.VISION_ONLY ||
        input.strategy === ExtractionStrategy.HYBRID ||
        (input.strategy === ExtractionStrategy.FALLBACK && 
          (!textMeasurements || this.getOverallMeasurementConfidence(textMeasurements) < this.config.confidenceThreshold))
      );

      if (shouldUseVision) {
        if (await PDFToImagesTool.isAvailable() && this.visionProcessor.isAvailable()) {
          this.log(LogLevel.INFO, 'vision-fallback-roof', 'Using vision models for roof measurement extraction', { taskId: context.taskId });
          try {
            visionMeasurements = await this.extractMeasurementsFromVision(input.pdfBuffer, context);
          } catch (error) {
            this.log(LogLevel.WARN, 'vision-measurement-error', `Roof measurement extraction from vision failed: ${error}`, { taskId: context.taskId, error });
          }
        } else {
          this.log(LogLevel.WARN, 'vision-unavailable-roof', 'Vision processing for roof report requested but tools are not available', { taskId: context.taskId });
        }
      }

      // 4. Combine Results
      if (!textMeasurements && !visionMeasurements) {
        throw new Error('Both text and vision extraction failed to produce roof measurements.');
      }
      const finalMeasurements = this.combineRoofMeasurements(textMeasurements, visionMeasurements, textConfidence);
      const overallConfidence = this.getOverallMeasurementConfidence(finalMeasurements);

      this.log(LogLevel.SUCCESS, 'roof-extraction-complete', 
        `Roof report extraction completed with overall confidence: ${overallConfidence.toFixed(3)}`,
        { taskId: context.taskId, overallConfidence }
      );

      return {
        data: finalMeasurements,
        validation: await this.validate(finalMeasurements, context),
        processingTimeMs: 0, // Set by base Agent
        model: visionMeasurements && textMeasurements ? 'hybrid' : (visionMeasurements ? 'vision' : 'text')
      };

    } catch (error) {
      this.log(LogLevel.ERROR, 'roof-extraction-failed', `Roof report extraction failed: ${error}`, { taskId: context.taskId, error });
      throw error;
    }
  }

  private async extractMeasurementsFromText(text: string, context: TaskContext): Promise<RoofMeasurements> {
    this.log(LogLevel.DEBUG, 'text-parse-roof-measurements', 'Parsing roof measurements from text via AI', { taskId: context.taskId });
    const config = (await this.getAIConfigs(['extract_roof_measurements_text'])).extract_roof_measurements_text;
    if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-roof-text-config', 'AI config for text-based roof measurement extraction is missing.');
      return this.createEmptyRoofMeasurements('Missing AI config for text extraction');
    }

    const prompt = `${config.prompt}\n\nRoof Report Text:\n${text}`;
    const aiResponse = await this.callAI(config, prompt, context.taskId || 'unknown-task');

    try {
      const parsed = JSON.parse(aiResponse);
      // TODO: Add more robust parsing and validation for each field from parsed JSON
      return {
        totalRoofArea: this.createExtractedField(parsed.totalRoofArea || 0, 0.7, 'Parsed from text AI', 'text'),
        eaveLength: this.createExtractedField(parsed.eaveLength || 0, 0.7, 'Parsed from text AI', 'text'),
        rakeLength: this.createExtractedField(parsed.rakeLength || 0, 0.7, 'Parsed from text AI', 'text'),
        ridgeHipLength: this.createExtractedField(parsed.ridgeHipLength || 0, 0.7, 'Parsed from text AI', 'text'),
        valleyLength: this.createExtractedField(parsed.valleyLength || 0, 0.7, 'Parsed from text AI', 'text'),
        stories: this.createExtractedField(parsed.stories || 1, 0.6, 'Parsed from text AI', 'text'),
        pitch: this.createExtractedField(parsed.pitch || '', 0.6, 'Parsed from text AI', 'text'),
        facets: this.createExtractedField(parsed.facets || 0, 0.5, 'Parsed from text AI', 'text'),
      };
    } catch (error) {
      this.log(LogLevel.ERROR, 'text-roof-parse-error', `Failed to parse roof measurements JSON from text: ${error}. Raw: ${aiResponse.substring(0, 200)}`, { error });
      return this.createEmptyRoofMeasurements(`AI response parsing error: ${error}`);
    }
  }

  private async extractMeasurementsFromVision(pdfBuffer: Buffer, context: TaskContext): Promise<RoofMeasurements> {
    this.log(LogLevel.DEBUG, 'vision-parse-roof-measurements', 'Parsing roof measurements from vision via AI', { taskId: context.taskId });
    const imageOptions: PDFToImagesOptions = { dpi: 300, format: 'jpg', quality: 85 };
    const imageDataUrls = await PDFToImagesTool.convertPDFToDataURLs(pdfBuffer, imageOptions);
    this.log(LogLevel.INFO, 'pdf-converted-vision-roof', `PDF converted to ${imageDataUrls.length} images for roof vision processing`, { taskId: context.taskId });

    const visionProvider = this.anthropic ? 'anthropic' : (this.openai ? 'openai' : null);
    if (!visionProvider) throw new Error('No vision AI provider (Anthropic or OpenAI) is configured.');

    const aiConfigKey = 'extract_roof_measurements_vision';
    const config = (await this.getAIConfigs([aiConfigKey]))[aiConfigKey];
     if (!config || !config.prompt) {
      this.log(LogLevel.WARN, 'missing-roof-vision-config', 'AI config for vision-based roof measurement extraction is missing.');
      return this.createEmptyRoofMeasurements('Missing AI config for vision extraction');
    }

    const visionModelConfig: VisionModelConfig = {
      provider: visionProvider,
      model: config.model_name || (visionProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'),
      maxTokens: config.max_tokens || 2000,
      temperature: config.temperature || 0.1,
    };
    
    // Tailor prompt for roof measurements
    const prompt = `${config.prompt}\n\nAnalyze the following roof report images (could be tables, diagrams, or text) and extract these specific measurements. Be precise. Measurements are typically in feet or squares (1 square = 100 sq ft).\nReturn ONLY a JSON object with these keys:
{
  "totalRoofArea": number_or_null, // Total roof area in SQUARES (convert if necessary)
  "eaveLength": number_or_null, // Total length of eaves in FEET
  "rakeLength": number_or_null, // Total length of rakes in FEET
  "ridgeHipLength": number_or_null, // Total length of ridges and hips combined in FEET
  "valleyLength": number_or_null, // Total length of valleys in FEET
  "stories": number_or_null, // Number of stories (e.g., 1, 2)
  "pitch": "string_value_or_null", // Predominant roof pitch (e.g., "7/12")
  "facets": number_or_null // Number of distinct roof facets/planes
}
If a value is not found or unclear, use null. Convert square feet to squares for totalRoofArea if original is in SF.`;

    const visionResult = await this.visionProcessor.analyzeImages(imageDataUrls, prompt, visionModelConfig);
    this.log(LogLevel.INFO, 'vision-analysis-roof-complete', 
      `Vision analysis for roof report completed. Model: ${visionResult.model}, Confidence: ${visionResult.confidence.toFixed(3)}`,
      { taskId: context.taskId, model: visionResult.model, confidence: visionResult.confidence }
    );

    try {
      const parsed = JSON.parse(visionResult.extractedText.replace(/,(?=\s*\})/g, '')); // Robust parsing
      return {
        totalRoofArea: this.createExtractedField(parsed.totalRoofArea, visionResult.confidence, 'Extracted via vision', 'vision'),
        eaveLength: this.createExtractedField(parsed.eaveLength, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        rakeLength: this.createExtractedField(parsed.rakeLength, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        ridgeHipLength: this.createExtractedField(parsed.ridgeHipLength, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        valleyLength: this.createExtractedField(parsed.valleyLength, visionResult.confidence * 0.9, 'Extracted via vision', 'vision'),
        stories: this.createExtractedField(parsed.stories, visionResult.confidence * 0.8, 'Extracted via vision', 'vision'),
        pitch: this.createExtractedField(parsed.pitch, visionResult.confidence * 0.85, 'Extracted via vision', 'vision'),
        facets: this.createExtractedField(parsed.facets, visionResult.confidence * 0.7, 'Extracted via vision', 'vision'),
      };
    } catch (error) {
      this.log(LogLevel.ERROR, 'vision-roof-parse-error', `Failed to parse roof measurements JSON from vision: ${error}. Raw: ${visionResult.extractedText.substring(0,200)}`, { error });
      return this.createEmptyRoofMeasurements(`Vision AI response parsing error: ${error}`);
    }
  }

  private combineRoofMeasurements(
    textResults: RoofMeasurements | null,
    visionResults: RoofMeasurements | null,
    textQuality: number
  ): RoofMeasurements {
    if (!textResults && !visionResults) return this.createEmptyRoofMeasurements('No data from text or vision for roof report');
    if (!visionResults) return textResults!;
    if (!textResults) return visionResults!;

    // Prefer vision for roof reports if available due to diagrams, but use text as strong supplement
    const combined: any = {};
    for (const key in visionResults) {
      const typedKey = key as keyof RoofMeasurements;
      const visionField = visionResults[typedKey];
      const textField = textResults[typedKey];
      
      if (textField.confidence > visionField.confidence + 0.15 && textQuality > 0.6) {
        combined[typedKey] = { ...textField, source: 'hybrid' as const };
      } else {
        combined[typedKey] = { ...visionField, source: 'hybrid' as const };
      }
    }
    return combined as RoofMeasurements;
  }
  
  private calculateTextQuality(text: string): number {
    if (!text || text.trim().length < 50) return 0.1;
    const printableChars = text.replace(/[^\x20-\x7E\n\r\t]/g, '').length;
    const printableRatio = printableChars / text.length;
    const structureIndicators = [/area/i, /pitch/i, /eave/i, /rake/i, /ridge/i, /valley/i, /total/i, /length/i, /measurement/i, /sq ft/i, /summary/i, /SF/i, /LF/i];
    let structureScore = 0;
    for (const indicator of structureIndicators) {
      if (indicator.test(text)) structureScore += 0.05;
    }
    structureScore = Math.min(0.5, structureScore);
    const wordCount = text.trim().split(/\s+/).length;
    const wordScore = Math.min(0.2, wordCount / 1500); // Roof reports can be shorter
    return Math.min(0.95, printableRatio * 0.5 + structureScore + wordScore);
  }

  private getOverallMeasurementConfidence(measurements: RoofMeasurements | null): number {
    if (!measurements) return 0;
    const fields = [
      measurements.totalRoofArea,
      measurements.eaveLength,
      measurements.rakeLength,
      measurements.ridgeHipLength,
      measurements.valleyLength,
      measurements.pitch,
      measurements.stories
    ];
    const validFields = fields.filter(f => f && f.value !== null && f.value !== undefined && (typeof f.value !== 'string' || f.value.trim() !== '') && f.confidence > 0.2);
    if (validFields.length === 0) return 0.1;
    return validFields.reduce((sum, field) => sum + (field?.confidence || 0), 0) / validFields.length;
  }
  
  private createEmptyRoofMeasurements(rationaleSuffix: string = ''): RoofMeasurements {
    const rationale = `Data not available. ${rationaleSuffix}`.trim();
    return {
        totalRoofArea: this.createExtractedField(0, 0.01, rationale, 'fallback'),
        eaveLength: this.createExtractedField(0, 0.01, rationale, 'fallback'),
        rakeLength: this.createExtractedField(0, 0.01, rationale, 'fallback'),
        ridgeHipLength: this.createExtractedField(0, 0.01, rationale, 'fallback'),
        valleyLength: this.createExtractedField(0, 0.01, rationale, 'fallback'),
        stories: this.createExtractedField(1, 0.01, rationale, 'fallback'), // Default to 1 story
        pitch: this.createExtractedField('', 0.01, rationale, 'fallback'),
        facets: this.createExtractedField(0, 0.01, rationale, 'fallback'),
    };
  }

  async validate(result: RoofMeasurements, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-roof-report', `Validating roof report for task ${context.taskId}`);
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    const overallConfidence = this.getOverallMeasurementConfidence(result);

    if (!result.totalRoofArea?.value || result.totalRoofArea.value <= 0) {
        warnings.push('Total roof area is missing, zero, or invalid.');
    } else if (result.totalRoofArea.value < 5) { // 5 squares is a very small roof
        warnings.push(`Total roof area (${result.totalRoofArea.value} sq) seems very small. Please verify.`);
    }

    if (!result.pitch?.value || result.pitch.value.trim() === '') {
        warnings.push('Roof pitch is missing.');
    } else if (!/^(\d{1,2}(?:\.\d{1,2})?)\/12$/.test(result.pitch.value) && !/^\d{1,2}$/.test(result.pitch.value)) {
        warnings.push(`Roof pitch format (${result.pitch.value}) is unusual. Expected X/12 or just X.`);
    }

    if (!result.stories?.value || result.stories.value <= 0) {
        warnings.push('Number of stories is missing or invalid.');
    } else if (result.stories.value > 5) {
         warnings.push(`Number of stories (${result.stories.value}) seems high. Please verify.`);
    }

    // Basic consistency checks for linear measurements if area exists
    if (result.totalRoofArea?.value && result.totalRoofArea.value > 0) {
        const linearMeasurements = [
            result.eaveLength?.value || 0,
            result.rakeLength?.value || 0,
            result.ridgeHipLength?.value || 0,
            result.valleyLength?.value || 0
        ];
        const totalLinear = linearMeasurements.reduce((sum, len) => sum + len, 0);
        if (totalLinear <= 0) {
            warnings.push('Linear measurements (eaves, rakes, ridges, valleys) are missing or zero, but roof area is present.');
        }
        // Heuristic: total linear feet should roughly be related to sqrt(area_in_sq_ft)
        // Area in sq ft = area in squares * 100
        const expectedMinLinear = Math.sqrt(result.totalRoofArea.value * 100) * 2; // Very rough lower bound
        if (totalLinear > 0 && totalLinear < expectedMinLinear && result.totalRoofArea.value > 10) {
            warnings.push(`Total linear measurements (${totalLinear} LF) seem low for the reported roof area (${result.totalRoofArea.value} sq).`);
        }
    }
    
    if (overallConfidence < this.config.confidenceThreshold) {
        suggestions.push(`Overall confidence (${overallConfidence.toFixed(2)}) is below threshold (${this.config.confidenceThreshold}). Manual review recommended.`);
    }

    return {
      isValid: errors.length === 0, // No hard errors for now, mostly warnings
      confidence: overallConfidence,
      errors,
      warnings,
      suggestions
    };
  }

  // Helper to create ExtractedField, ensuring confidence is within bounds
  private createExtractedField<T>(
    value: T,
    confidence: number,
    rationale: string,
    source: 'text' | 'vision' | 'hybrid' | 'fallback',
    attempts: number = 1
  ): ExtractedField<T> {
    return {
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      rationale,
      source,
      attempts
    };
  }
  
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-roof-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`)
    const configs: Record<string, AIConfig> = {};
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single()

      if (error) {
        this.log(LogLevel.WARN, 'roof-config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`)
        configs[stepName] = {
            step_name: stepName,
            prompt: `Extract relevant data for ${stepName.replace(/_/g, ' ')} from the provided roof report text or images. Focus on accuracy and standard roofing terminology. Return JSON.`, 
            model_provider: 'anthropic',
            model_name: 'claude-3-haiku-20240307',
            temperature: 0.2,
            max_tokens: 1500,
        }; 
      } else if (data) {
        configs[stepName] = data as AIConfig
      } else {
         this.log(LogLevel.WARN, 'roof-config-not-found', `AI config not found for ${stepName}, using default.`);
         configs[stepName] = {
            step_name: stepName,
            prompt: `Extract data for ${stepName.replace(/_/g, ' ')} from roof report. Return JSON.`, 
            model_provider: 'anthropic', 
            model_name: 'claude-3-haiku-20240307',
            temperature: 0.2,
            max_tokens: 1500,
        }; 
      }
    }
    return configs;
  }

  private async callAI(config: AIConfig, prompt: string, jobId: string): Promise<string> {
    this.log(LogLevel.DEBUG, 'roof-ai-call-start', `Calling ${config.model_provider} model ${config.model_name} for task ${jobId}`);
    const startTime = Date.now();
    try {
      let responseText = '';
      if (config.model_provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: config.model_name || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: config.max_tokens || 1500,
          temperature: config.temperature || 0.2,
          response_format: { type: "json_object" }, // Request JSON output if supported
        });
        responseText = response.choices[0]?.message?.content || ''
      } else if (config.model_provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: config.model_name || 'claude-3-haiku-20240307',
          max_tokens: config.max_tokens || 1500,
          temperature: config.temperature || 0.2,
          messages: [{ role: 'user', content: prompt }]
        });
        // Ensure we handle cases where content is an array (though for single user message, it usually isn't)
        responseText = Array.isArray(response.content) && response.content[0]?.type === 'text' ? response.content[0].text : '';
      } else {
        throw new Error(`Unsupported AI provider or client not initialized for roof report: ${config.model_provider}`)
      }
      
      const duration = Date.now() - startTime;
      this.log(LogLevel.INFO, 'roof-ai-call-success', 
        `${config.model_provider} call for ${jobId} completed in ${duration}ms. Output length: ${responseText.length}`,
        { duration, outputLength: responseText.length, provider: config.model_provider, model: config.model_name }
      )
      return responseText;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(LogLevel.ERROR, 'roof-ai-call-error', 
        `${config.model_provider} call for ${jobId} failed after ${duration}ms: ${error}`,
        { duration, error, provider: config.model_provider, model: config.model_name }
      )
      throw error;
    }
  }
} 