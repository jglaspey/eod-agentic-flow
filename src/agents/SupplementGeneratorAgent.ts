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
import { AIOrchestrator } from '@/lib/ai-orchestrator'; // Import AIOrchestrator
import { SupplementItem as DBSupplementItem, LineItem as DBLineItem, JobData as DBJobData } from '@/types'; // Import DB types

interface SupplementGenerationInput {
  jobId: string;
  // These are the new fields based on the updated src/agents/types.ts
  jobData: import('@/types').JobData; // Using import('@/types').JobData to be explicit
  actualEstimateLineItems: DBLineItem[];
}

// Define the output structure for this agent
// For now, let's assume it generates a structured list of supplement text lines or objects
// This interface is ALREADY defined in src/agents/types.ts, so this local one might be redundant
// or should match exactly. For the edit, we assume it matches.
/*
export interface SupplementGenerationOutput {
  generatedSupplements: GeneratedSupplementItem[];
  summary?: string; // Optional summary of generated items
  totalRecommendedValue?: number; // If pricing is integrated
}
*/

/**
 * SupplementGeneratorAgent generates supplement items based on estimate data,
 * roof reports, and discrepancy analysis using AIOrchestrator.
 */
export class SupplementGeneratorAgent extends Agent {
  private supabase = getSupabaseClient();

  constructor() {
    const config: AgentConfig = {
      name: 'SupplementGeneratorAgent',
      version: '1.0.0',
      capabilities: ['supplement_generation', 'rule_based_suggestions', 'ai_driven_itemization'],
      defaultTimeout: 15000, // 15 seconds - optimized for serverless
      maxRetries: 1,
      confidenceThreshold: 0.60, // Slightly lower, as supplements can be subjective and reviewed
      tools: []
    };
    super(config);
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
    this.log(LogLevel.INFO, 'supplement-generation-start-new', `Starting supplement generation for job ${input.jobId} using AIOrchestrator.`, { parentTaskId: context.taskId, agentType: this.agentType });
    
    const { jobId, jobData, actualEstimateLineItems } = input; // New input destructuring

    let generatedSupplementsForOutput: GeneratedSupplementItem[] = [];
    const issuesOrSuggestions: string[] = [];
    let overallConfidence = 0.5; // Default confidence
    const supplementRationales: Record<string, string> = {}; // For SupplementGenerationOutput

    if (!jobData || !actualEstimateLineItems) {
        this.log(LogLevel.ERROR, 'missing-input-data-supplements', 'Missing jobData or actualEstimateLineItems for supplement generation.', { jobId, agentType: this.agentType });
        // Return a valid AgentResult with an error status
        const validationError: ValidationResult = {
            isValid: false,
            confidence: 0.0,
            errors: ['Missing jobData or actualEstimateLineItems for supplement generation.'],
            warnings: [],
            suggestions: []
        };
        return {
            data: { 
                jobId,
                generatedSupplements: [], 
                supplementRationales: {}, 
                issuesOrSuggestions: ['Critical: Missing input data.'], 
                overallConfidence: 0.0 
            } as SupplementGenerationOutput,
            validation: validationError,
            processingTimeMs: 0, // Will be set by base
            model: 'ai_orchestrator'
        };
    }

    try {
      const aiOrchestrator = new AIOrchestrator(jobId);
      
      this.log(LogLevel.DEBUG, 'calling-ai-orchestrator-supplements', `Calling AIOrchestrator.analyzeDiscrepanciesAndSuggestSupplements for job ${jobId}`, {agentType: this.agentType});

      const rawSupplementItems: DBSupplementItem[] = await aiOrchestrator.analyzeDiscrepanciesAndSuggestSupplements(
        jobData,
        actualEstimateLineItems
      );

      this.log(LogLevel.INFO, 'ai-orchestrator-supplements-returned', `AIOrchestrator returned ${rawSupplementItems.length} supplement items for job ${jobId}`, { count: rawSupplementItems.length, agentType: this.agentType });

      if (rawSupplementItems && rawSupplementItems.length > 0) {
        // Save to Supabase
        const { error: supplementSaveError } = await this.supabase
          .from('supplement_items')
          .insert(rawSupplementItems.map(item => ({ ...item, job_id: jobId }))); // Ensure job_id is set if not already by AIOrchestrator

        if (supplementSaveError) {
          this.log(LogLevel.ERROR, 'supplement-save-failed', `Failed to save supplement items: ${supplementSaveError.message}`, { jobId, error: supplementSaveError, agentType: this.agentType });
          issuesOrSuggestions.push(`Failed to save supplement items: ${supplementSaveError.message}`);
          // Potentially lower confidence or mark as partial failure
        } else {
          this.log(LogLevel.SUCCESS, 'supplement-save-success', `${rawSupplementItems.length} supplement items saved to DB.`, { jobId, agentType: this.agentType });
        }

        // Transform DBSupplementItem[] to GeneratedSupplementItem[] for agent output
        generatedSupplementsForOutput = rawSupplementItems.map((dbItem): GeneratedSupplementItem => {
          const generatedId = dbItem.id || uuidv4();
          supplementRationales[generatedId] = dbItem.reason; // Populate rationales
          return {
            id: generatedId, 
            xactimateCode: dbItem.xactimate_code || 'TBD',
            description: dbItem.line_item,
            quantity: dbItem.quantity,
            unit: dbItem.unit,
            justification: dbItem.reason,
            confidence: dbItem.confidence_score,
            sourceRecommendationId: `ai_orchestrator_${generatedId}`,
          };
        });
        
        if (generatedSupplementsForOutput.length > 0) {
            overallConfidence = generatedSupplementsForOutput.reduce((sum, item) => sum + item.confidence, 0) / generatedSupplementsForOutput.length;
        } else {
            overallConfidence = 0.3; // Low if AIOrchestrator returned items but transformation failed or all filtered out
        }
      } else {
        this.log(LogLevel.INFO, 'no-supplements-from-ai-orchestrator', `AIOrchestrator returned no supplement items for job ${jobId}.`, {agentType: this.agentType});
        overallConfidence = 0.6; // Neutral-ish if no items suggested, implies alignment
      }

    } catch (error: any) {
        this.log(LogLevel.ERROR, 'supplement-generation-error-new', `Error during AIOrchestrator supplement generation: ${error.message}`, { jobId, error: error.toString(), stack: error.stack, agentType: this.agentType });
        issuesOrSuggestions.push(`Critical error during supplement generation via AIOrchestrator: ${error.message}`);
        overallConfidence = 0.1; // Very low on critical error
    }

    const output: SupplementGenerationOutput = {
      jobId,
      generatedSupplements: generatedSupplementsForOutput,
      supplementRationales,
      issuesOrSuggestions,
      overallConfidence: parseFloat(overallConfidence.toFixed(3)),
    };

    this.log(LogLevel.SUCCESS, 'supplement-generation-complete-new', 
      `Supplement generation completed for job ${jobId}. Items: ${generatedSupplementsForOutput.length}, Confidence: ${output.overallConfidence}`, 
      { jobId, itemCount: generatedSupplementsForOutput.length, confidence: output.overallConfidence, agentType: this.agentType }
    );

    return {
      data: output,
      validation: await this.validate(output, context), // Validate method might need adjustment based on new output structure
      processingTimeMs: 0, // Set by base Agent
      model: 'ai_orchestrator' // Indicate the new source
    };
  }

