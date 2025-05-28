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
  AIConfig,
  AgentTask
} from './types';
// Assuming PDFProcessor is simplified or its type definition needs to be visible here
// For now, let's assume a simplified structure for PDFProcessor and VisionModelProcessor outputs if not fully typed elsewhere
interface SimpleTextExtractionResult { text: string; model?: string; }
interface SimpleVisionAnalysisResult { extractedText: string; jsonOutput?: any; model?: string; confidence: number; }

import { PDFProcessor } from '@/lib/pdf-processor'; // Will assume it has a static extractText method for now
import { VisionModelProcessor, VisionModelConfig } from '@/tools/vision-models';
import { PDFToImagesTool, PDFToImagesOptions } from '@/tools/pdf-to-images';
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';

interface RoofReportExtractorInput {
  pdfBuffer: Buffer;
  jobId: string;
  strategy?: ExtractionStrategy;
}

/**
 * RoofReportExtractorAgent is responsible for extracting detailed roof measurement data
 * from PDF documents (typically roof reports from services like EagleView or Hover).
 */
export class RoofReportExtractorAgent extends Agent {
  private supabase = getSupabaseClient();
  private visionProcessor: VisionModelProcessor;
  // PDFToImagesTool methods are static, so an instance might not be needed unless it has state.
  // private pdfToImagesTool: PDFToImagesTool;
  // openai and anthropic are now inherited from the base Agent class
  // private openai: OpenAI | null = null;
  // private anthropic: Anthropic | null = null;

  constructor() {
    const config: AgentConfig = {
      name: 'RoofReportExtractorAgent',
      version: '1.0.0',
      capabilities: ['roof_measurement_extraction', 'pdf_parsing', 'vision_analysis', 'data_normalization'],
      defaultTimeout: 180000, // 3 minutes
      maxRetries: 2,
      confidenceThreshold: 0.7,
      tools: ['PDFProcessor', 'VisionModelProcessor', 'PDFToImagesTool']
    };
    super(config);
    this.visionProcessor = new VisionModelProcessor();
    // this.pdfToImagesTool = new PDFToImagesTool(); // Static methods typically don't need instantiation

    // AI clients are initialized in the base Agent constructor
    // if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
    //     this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // }
    // if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    //     this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // }
  }

  get agentType(): AgentType {
    return AgentType.ROOF_REPORT_EXTRACTOR;
  }

