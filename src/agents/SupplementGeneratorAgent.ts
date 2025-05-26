import { Agent } from './Agent';
import {
  AgentType,
  AgentConfig,
  AgentResult,
  AgentExecutionPlan,
  TaskContext,
  ValidationResult,
  SupplementRecommendation,
  LogLevel,
  AIConfig,
  GeneratedSupplementItem,
  EstimateFieldExtractions,
  RoofMeasurements,
  DiscrepancyReport,
  SupplementGeneratorInput,
  SupplementGenerationOutput,
  ExtractedField,
  EstimateLineItem
} from './types';
import { DiscrepancyAnalysisOutput } from './DiscrepancyAnalyzerAgent'; // Input from previous agent
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';

interface SupplementGenerationInput {
  analysisOutput: AgentResult<DiscrepancyAnalysisOutput>;
  // Potentially include customer preferences, specific formatting rules, etc.
}

// Define the output structure for this agent
// For now, let's assume it generates a structured list of supplement text lines or objects
export interface SupplementGenerationOutput {
  generatedSupplements: GeneratedSupplementItem[];
  summary?: string; // Optional summary of generated items
  totalRecommendedValue?: number; // If pricing is integrated
}

/**
 * SupplementGeneratorAgent generates supplement items based on estimate data,
 * roof reports, and discrepancy analysis.
 */
