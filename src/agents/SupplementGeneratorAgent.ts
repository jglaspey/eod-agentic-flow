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
  GeneratedSupplementItem // Assuming this will be a new type for formatted output
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
 * Agent responsible for generating supplement item descriptions and justifications.
 * Takes analysis from DiscrepancyAnalyzerAgent and formats it into supplement requests.
 */
export class SupplementGeneratorAgent extends Agent {
  private supabase = getSupabaseClient();
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor() {
    const config: AgentConfig = {
      name: 'SupplementGeneratorAgent',
      version: '1.0.0',
      capabilities: ['supplement_formatting', 'justification_generation', 'llm_text_generation'],
      defaultTimeout: 60000, // 60 seconds, as it might involve multiple LLM calls for formatting
      maxRetries: 1,
      confidenceThreshold: 0.7, // Confidence in the generated supplement text quality
      tools: [] // May use AI models for generation
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

  async plan(input: SupplementGenerationInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-supplement-generation', `Planning supplement generation for task ${context.taskId}`);
    const tasks = [
      {
        id: uuidv4(),
        type: 'generate_supplement_items',
        input: input, // Contains analysis output
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    return {
      tasks,
      dependencies: new Map(),
      estimatedDuration: 30000, // Estimate for generation logic
      confidence: 0.85
    };
  }

  async act(input: SupplementGenerationInput, context: TaskContext): Promise<AgentResult<SupplementGenerationOutput>> {
    this.log(LogLevel.INFO, 'supplement-generation-start', `Starting supplement generation for task ${context.taskId}`);
    
    const { analysisOutput } = input;
    const recommendations = analysisOutput.data.missingItems;

    const generatedSupplements: GeneratedSupplementItem[] = [];
    let overallConfidence = 0.5;

    if (!recommendations || recommendations.length === 0) {
      this.log(LogLevel.INFO, 'no-recommendations-for-supplement', 'No supplement items recommended by analyzer.', { taskId: context.taskId });
      return {
        data: { generatedSupplements, summary: 'No supplement items to generate based on analysis.' },
        validation: await this.validate({ generatedSupplements }, context),
        processingTimeMs: 0,
        model: 'logic'
      };
    }

    // For each recommendation, format it and generate justification (potentially using LLM)
    for (const rec of recommendations) {
      // Placeholder: Direct mapping for now. LLM can enhance this.
      const generatedItem: GeneratedSupplementItem = {
        id: rec.id,
        xactimateCode: rec.xactimateCode || 'N/A',
        description: rec.description,
        quantity: rec.quantity.value,
        unit: rec.unit,
        justification: `${rec.reason} Supporting evidence: ${rec.supporting_evidence?.join('; ') || 'N/A'}`,
        sourceRecommendationId: rec.id,
        confidence: rec.confidence // Confidence of this generated item based on recommendation
      };
      generatedSupplements.push(generatedItem);
    }
    
    // Calculate an overall confidence for the generated batch
    if (generatedSupplements.length > 0) {
      overallConfidence = generatedSupplements.reduce((sum, item) => sum + item.confidence, 0) / generatedSupplements.length;
    }

    // TODO: Optionally use an LLM to write a summary or an introduction for the supplement list.
    // TODO: Integrate pricing if a pricing data source becomes available.

    this.log(LogLevel.SUCCESS, 'supplement-generation-complete', `Supplement generation finished. Items: ${generatedSupplements.length}`, { taskId: context.taskId, count: generatedSupplements.length });

    return {
      data: { generatedSupplements },
      validation: await this.validate({ generatedSupplements }, context),
      processingTimeMs: 0, // Set by base Agent
      model: 'template/logic' // Or LLM model if used for formatting/justification
    };
  }

  async validate(result: SupplementGenerationOutput, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-supplement-generation', `Validating supplement generation for task ${context.taskId}`);
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 0.7; // Base confidence for validation of generation

    if (!result.generatedSupplements || result.generatedSupplements.length === 0) {
      // This case is handled in act, but as a safeguard:
      warnings.push('No supplement items were generated.');
      confidence = 0.5;
    } else {
      const avgConfidence = result.generatedSupplements.reduce((sum, item) => sum + item.confidence, 0) / result.generatedSupplements.length;
      confidence = (confidence + avgConfidence) / 2;

      for (const item of result.generatedSupplements) {
        if (!item.description || item.description.trim() === '') {
          errors.push(`Generated item ${item.id} has no description.`);
          confidence = Math.min(confidence, 0.4);
        }
        if (!item.justification || item.justification.trim() === '') {
          warnings.push(`Generated item ${item.id} (${item.description}) has no justification.`);
          confidence = Math.min(confidence, 0.6);
        }
        if (item.quantity <= 0) {
            warnings.push(`Generated item ${item.id} (${item.description}) has zero or negative quantity.`);
            confidence = Math.min(confidence, 0.5);
        }
      }
    }

    if (confidence < this.config.confidenceThreshold) {
        suggestions.push('Overall confidence in generated supplements is low. Manual review of formatting and justifications is recommended.');
    }

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0.1, Math.min(0.95, confidence)),
      errors,
      warnings,
      suggestions
    };
  }
  
  // Placeholder for AI configuration fetching
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-supplement-gen-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`);
    const configs: Record<string, AIConfig> = {};
    // if (stepNames.includes('format_supplement_item_llm')) { ... }
    return configs;
  }

  // Placeholder for AI call wrapper
  private async callAI(config: AIConfig, prompt: string, jobId: string): Promise<string> {
    this.log(LogLevel.DEBUG, 'supplement-gen-ai-call-start', `Calling ${config.model_provider} model ${config.model_name}`);
    // AI call logic
    return '';
  }
} 