  async plan(input: RoofReportExtractorInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-roof-extraction', `Planning roof report extraction for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const tasks: AgentTask[] = [];
    const strategy = input.strategy || ExtractionStrategy.HYBRID;

    if (strategy === ExtractionStrategy.TEXT_ONLY || strategy === ExtractionStrategy.HYBRID || strategy === ExtractionStrategy.FALLBACK) {
      tasks.push({
        id: uuidv4(),
        type: 'extract_text_from_roof_pdf',
        input: { pdfBuffer: input.pdfBuffer },
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 1 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      tasks.push({
        id: uuidv4(),
        type: 'extract_fields_from_roof_text',
        input: null, // Depends on previous task
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: 2 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (strategy === ExtractionStrategy.VISION_ONLY || strategy === ExtractionStrategy.HYBRID || strategy === ExtractionStrategy.FALLBACK) {
      tasks.push({
        id: uuidv4(),
        type: 'convert_pdf_to_images_roof',
        input: { pdfBuffer: input.pdfBuffer },
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: strategy === ExtractionStrategy.VISION_ONLY ? 1 : 2 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      tasks.push({
        id: uuidv4(),
        type: 'extract_fields_from_roof_vision',
        input: null, // Will depend on image conversion task
        context: { ...context, taskId: uuidv4(), parentTaskId: context.taskId, jobId: input.jobId, priority: strategy === ExtractionStrategy.VISION_ONLY ? 2 : 3 },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return {
      tasks,
      dependencies: new Map(), // Simplified for now; can add dependencies between text/vision field extraction tasks
      estimatedDuration: 90000,
      confidence: 0.85
    };
  }

  async act(input: RoofReportExtractorInput, context: TaskContext): Promise<AgentResult<RoofMeasurements>> {
    this.log(LogLevel.INFO, 'roof-extraction-start', `Starting roof report extraction for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const { pdfBuffer, jobId, strategy = ExtractionStrategy.HYBRID } = input;

    let textContent: string | null = null;
    let visionJsonOutput: any | null = null; // For parsed JSON from vision
    let textBasedMeasurements: Partial<RoofMeasurements> = {};
    let visionBasedMeasurements: Partial<RoofMeasurements> = {};

    const errors: string[] = [];

    // Text Extraction (if applicable)
    if (strategy === ExtractionStrategy.TEXT_ONLY || strategy === ExtractionStrategy.HYBRID || strategy === ExtractionStrategy.FALLBACK) {
      try {
        this.log(LogLevel.DEBUG, 'roof-text-extraction', `Attempting text extraction from roof report for job ${jobId}`, { agentType: this.agentType });
        // Assuming PDFProcessor.extractText is a static method returning a string
        textContent = await PDFProcessor.extractText(pdfBuffer);
        if (textContent && textContent.length > 100) { // Basic check for meaningful text
          this.log(LogLevel.INFO, 'roof-text-extracted', `Text extracted successfully. Length: ${textContent.length}`, { agentType: this.agentType });
          textBasedMeasurements = await this.extractFieldsFromText(textContent, jobId);
        } else {
          this.log(LogLevel.WARN, 'roof-text-extraction-poor', 'Extracted text from roof report is minimal or empty.', { agentType: this.agentType });
          if (strategy === ExtractionStrategy.TEXT_ONLY) errors.push('Text extraction yielded minimal content, and strategy is TEXT_ONLY.');
        }
      } catch (error: any) {
        this.log(LogLevel.ERROR, 'roof-text-extraction-failed', `Text extraction from roof report failed: ${error.message}`, { error: error.toString(), agentType: this.agentType });
        errors.push(`Text extraction failed: ${error.message}`);
        if (strategy === ExtractionStrategy.TEXT_ONLY) throw new Error('Critical text extraction failure in TEXT_ONLY mode.');
      }
    }

    // Vision Extraction (if applicable or as fallback)
    const needsVision = strategy === ExtractionStrategy.VISION_ONLY || 
                        (strategy === ExtractionStrategy.HYBRID && !this.isSufficient(textBasedMeasurements)) ||
                        (strategy === ExtractionStrategy.FALLBACK && !this.isSufficient(textBasedMeasurements));

    if (needsVision && (this.openai || this.anthropic)) {
      try {
        this.log(LogLevel.DEBUG, 'roof-vision-conversion-to-images', `Converting PDF to images for vision analysis for job ${jobId}`, { agentType: this.agentType });
        const imageOptions: PDFToImagesOptions = { dpi: 200, format: 'jpg', quality: 80 };
        const imageDataUrls = await PDFToImagesTool.convertPDFToDataURLs(pdfBuffer, imageOptions);
        
        if (!imageDataUrls || imageDataUrls.length === 0) {
            this.log(LogLevel.WARN, 'pdf-to-images-failed-roof', 'PDF to images conversion yielded no images.', { agentType: this.agentType });
            errors.push('PDF to images conversion failed for vision analysis.');
            if (strategy === ExtractionStrategy.VISION_ONLY) throw new Error('Critical PDF to images failure in VISION_ONLY mode.');
        } else {
            this.log(LogLevel.DEBUG, 'roof-vision-extraction', `Attempting vision extraction from ${imageDataUrls.length} images for job ${jobId}`, { agentType: this.agentType });
            
            // Determine preferred provider and model for Vision
            const preferredProvider = this.anthropic ? 'anthropic' : 'openai';
            const preferredModel = preferredProvider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4-turbo-preview'; // Or gpt-4o

            const visionModelConfig: VisionModelConfig = {
                provider: preferredProvider,
                model: preferredModel,
                maxTokens: 1500,
                temperature: 0.3
            };

            const visionAnalysisResult: SimpleVisionAnalysisResult = await this.visionProcessor.analyzeImages(imageDataUrls, "Extract all roof measurement details... Respond in JSON.", visionModelConfig);
            
            if (visionAnalysisResult && visionAnalysisResult.extractedText) {
                try {
                    visionJsonOutput = JSON.parse(visionAnalysisResult.extractedText);
                    this.log(LogLevel.INFO, 'roof-vision-extracted-parsed', `Vision analysis of roof report completed and text parsed as JSON.`, { agentType: this.agentType });
                    visionBasedMeasurements = this.parseVisionOutput(visionJsonOutput);
                } catch (parseError: any) {
                    this.log(LogLevel.WARN, 'roof-vision-json-parse-failed', `Failed to parse vision extractedText as JSON: ${parseError.message}. Proceeding with vision text for text-based field extraction as fallback.`, { rawText: visionAnalysisResult.extractedText.substring(0, 200), agentType: this.agentType });
                    visionBasedMeasurements = await this.extractFieldsFromText(visionAnalysisResult.extractedText, jobId, 'hybrid'); 
                }
            } else if (visionAnalysisResult && visionAnalysisResult.jsonOutput) { 
                this.log(LogLevel.INFO, 'roof-vision-extracted-direct-json', `Vision analysis of roof report completed with direct JSON output.`, { agentType: this.agentType });
                visionBasedMeasurements = this.parseVisionOutput(visionAnalysisResult.jsonOutput);
            } else {
              this.log(LogLevel.WARN, 'roof-vision-extraction-poor', 'Vision analysis of roof report did not yield structured JSON output or text.', { agentType: this.agentType });
              if (strategy === ExtractionStrategy.VISION_ONLY) errors.push('Vision extraction failed to produce structured data, and strategy is VISION_ONLY.');
            }
        }
      } catch (error: any) {
        this.log(LogLevel.ERROR, 'roof-vision-extraction-failed', `Vision extraction from roof report failed: ${error.message}`, { error: error.toString(), agentType: this.agentType });
        errors.push(`Vision extraction failed: ${error.message}`);
        if (strategy === ExtractionStrategy.VISION_ONLY) throw new Error('Critical vision extraction failure in VISION_ONLY mode.');
      }
    }

    const combinedMeasurements = this.combineExtractions(textBasedMeasurements, visionBasedMeasurements, strategy);
    const validation = await this.validate(combinedMeasurements, context);
    
    if (errors.length > 0) validation.errors.push(...errors);
    if (!validation.isValid && validation.confidence < 0.5) {
        this.log(LogLevel.ERROR, 'roof-extraction-failed-validation', 'Roof report extraction failed validation with low confidence.', { validation, agentType: this.agentType });
    } else if (!validation.isValid) {
        this.log(LogLevel.WARN, 'roof-extraction-validation-issues', 'Roof report extraction completed with validation issues.', { validation, agentType: this.agentType });
    }

    return {
      data: combinedMeasurements,
      validation,
      processingTimeMs: 0, // Will be set by base Agent
      model: this.determineModelUsed(textContent, visionJsonOutput)
    };
  }
  
  private isSufficient(measurements: Partial<RoofMeasurements>): boolean {
    // Define what constitutes sufficient extraction from text alone
    return !!(measurements.totalRoofArea?.value && measurements.pitch?.value);
  }

  private async extractFieldsFromText(text: string, jobId: string, sourceOverride?: ExtractedField<any>['source']): Promise<Partial<RoofMeasurements>> {
    const effectiveSource = sourceOverride || 'text';
    this.log(LogLevel.DEBUG, 'extract-roof-fields-text', `Extracting roof fields from text (source: ${effectiveSource}) for job ${jobId}`, { agentType: this.agentType });
    const extracted: Partial<RoofMeasurements> = {};
    const configKey = 'extract_roof_measurements_text';
    
    try {
        const aiConfig = (await this.getAIConfigs([configKey]))[configKey];
        if (!aiConfig || !aiConfig.prompt) {
            this.log(LogLevel.WARN, 'no-text-config-roof', `AI config for ${configKey} not found or no prompt. Skipping AI extraction from text (source: ${effectiveSource}).`, { agentType: this.agentType });
            return extracted;
        }
        const prompt = aiConfig.prompt.replace('{{TEXT_CONTENT}}', text);
        const response = await this.callAI(aiConfig, prompt, jobId, AgentType.ROOF_REPORT_EXTRACTOR);
        const parsedResponse = JSON.parse(response); 

        extracted.totalRoofArea = this.createExtractedField(parsedResponse.totalRoofArea, 0.7, effectiveSource);
        extracted.eaveLength = this.createExtractedField(parsedResponse.eaveLength, 0.7, effectiveSource);
        extracted.rakeLength = this.createExtractedField(parsedResponse.rakeLength, 0.7, effectiveSource);
        extracted.ridgeHipLength = this.createExtractedField(parsedResponse.ridgeHipLength, 0.7, effectiveSource);
        extracted.valleyLength = this.createExtractedField(parsedResponse.valleyLength, 0.7, effectiveSource);
        extracted.stories = this.createExtractedField(
          parsedResponse.stories ? Math.round(Number(parsedResponse.stories)) : null, 
          0.7, 
          effectiveSource
        );
        extracted.pitch = this.createExtractedField(parsedResponse.pitch, 0.7, effectiveSource);
        extracted.facets = this.createExtractedField(parsedResponse.facets, 0.6, effectiveSource);
        
        this.log(LogLevel.INFO, 'roof-fields-extracted-text', `Roof fields extracted from text (source: ${effectiveSource}).`, { extractedFields: Object.keys(parsedResponse), agentType: this.agentType });
    } catch (error: any) {
        this.log(LogLevel.ERROR, 'extract-roof-fields-text-error', `Error extracting roof fields from text (source: ${effectiveSource}): ${error.message}`, { error: error.toString(), agentType: this.agentType });
    }
    return extracted;
  }

  private parseVisionOutput(visionJson: any): Partial<RoofMeasurements> {
    this.log(LogLevel.DEBUG, 'parse-roof-vision-output', `Parsing vision output for roof measurements.`, { visionJsonOutputKeys: Object.keys(visionJson), agentType: this.agentType });
    const extracted: Partial<RoofMeasurements> = {};
    extracted.totalRoofArea = this.createExtractedField(visionJson.total_roof_area || visionJson.totalRoofArea, 0.8, 'vision');
    extracted.eaveLength = this.createExtractedField(visionJson.eave_length || visionJson.eaveLength, 0.8, 'vision');
    extracted.rakeLength = this.createExtractedField(visionJson.rake_length || visionJson.rakeLength, 0.8, 'vision');
    extracted.ridgeHipLength = this.createExtractedField(visionJson.ridge_hip_length || visionJson.ridgeHipLength, 0.8, 'vision');
    extracted.valleyLength = this.createExtractedField(visionJson.valley_length || visionJson.valleyLength, 0.8, 'vision');
    extracted.stories = this.createExtractedField(
      visionJson.stories ? Math.round(Number(visionJson.stories)) : null, 
      0.8, 
      'vision'
    );
    extracted.pitch = this.createExtractedField(visionJson.pitch, 0.8, 'vision');
    extracted.facets = this.createExtractedField(visionJson.facets, 0.7, 'vision');
    this.log(LogLevel.INFO, 'roof-fields-parsed-vision', `Roof fields parsed from vision output.`, { parsedFields: Object.keys(extracted).filter(k => (extracted as any)[k]?.value !== null), agentType: this.agentType });
    return extracted;
  }

  private combineExtractions(
    textData: Partial<RoofMeasurements>,
    visionData: Partial<RoofMeasurements>,
    strategy: ExtractionStrategy
  ): RoofMeasurements {
    this.log(LogLevel.DEBUG, 'combine-roof-extractions', `Combining text and vision roof extractions with strategy: ${strategy}`, { agentType: this.agentType });
    const combined: Partial<RoofMeasurements> = {};
    const fields: (keyof RoofMeasurements)[] = ['totalRoofArea', 'eaveLength', 'rakeLength', 'ridgeHipLength', 'valleyLength', 'stories', 'pitch', 'facets'];

    for (const field of fields) {
      const textFieldItem = textData[field] as ExtractedField<any> | undefined;
      const visionFieldItem = visionData[field] as ExtractedField<any> | undefined;

      if (strategy === ExtractionStrategy.TEXT_ONLY) {
        combined[field] = textFieldItem || this.createFallbackField(field);
      } else if (strategy === ExtractionStrategy.VISION_ONLY) {
        combined[field] = visionFieldItem || this.createFallbackField(field);
      } else { // HYBRID or FALLBACK
        if (textFieldItem?.value !== null && textFieldItem?.value !== undefined && visionFieldItem?.value !== null && visionFieldItem?.value !== undefined) {
          // Both have values, prefer vision if confidence is similar or higher, or average, or take highest confidence
          if (visionFieldItem.confidence >= (textFieldItem.confidence - 0.1)) {
            combined[field] = {...visionFieldItem, source: 'hybrid', confidence: Math.max(textFieldItem.confidence, visionFieldItem.confidence), rationale: `Combined from text (conf: ${textFieldItem.confidence.toFixed(2)}) and vision (conf: ${visionFieldItem.confidence.toFixed(2)})` };
          } else {
            combined[field] = {...textFieldItem, source: 'hybrid', confidence: Math.max(textFieldItem.confidence, visionFieldItem.confidence), rationale: `Combined from text (conf: ${textFieldItem.confidence.toFixed(2)}) and vision (conf: ${visionFieldItem.confidence.toFixed(2)})` };
          }
        } else if (visionFieldItem?.value !== null && visionFieldItem?.value !== undefined) {
          combined[field] = visionFieldItem;
        } else if (textFieldItem?.value !== null && textFieldItem?.value !== undefined) {
          combined[field] = textFieldItem;
        } else {
          combined[field] = this.createFallbackField(field);
        }
      }
    }
    this.log(LogLevel.INFO, 'roof-extractions-combined', `Roof extractions combined.`, { finalFieldsPresent: Object.keys(combined).filter(k=> (combined as any)[k]?.value !== null), agentType: this.agentType });
    return combined as RoofMeasurements; // Cast, assuming all fields are now set (even if fallback)
  }
  
  private createExtractedField<T>(value: T | null | undefined, confidence: number, source: ExtractedField<T>['source'], rationale?: string): ExtractedField<T | null> {
    const validValue = !(value === undefined || value === null || (typeof value === 'string' && value.trim() === ''));
    return {
      value: validValue ? value : null,
      confidence: validValue ? confidence : 0,
      rationale: rationale || (validValue ? `Extracted via ${source}` : 'Not found or empty'),
      source,
      attempts: 1
    };
  }

  private createFallbackField(fieldName: keyof RoofMeasurements): ExtractedField<any | null> {
    return {
        value: null,
        confidence: 0,
        rationale: `Field '${fieldName}' not found by any extraction method.`,
        source: 'fallback',
        attempts: 0
    };
  }

  async validate(result: RoofMeasurements, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-roof-measurements', `Validating extracted roof measurements for job ${context.jobId}`, { agentType: this.agentType });
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Track successful extractions for confidence calculation
    let validFieldCount = 0;
    let totalFieldConfidence = 0;
    let criticalFieldCount = 0;
    let validCriticalFieldCount = 0;

    const checkNumField = (field: ExtractedField<number | null> | undefined, name: string, critical: boolean = false, minVal: number = 0) => {
      if (critical) criticalFieldCount++;
      
      if (!field || field.value === null || field.value === undefined) {
        if (critical) errors.push(`${name} is missing or null.`);
        else warnings.push(`${name} is missing or null.`);
      } else if (typeof field.value !== 'number' || field.value < minVal) {
        errors.push(`${name} has an invalid value: ${field.value}. Must be a number >= ${minVal}.`);
      } else {
        // Valid field found
        validFieldCount++;
        totalFieldConfidence += field.confidence;
        if (critical) validCriticalFieldCount++;
        
        if (field.confidence < 0.5) {
          warnings.push(`${name} has low confidence: ${field.confidence.toFixed(2)}.`);
        }
      }
    };

    const checkStringField = (
      field: ExtractedField<string | null> | undefined,
      name: string,
      critical: boolean = false,
      pattern?: RegExp
    ) => {
      if (critical) criticalFieldCount++;
      
      const value = field?.value;
      const isMissing =
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '') ||
        (typeof value !== 'string'); // treat non-strings as missing for a string field

      if (isMissing) {
        if (critical) errors.push(`${name} is missing or empty.`);
        else warnings.push(`${name} is missing or empty.`);
        return;
      }

      // From here down we know value is a non-empty string.
      const strVal = value as string;

      if (pattern && !pattern.test(strVal)) {
        errors.push(`${name} has an invalid format: ${strVal}. Expected pattern: ${pattern.toString()}`);
      } else {
        // Valid field found
        validFieldCount++;
        totalFieldConfidence += field?.confidence || 0;
        if (critical) validCriticalFieldCount++;
        
        if (field && field.confidence < 0.5) {
          warnings.push(`${name} has low confidence: ${field.confidence.toFixed(2)}.`);
        }
      }
    };
    
    checkNumField(result.totalRoofArea, 'Total Roof Area', true, 1); // e.g. min 1 square
    // Pitch is a string like "7/12" or just a number like "7"
    checkStringField(result.pitch, 'Pitch', true, /^(\d{1,2}(?:\.\d{1,2})?)(?:\/12)?$/ ); 
    checkNumField(result.stories, 'Stories', false, 1);
    checkNumField(result.eaveLength, 'Eave Length', false);
    checkNumField(result.rakeLength, 'Rake Length', false);
    checkNumField(result.ridgeHipLength, 'Ridge/Hip Length', false);
    checkNumField(result.valleyLength, 'Valley Length', false);

    // Calculate overall confidence based on successful extractions
    let overallConfidence = 0.3; // Base confidence
    
    if (validFieldCount > 0) {
      // Average confidence of successfully extracted fields
      const avgFieldConfidence = totalFieldConfidence / validFieldCount;
      overallConfidence = avgFieldConfidence;
      
      // Bonus for having critical fields
      if (criticalFieldCount > 0) {
        const criticalFieldRatio = validCriticalFieldCount / criticalFieldCount;
        overallConfidence = overallConfidence * 0.7 + criticalFieldRatio * 0.3;
      }
      
      // Penalty for having errors (but don't drop below 0.2 if we have valid fields)
      if (errors.length > 0) {
        overallConfidence = Math.max(0.2, overallConfidence * 0.7);
      }
    }
    
    // Sanity check for roof area vs linear measurements
    if (result.totalRoofArea?.value && (result.eaveLength?.value || result.rakeLength?.value)) {
        if ((result.eaveLength?.value || 0) + (result.rakeLength?.value || 0) > (result.totalRoofArea.value * 20)) { // area in squares * 20 ~ linear feet limit (very rough)
            warnings.push('Sum of eave and rake lengths seems unusually high compared to total roof area.');
            overallConfidence *= 0.9;
        }
    }

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0.1, Math.min(0.95, overallConfidence)),
      errors,
      warnings,
      suggestions: []
    };
  }
  
  private determineModelUsed(textContent: string | null, visionJsonOutput: any | null): string {
    const models: string[] = [];
    // This is a simplification; actual model names would come from text/vision processor results if they provide it
    if (textContent) models.push(`text_extraction_model`); 
    if (visionJsonOutput) models.push(`vision_extraction_model`);
    return models.length > 0 ? models.join(', ') : 'none';
  }

  protected async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-roof-extractor-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`, { agentType: this.agentType });
    const configs: Record<string, AIConfig> = {};
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single();

      if (error || !data) {
        this.log(LogLevel.WARN, 'roof-config-fetch-error', `Error fetching AI config for ${stepName} or config not found: ${error?.message || 'Not found'}. Using default.`, { agentType: this.agentType });
        configs[stepName] = {
          step_name: stepName,
          prompt: "Extract all roof measurement values from the following text. Focus on total area, eave, rake, ridge, hip, valley lengths, number of stories, and pitch. Provide output in a structured JSON format with keys like: totalRoofArea, eaveLength, rakeLength, ridgeHipLength, valleyLength, stories, pitch, facets. Ensure all values are numerical where appropriate. If a value is clearly a range (e.g. 6-7/12 pitch), use the lower end or a reasonable average. For stories, if like '1 to 1.5', use 1.5.\n\nTEXT CONTENT TO ANALYZE:\n{{TEXT_CONTENT}}",
          model_provider: this.anthropic ? 'anthropic' : 'openai',
          model_name: this.anthropic ? 'claude-3-haiku-20240307' : 'gpt-3.5-turbo', 
          temperature: 0.2,
          max_tokens: 1000,
          json_mode: true,
        };
      } else {
        configs[stepName] = data as AIConfig;
      }
    }
    return configs;
  }

} 