export class SupplementGeneratorAgent extends Agent {
  private supabase = getSupabaseClient();
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor() {
    const config: AgentConfig = {
      name: 'SupplementGeneratorAgent',
      version: '1.0.0',
      capabilities: ['supplement_generation', 'rule_based_suggestions', 'ai_driven_itemization'],
      defaultTimeout: 60000, // 60 seconds for potentially complex generation
      maxRetries: 1,
      confidenceThreshold: 0.60, // Slightly lower, as supplements can be subjective and reviewed
      tools: []
    };
    super(config);

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  get agentType(): AgentType {
    return AgentType.SUPPLEMENT_GENERATOR;
  }

  async plan(input: SupplementGeneratorInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-supplement-generation', `Planning supplement generation for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const tasks = [
      {
        id: uuidv4(),
        type: 'generate_supplements',
        input: input,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    return {
      tasks,
      dependencies: new Map(),
      estimatedDuration: 35000, 
      confidence: 0.85
    };
  }

  async act(input: SupplementGeneratorInput, context: TaskContext): Promise<AgentResult<SupplementGenerationOutput>> {
    this.log(LogLevel.INFO, 'supplement-generation-start', `Starting supplement generation for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    
    const { estimateExtractionData, roofReportData, discrepancyReport, jobId } = input;
    let generatedSupplements: GeneratedSupplementItem[] = [];
    const supplementRationales: Record<string, string> = {};
    let issuesOrSuggestions: string[] = [];

    if (!this.openai && !this.anthropic) {
        this.log(LogLevel.ERROR, 'no-ai-provider-supplements', 'No AI provider configured for supplement generation. Cannot proceed.', { jobId, agentType: this.agentType });
        throw new Error('SupplementGeneratorAgent requires at least one AI provider (OpenAI or Anthropic) to be configured.');
    }

    try {
        const aiConfigKey = 'generate_supplement_items';
        const config = (await this.getAIConfigs([aiConfigKey]))[aiConfigKey];
        
        const prompt = this.constructSupplementPrompt(input, config.prompt);
        const aiResponse = await this.callAI(config, prompt, jobId);
        
        const parsedResponse = this.parseAISupplementResponse(aiResponse, jobId);
        generatedSupplements = parsedResponse.supplements;
        Object.assign(supplementRationales, parsedResponse.rationales);
        issuesOrSuggestions.push(...parsedResponse.issues);

    } catch (error) {
        this.log(LogLevel.ERROR, 'supplement-generation-error', `Core supplement generation failed: ${error}`, { jobId, error, agentType: this.agentType });
        issuesOrSuggestions.push(`Critical error during AI supplement generation: ${error instanceof Error ? error.message : String(error)}`);
        // Return empty but valid output to avoid crashing the whole flow if preferred
    }

    const overallConfidence = this.calculateOverallSupplementConfidence(generatedSupplements, issuesOrSuggestions);

    const output: SupplementGenerationOutput = {
      jobId,
      generatedSupplements,
      supplementRationales,
      issuesOrSuggestions,
      overallConfidence
    };

    this.log(LogLevel.SUCCESS, 'supplement-generation-complete', 
      `Supplement generation completed for job ${jobId}. Items: ${generatedSupplements.length}, Confidence: ${overallConfidence.toFixed(3)}`, 
      { jobId, itemCount: generatedSupplements.length, confidence: overallConfidence, agentType: this.agentType }
    );

    return {
      data: output,
      validation: await this.validate(output, context),
      processingTimeMs: 0, // Set by base Agent
      model: this.anthropic ? 'anthropic' : 'openai' // Primary provider used
    };
  }

  private isExtractedField(obj: any): obj is ExtractedField<any> {
    return obj && typeof obj === 'object' && 'value' in obj && 'confidence' in obj && 'source' in obj;
  }

  private constructSupplementPrompt(input: SupplementGeneratorInput, basePrompt?: string): string {
    let prompt = basePrompt || "You are an expert roofing supplement writer. Based on the provided estimate, roof report, and discrepancy analysis, generate a list of potential supplement items.";

    prompt += "\n\n== Context ==\nJob ID: " + input.jobId;

    const replacer = (key: string, value: any) => {
      if (this.isExtractedField(value)) return value.value;
      // Handle Date objects specifically for better string representation
      if (value instanceof Date) return value.toISOString();
      return value;
    };

    if (input.estimateExtractionData) {
      prompt += "\n\n== Estimate Data Summary ==\n";
      prompt += JSON.stringify(input.estimateExtractionData, replacer, 2);
    }
    if (input.roofReportData) {
      prompt += "\n\n== Roof Report Data Summary ==\n";
      prompt += JSON.stringify(input.roofReportData, replacer, 2);
    }
    if (input.discrepancyReport) {
      prompt += "\n\n== Discrepancy Analysis Summary ==\n";
      prompt += JSON.stringify({
        aiSummary: input.discrepancyReport.aiSummary,
        consistencyWarnings: input.discrepancyReport.consistencyWarnings,
        overallConsistencyScore: input.discrepancyReport.overallConsistencyScore,
        // Include a few key mismatch/missing comparisons for context
        keyComparisons: input.discrepancyReport.comparisons
            .filter(c => c.status === 'MISMATCH' || c.status === 'MISSING_IN_ESTIMATE' || c.status === 'MISSING_IN_ROOF_REPORT')
            .slice(0, 5) // Limit for brevity
      }, replacer, 2);
    }

    prompt += "\n\n== Instructions for Supplement Generation ==\n";
    prompt += "Focus on items commonly missed or underpaid. Consider code requirements, manufacturer specifications, and best practices. For each item, provide:";
    prompt += "\n1. Xactimate Code (e.g., RFG R&RSHINGLE, RFG FELT15) - Be precise.";
    prompt += "\n2. Description (standard Xactimate description). Example: 'Shingles - comp. - dimensional - remove & replace'";
    prompt += "\n3. Quantity (numeric). Calculate accurately if possible (e.g. based on linear feet for drip edge, or area for felt).";
    prompt += "\n4. Unit (e.g., SF, LF, EA, SQ). Ensure it matches the Xactimate code.";
    prompt += "\n5. Justification (brief but clear reason why this item is needed, referencing estimate, roof report, or discrepancies). Example: 'Roof report indicates 250 LF of eave, estimate only covers 200 LF. Add missing 50 LF of drip edge.'";
    prompt += "\n6. Confidence (your confidence 0.0-1.0 in this specific item being a valid supplement).";
    prompt += "\nReturn ONLY a JSON object with a single key 'supplements' which is an array of objects, each object representing a supplement item with keys: 'xactimateCode', 'description', 'quantity', 'unit', 'justification', 'confidence'.";
    prompt += "\nIf there are issues or no clear supplements, return an empty array for 'supplements' and add a note in a separate top-level key 'issues' (array of strings). Example: { \"supplements\": [], \"issues\": [\"Estimate and roof report are perfectly aligned, no obvious supplements found.\"] }";
    prompt += "\nPrioritize items with strong evidence from the provided data.";

    return prompt;
  }

  private parseAISupplementResponse(aiResponseText: string, jobId: string): { supplements: GeneratedSupplementItem[]; rationales: Record<string, string>; issues: string[] } {
    const supplements: GeneratedSupplementItem[] = [];
    const rationales: Record<string, string> = {};
    let issues: string[] = [];

    try {
      const cleanedResponse = aiResponseText.replace(/^```json\n|\n```$/gim, '').trim();
      const parsed = JSON.parse(cleanedResponse);

      if (Array.isArray(parsed.issues)) {
        issues = parsed.issues.map((issue: any) => String(issue));
      }

      if (Array.isArray(parsed.supplements)) {
        for (const item of parsed.supplements) {
          if (item && typeof item.xactimateCode === 'string' && typeof item.description === 'string' && typeof item.quantity === 'number' && typeof item.unit === 'string' && typeof item.justification === 'string' && typeof item.confidence === 'number') {
            const supplementId = uuidv4();
            supplements.push({
              id: supplementId,
              xactimateCode: item.xactimateCode,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              justification: item.justification,
              confidence: Math.max(0.1, Math.min(1.0, item.confidence)), // Clamp confidence
              sourceRecommendationId: 'ai_generated' // Could be more specific if AI provides a link
            });
            rationales[supplementId] = item.justification;
          } else {
            this.log(LogLevel.WARN, 'invalid-supplement-item-structure', 'AI returned a supplement item with invalid structure.', { item, jobId, agentType: this.agentType });
            issues.push('AI provided a malformed supplement item, it was skipped.');
          }
        }
      }
    } catch (error) {
      this.log(LogLevel.ERROR, 'ai-supplement-response-parse-error', `Failed to parse AI supplement response: ${error}. Raw: ${aiResponseText.substring(0, 500)}`, { error, jobId, agentType: this.agentType });
      issues.push(`Failed to parse AI response for supplements: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { supplements, rationales, issues };
  }

  private calculateOverallSupplementConfidence(supplements: GeneratedSupplementItem[], issues: string[]): number {
    if (issues.length > 0 && supplements.length === 0) return 0.1; // Very low if only issues
    if (supplements.length === 0) return 0.4; // Neutral-low if no supplements and no explicit issues from AI

    const averageItemConfidence = supplements.reduce((sum, item) => sum + item.confidence, 0) / supplements.length;
    let confidence = averageItemConfidence;

    // Penalize for issues reported by AI or parsing
    confidence -= issues.length * 0.1; 

    return Math.max(0.05, Math.min(0.95, confidence));
  }

  async validate(result: SupplementGenerationOutput, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-supplements', `Validating generated supplements for job ${result.jobId}`, { agentType: this.agentType });
    const errors: string[] = [];
    const warningsMsg: string[] = [];

    if (!result.jobId) errors.push('Job ID is missing from the supplement output.');
    if (!Array.isArray(result.generatedSupplements)) errors.push('Generated supplements is not an array.');
    if (typeof result.overallConfidence !== 'number' || result.overallConfidence < 0 || result.overallConfidence > 1) {
      errors.push(`Overall confidence (${result.overallConfidence}) is invalid.`);
    }

    if (result.generatedSupplements.length > 0) {
      result.generatedSupplements.forEach((item, index) => {
        if (!item.id) warningsMsg.push(`Supplement item ${index} is missing an ID.`);
        if (!item.xactimateCode) warningsMsg.push(`Supplement item '${item.description || index}' is missing an Xactimate code.`);
        if (!item.description) warningsMsg.push(`Supplement item code '${item.xactimateCode || index}' is missing a description.`);
        if (typeof item.quantity !== 'number' || item.quantity <= 0) warningsMsg.push(`Supplement item '${item.description || index}' has invalid quantity: ${item.quantity}.`);
        if (!item.unit) warningsMsg.push(`Supplement item '${item.description || index}' is missing a unit.`);
        if (!item.justification) warningsMsg.push(`Supplement item '${item.description || index}' is missing a justification.`);
        if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
          warningsMsg.push(`Supplement item '${item.description || index}' has invalid confidence: ${item.confidence}.`);
        }
      });
    }
    
    if (result.issuesOrSuggestions && result.issuesOrSuggestions.length > 0 && result.overallConfidence > 0.7) {
        warningsMsg.push('High confidence supplements reported, but AI also provided issues/suggestions. Review carefully.')
    }

    const validationConfidence = result.overallConfidence * 0.7 + (errors.length > 0 ? 0 : 0.15) + (warningsMsg.length > 0 ? 0 : 0.15) ;

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0.1, Math.min(0.95, validationConfidence)),
      errors,
      warnings: warningsMsg,
      suggestions: result.issuesOrSuggestions || []
    };
  }
  
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-supplement-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`, { agentType: this.agentType });
    const configs: Record<string, AIConfig> = {};
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single();

      if (error) {
        this.log(LogLevel.WARN, 'supplement-config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`, { agentType: this.agentType });
        configs[stepName] = {
            step_name: stepName,
            prompt: "Generate roofing supplement items based on provided data. Return JSON as per instructions.", // Default concise prompt
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-opus-20240229' : 'gpt-4-turbo-preview', // Use stronger models for generation
            temperature: 0.4, // Allow a bit more creativity/thoroughness
            max_tokens: 2000, // Allow for more detailed output
            json_mode: true
        };
      } else if (data) {
        configs[stepName] = data as AIConfig;
      } else {
         this.log(LogLevel.WARN, 'supplement-config-not-found', `AI config not found for ${stepName}, using default.`, { agentType: this.agentType });
         configs[stepName] = {
            step_name: stepName,
            prompt: "Generate roofing supplement items. Return JSON.",
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-opus-20240229' : 'gpt-4-turbo-preview',
            temperature: 0.4,
            max_tokens: 2000,
            json_mode: true
        }; 
      }
    }
    return configs;
  }

  private async callAI(config: AIConfig, prompt: string, jobId: string): Promise<string> {
    this.log(LogLevel.DEBUG, 'supplement-ai-call-start', `Calling ${config.model_provider} model ${config.model_name} for job ${jobId}`, { agentType: this.agentType });
    const startTime = Date.now();
    try {
      let responseText = '';
      const messages = [{ role: 'user' as const, content: prompt }];

      if (config.model_provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: config.model_name || 'gpt-4-turbo-preview',
          messages: messages,
          max_tokens: config.max_tokens || 2000,
          temperature: config.temperature || 0.4,
          response_format: { type: "json_object" },
        });
        responseText = response.choices[0]?.message?.content || '';
      } else if (config.model_provider === 'anthropic' && this.anthropic) {
        const systemPrompt = "You are an expert supplement writer for roofing claims. Your responses MUST be in JSON format, strictly adhering to the structure requested in the user prompt. Generate a list of supplement items based on the provided context.";
        const response = await this.anthropic.messages.create({
          model: config.model_name || 'claude-3-opus-20240229',
          max_tokens: config.max_tokens || 2000,
          temperature: config.temperature || 0.4,
          system: systemPrompt,
          messages: messages
        });
        responseText = Array.isArray(response.content) && response.content[0]?.type === 'text' ? response.content[0].text : '';
      } else {
        throw new Error(`Unsupported AI provider or client not initialized for supplement generation: ${config.model_provider}`);
      }
      
      const duration = Date.now() - startTime;
      this.log(LogLevel.INFO, 'supplement-ai-call-success', 
        `${config.model_provider} call for ${jobId} completed in ${duration}ms. Output length: ${responseText.length}`,
        { duration, outputLength: responseText.length, provider: config.model_provider, model: config.model_name, agentType: this.agentType }
      );
      return responseText;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(LogLevel.ERROR, 'supplement-ai-call-error', 
        `${config.model_provider} call for ${jobId} failed after ${duration}ms: ${error}`,
        { duration, error, provider: config.model_provider, model: config.model_name, agentType: this.agentType }
      );
      throw error;
    }
  }
} 