  // Remove or comment out old AI call and parsing logic:
  // private constructSupplementPrompt(...) { ... }
  // private parseAISupplementResponse(...) { ... }
  // private callAI(...) { ... } // If this was specific to this agent and not from base
  // private getAIConfigs(...) { ... } // If this was specific to this agent

  // The validate method might need to be updated if the structure of SupplementGenerationOutput
  // or the expectations for validation have changed significantly.
  // For now, we assume it can work with the new output or will be reviewed separately.
  async validate(result: SupplementGenerationOutput, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-supplement-generation', `Validating supplement generation output for job ${result.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (result.issuesOrSuggestions && result.issuesOrSuggestions.length > 0) {
        result.issuesOrSuggestions.forEach(issue => {
            if (issue.toLowerCase().includes('critical') || issue.toLowerCase().includes('error')) {
                errors.push(`Agent reported issue: ${issue}`);
            } else {
                warnings.push(`Agent reported info/suggestion: ${issue}`);
            }
        });
    }

    if (result.generatedSupplements.length === 0 && result.overallConfidence < 0.5 && (!result.issuesOrSuggestions || result.issuesOrSuggestions.length === 0) ) {
      warnings.push('No supplement items were generated, and confidence is low, but no specific issues reported by the agent. This might indicate a problem or perfect alignment.');
    }

    result.generatedSupplements.forEach(item => {
      if (!item.xactimateCode || item.xactimateCode === 'TBD') {
        warnings.push(`Supplement item '${item.description.substring(0,30)}...' is missing an Xactimate code.`);
      }
      if (item.quantity <= 0) {
        errors.push(`Supplement item '${item.description.substring(0,30)}...' has invalid quantity: ${item.quantity}.`);
      }
      if (!item.unit) {
        errors.push(`Supplement item '${item.description.substring(0,30)}...' is missing a unit.`);
      }
      if (!item.justification) {
        warnings.push(`Supplement item '${item.description.substring(0,30)}...' is missing a justification.`);
      }
      if (item.confidence < 0.3) {
        warnings.push(`Supplement item '${item.description.substring(0,30)}...' has very low confidence: ${item.confidence.toFixed(2)}.`);
      }
    });
    
    const isValid = errors.length === 0;
    // Recalculate overall confidence based on validation pass, if desired, or keep agent's
    let validationConfidence = result.overallConfidence;
    if (!isValid) {
        validationConfidence = Math.min(result.overallConfidence, 0.4); // Lower confidence if validation errors
    }


    return {
      isValid,
      confidence: parseFloat(validationConfidence.toFixed(3)),
      errors,
      warnings,
      suggestions
    };
  }

  // Ensure getAIConfigs and callAI are removed if they were specific to this agent's old method
  // and not part of the base Agent class or shared utility.
  // If they are from base or utility, they can remain.
  // For this edit, we assume they are not needed for the new AIOrchestrator flow.

} 