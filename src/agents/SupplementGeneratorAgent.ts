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
import { BusinessRulesEngine } from './rules/BusinessRules'; // Import Business Rules Engine
import { SupplementValidator } from './validators/SupplementValidator'; // Import Supplement Validator

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
    await this.writeJobLog(input.jobId, 'multi-pass-entry-detected', LogLevel.INFO, 'Multi-Pass Supplement Agent: Starting comprehensive 5-pass supplement generation', {
      timestamp: new Date().toISOString(),
      hasJobData: !!input.jobData,
      hasLineItems: !!input.actualEstimateLineItems,
      contextTaskId: context.taskId
    });
    
    this.log(LogLevel.INFO, 'supplement-generation-start-multipass', `Starting multi-pass supplement generation for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    
    const { jobId, jobData, actualEstimateLineItems } = input;

    let generatedSupplementsForOutput: GeneratedSupplementItem[] = [];
    const issuesOrSuggestions: string[] = [];
    let overallConfidence = 0.5;
    const supplementRationales: Record<string, string> = {};

    // Input validation
    if (!jobData || !actualEstimateLineItems) {
        this.log(LogLevel.ERROR, 'missing-input-data-supplements', 'Missing jobData or actualEstimateLineItems for supplement generation.', { jobId, agentType: this.agentType });
        return {
            data: { 
                jobId,
                generatedSupplements: [], 
                supplementRationales: {}, 
                issuesOrSuggestions: ['Critical: Missing input data.'], 
                overallConfidence: 0.0 
            } as SupplementGenerationOutput,
            validation: {
                isValid: false,
                confidence: 0.0,
                errors: ['Missing jobData or actualEstimateLineItems for supplement generation.'],
                warnings: [],
                suggestions: []
            },
            processingTimeMs: 0,
            model: 'multi_pass_system'
        };
    }

    try {
      // PASS 1: Initial AI Suggestions
      this.log(LogLevel.INFO, 'pass-1-ai-suggestions', `Pass 1: Getting initial AI suggestions for job ${jobId}`, { agentType: this.agentType });
      
      // Write to job_logs for visibility
      await this.writeJobLog(jobId, 'multi-pass-1-start', LogLevel.INFO, 'Multi-Pass System: Starting Pass 1 - AI Suggestions', {
        pass: 1,
        description: 'Initial AI-powered supplement generation'
      });
      
      const aiOrchestrator = new AIOrchestrator(jobId);
      let aiSupplements: DBSupplementItem[] = [];
      
      try {
        aiSupplements = await aiOrchestrator.analyzeDiscrepanciesAndSuggestSupplements(jobData, actualEstimateLineItems);
        this.log(LogLevel.INFO, 'pass-1-complete', `Pass 1 complete: AI returned ${aiSupplements.length} supplement suggestions`, { count: aiSupplements.length, agentType: this.agentType });
        
        // Write completion to job_logs
        await this.writeJobLog(jobId, 'multi-pass-1-complete', LogLevel.INFO, `Multi-Pass System: Pass 1 Complete - Generated ${aiSupplements.length} AI suggestions`, {
          pass: 1,
          aiSupplementCount: aiSupplements.length,
          items: aiSupplements.map(s => s.line_item),
          aiSupplementsDebug: aiSupplements.map(s => ({
            line_item: s.line_item,
            source_system: s.source_system,
            has_source_system: !!s.source_system,
            business_rule_applied: s.business_rule_applied,
            validation_status: s.validation_status
          }))
        });
      } catch (aiError: any) {
        this.log(LogLevel.ERROR, 'pass-1-failed', `Pass 1 AI suggestions failed: ${aiError.message}`, { error: aiError.message, agentType: this.agentType });
        issuesOrSuggestions.push(`AI suggestion generation failed: ${aiError.message}`);
        
        await this.writeJobLog(jobId, 'multi-pass-1-error', LogLevel.ERROR, `Multi-Pass System: Pass 1 Failed - ${aiError.message}`, {
          pass: 1,
          error: aiError.message
        });
        // Continue with empty AI suggestions - business rules can still add items
      }

      // PASS 2: Business Rules Validation/Supplementation
      this.log(LogLevel.INFO, 'pass-2-business-rules', `Pass 2: Running business rules validation for job ${jobId}`, { agentType: this.agentType });
      
      await this.writeJobLog(jobId, 'multi-pass-2-start', LogLevel.INFO, 'Multi-Pass System: Starting Pass 2 - Business Rules Validation', {
        pass: 2,
        description: 'Applying domain-specific business rules to validate and supplement AI suggestions'
      });
      
      const businessRulesEngine = new BusinessRulesEngine();
      let rulesSupplements: DBSupplementItem[] = [];
      let rulesResults: any[] = [];
      
      try {
        this.log(LogLevel.DEBUG, 'business-rules-pre-eval', `About to evaluate business rules for job ${jobId}`, {
          hasJobData: !!jobData,
          estimateLineItemsCount: actualEstimateLineItems?.length || 0,
          aiSuggestionsCount: aiSupplements?.length || 0,
          jobDataKeys: Object.keys(jobData || {}),
          agentType: this.agentType
        });

        await this.writeJobLog(jobId, 'multi-pass-2-debug-start', LogLevel.INFO, `DEBUG: Business rules evaluation starting`, {
          pass: 2,
          hasJobData: !!jobData,
          estimateLineItemsCount: actualEstimateLineItems?.length || 0,
          aiSuggestionsCount: aiSupplements?.length || 0,
          eaveLength: jobData?.eave_length,
          ridgeHipLength: jobData?.ridge_hip_length,
          rakeLength: jobData?.rake_length
        });

        const rulesEvaluation = businessRulesEngine.evaluateAll({
          jobData,
          estimateLineItems: actualEstimateLineItems,
          aiSuggestions: aiSupplements
        });
        
        this.log(LogLevel.DEBUG, 'business-rules-post-eval', `Business rules evaluation completed for job ${jobId}`, {
          hasEvaluation: !!rulesEvaluation,
          newSupplementsCount: rulesEvaluation?.newSupplements?.length || 0,
          resultsCount: rulesEvaluation?.results?.length || 0,
          agentType: this.agentType
        });
        
        rulesSupplements = rulesEvaluation.newSupplements;
        rulesResults = rulesEvaluation.results;
        
        this.log(LogLevel.INFO, 'pass-2-complete', `Pass 2 complete: Business rules added ${rulesSupplements.length} supplements, verified ${rulesResults.filter(r => r.action === 'verify').length} AI suggestions`, { 
          newSupplements: rulesSupplements.length, 
          verifiedSuggestions: rulesResults.filter(r => r.action === 'verify').length,
          summary: rulesEvaluation.summary,
          agentType: this.agentType 
        });
        
        await this.writeJobLog(jobId, 'multi-pass-2-complete', LogLevel.INFO, `Multi-Pass System: Pass 2 Complete - Applied ${rulesResults.length} business rules`, {
          pass: 2,
          newSupplements: rulesSupplements.length,
          rulesApplied: rulesResults.map(r => ({ rule: r.ruleId, action: r.action })),
          summary: rulesEvaluation.summary,
          businessRuleSupplements: rulesSupplements.map(s => ({
            line_item: s.line_item,
            source_system: s.source_system,
            business_rule_applied: s.business_rule_applied
          }))
        });
        
        issuesOrSuggestions.push(rulesEvaluation.summary);
      } catch (rulesError: any) {
        this.log(LogLevel.ERROR, 'pass-2-failed', `Pass 2 business rules failed: ${rulesError.message}`, { error: rulesError.message, agentType: this.agentType });
        issuesOrSuggestions.push(`Business rules evaluation failed: ${rulesError.message}`);
        // Continue without business rules supplements
      }

      // AI supplements now set their own source attribution in createSupplementFromSuggestion()
      const aiSupplementsWithSource = aiSupplements;

      // Business rules now set their own source attribution in createSupplement()
      const rulesSupplementsWithSource = rulesSupplements;

      // Debug: Log business rule attribution
      rulesSupplements.forEach(supplement => {
        this.log(LogLevel.DEBUG, 'business-rule-attribution', `Business rule supplement attribution`, {
          line_item: supplement.line_item,
          source_system: supplement.source_system,
          business_rule_applied: supplement.business_rule_applied,
          agentType: this.agentType
        });
      });

      // Combine supplements in standardized order: Business Rules first (1-4), then AI suggestions
      const combinedSupplements = [...rulesSupplementsWithSource, ...aiSupplementsWithSource];
      this.log(LogLevel.INFO, 'supplements-combined', `Combined supplements: ${aiSupplements.length} from AI + ${rulesSupplements.length} from business rules = ${combinedSupplements.length} total`, { 
        aiCount: aiSupplements.length, 
        rulesCount: rulesSupplements.length, 
        totalCount: combinedSupplements.length,
        agentType: this.agentType 
      });

      // PASS 3: Cross-Reference Validation
      this.log(LogLevel.INFO, 'pass-3-validation', `Pass 3: Cross-reference validation for ${combinedSupplements.length} supplements`, { agentType: this.agentType });
      
      await this.writeJobLog(jobId, 'multi-pass-3-start', LogLevel.INFO, `Multi-Pass System: Starting Pass 3 - Cross-Reference Validation`, {
        pass: 3,
        totalSupplements: combinedSupplements.length,
        description: 'Validating supplements against estimate and preventing duplicates'
      });
      
      const validator = new SupplementValidator();
      let validSupplements: DBSupplementItem[] = [];
      let validationSummary = '';
      
      try {
        if (combinedSupplements.length > 0) {
          const validationResult = validator.validateSupplements(combinedSupplements, actualEstimateLineItems, jobData);
          validSupplements = validationResult.validSupplements;
          validationSummary = validationResult.summary;
          
          this.log(LogLevel.INFO, 'pass-3-complete', `Pass 3 complete: ${validationResult.validSupplements.length}/${combinedSupplements.length} supplements passed validation`, {
            validCount: validationResult.validSupplements.length,
            invalidCount: validationResult.invalidSupplements.length,
            summary: validationSummary,
            agentType: this.agentType
          });
          
          await this.writeJobLog(jobId, 'multi-pass-3-complete', LogLevel.INFO, `Multi-Pass System: Pass 3 Complete - ${validationResult.validSupplements.length} supplements validated`, {
            pass: 3,
            validCount: validationResult.validSupplements.length,
            invalidCount: validationResult.invalidSupplements.length,
            rejectedItems: validationResult.invalidSupplements.map(s => s.line_item),
            summary: validationSummary
          });
          
          issuesOrSuggestions.push(validationSummary);
          
          // Log details about invalid supplements for debugging
          if (validationResult.invalidSupplements.length > 0) {
            validationResult.invalidSupplements.forEach(invalid => {
              const issues = validationResult.validationResults.get(invalid.id)?.issues || [];
              this.log(LogLevel.DEBUG, 'supplement-rejected', `Rejected supplement: ${invalid.line_item}`, { 
                item: invalid.line_item, 
                issues: issues.slice(0, 2), // First 2 issues for brevity
                agentType: this.agentType 
              });
            });
          }
        } else {
          this.log(LogLevel.INFO, 'pass-3-skipped', 'Pass 3 skipped: No supplements to validate', { agentType: this.agentType });
        }
      } catch (validationError: any) {
        this.log(LogLevel.ERROR, 'pass-3-failed', `Pass 3 validation failed: ${validationError.message}`, { error: validationError.message, agentType: this.agentType });
        issuesOrSuggestions.push(`Validation failed: ${validationError.message}`);
        // Use unvalidated supplements as fallback
        validSupplements = combinedSupplements;
      }

      // PASS 4: Optional Follow-up AI Call (if insufficient items found)
      const finalSupplements = validSupplements;
      if (finalSupplements.length < 3 && rulesSupplements.length > 0) {
        this.log(LogLevel.INFO, 'pass-4-considered', `Pass 4: Found ${finalSupplements.length} supplements but business rules suggested ${rulesSupplements.length} items. Consider targeted follow-up AI call.`, { 
          finalCount: finalSupplements.length, 
          rulesCount: rulesSupplements.length,
          agentType: this.agentType 
        });
        
        await this.writeJobLog(jobId, 'multi-pass-4-check', LogLevel.INFO, `Multi-Pass System: Pass 4 - Follow-up Check`, {
          pass: 4,
          status: 'skipped',
          reason: 'Follow-up AI calls not yet implemented',
          finalCount: finalSupplements.length,
          rulesCount: rulesSupplements.length
        });
        
        issuesOrSuggestions.push(`Potential for additional supplements - business rules identified ${rulesSupplements.length} missing items but only ${finalSupplements.length} total supplements validated.`);
        // TODO: Implement targeted follow-up AI calls in future iteration
      }

      // PASS 5: Final Confidence Scoring
      this.log(LogLevel.INFO, 'pass-5-confidence', `Pass 5: Calculating final confidence score for ${finalSupplements.length} supplements`, { agentType: this.agentType });
      
      await this.writeJobLog(jobId, 'multi-pass-5-start', LogLevel.INFO, 'Multi-Pass System: Starting Pass 5 - Final Confidence Scoring', {
        pass: 5,
        description: 'Calculating overall confidence based on all passes'
      });
      
      if (finalSupplements.length > 0) {
        // Calculate weighted confidence combining AI, business rules, and validation
        const aiConfidence = aiSupplements.length > 0 ? aiSupplements.reduce((sum, item) => sum + item.confidence_score, 0) / aiSupplements.length : 0.5;
        const rulesConfidence = rulesResults.length > 0 ? rulesResults.reduce((sum, result) => sum + result.confidence, 0) / rulesResults.length : 0.5;
        const validationSuccess = validSupplements.length / Math.max(combinedSupplements.length, 1);
        
        // Weighted combination: 40% AI, 35% business rules, 25% validation success
        overallConfidence = (aiConfidence * 0.4) + (rulesConfidence * 0.35) + (validationSuccess * 0.25);
        
        this.log(LogLevel.INFO, 'confidence-calculated', `Final confidence: ${overallConfidence.toFixed(3)} (AI: ${aiConfidence.toFixed(3)}, Rules: ${rulesConfidence.toFixed(3)}, Validation: ${validationSuccess.toFixed(3)})`, {
          overallConfidence: overallConfidence.toFixed(3),
          aiConfidence: aiConfidence.toFixed(3),
          rulesConfidence: rulesConfidence.toFixed(3),
          validationSuccess: validationSuccess.toFixed(3),
          agentType: this.agentType
        });
        
        await this.writeJobLog(jobId, 'multi-pass-5-complete', LogLevel.INFO, `Multi-Pass System: Pass 5 Complete - Final Confidence: ${(overallConfidence * 100).toFixed(1)}%`, {
          pass: 5,
          overallConfidence: overallConfidence.toFixed(3),
          aiConfidence: aiConfidence.toFixed(3),
          rulesConfidence: rulesConfidence.toFixed(3),
          validationSuccess: validationSuccess.toFixed(3),
          finalSupplementCount: finalSupplements.length
        });
      } else {
        // No supplements generated
        if (aiSupplements.length === 0 && rulesSupplements.length === 0) {
          overallConfidence = 0.7; // High confidence that no supplements are needed
          issuesOrSuggestions.push('No supplements required - estimate appears complete and compliant.');
        } else {
          overallConfidence = 0.3; // Low confidence - items were suggested but didn't pass validation
          issuesOrSuggestions.push('Supplements were suggested but failed validation - possible data quality issues.');
        }
      }

      // Write final multi-pass summary
      await this.writeJobLog(jobId, 'multi-pass-complete', LogLevel.SUCCESS, `Multi-Pass System Complete: Generated ${finalSupplements.length} supplements with ${(overallConfidence * 100).toFixed(1)}% confidence`, {
        summary: {
          totalSupplements: finalSupplements.length,
          pass1_aiSuggestions: aiSupplements.length,
          pass2_businessRulesAdded: rulesSupplements.length,
          pass3_validated: validSupplements.length,
          pass4_followup: 'not implemented',
          pass5_confidence: overallConfidence.toFixed(3),
          items: finalSupplements.map(s => ({
            item: s.line_item,
            code: s.xactimate_code,
            quantity: s.quantity,
            confidence: s.confidence_score
          }))
        }
      });

      // Sort final supplements: Business Rules first (in rule order), then AI suggestions
      const sortedFinalSupplements = [...finalSupplements].sort((a, b) => {
        // Business rules first
        if (a.source_system === 'business_rule' && b.source_system !== 'business_rule') return -1;
        if (a.source_system !== 'business_rule' && b.source_system === 'business_rule') return 1;
        
        // Within business rules, sort by rule priority
        if (a.source_system === 'business_rule' && b.source_system === 'business_rule') {
          const ruleOrder = {
            'hip_ridge_cap_check': 1,
            'starter_row_check': 2, 
            'drip_edge_gutter_check': 3,
            'ice_water_barrier_check': 4
          };
          
          const aRule = a.business_rule_applied?.[0] || 'unknown';
          const bRule = b.business_rule_applied?.[0] || 'unknown';
          const aPriority = ruleOrder[aRule as keyof typeof ruleOrder] || 999;
          const bPriority = ruleOrder[bRule as keyof typeof ruleOrder] || 999;
          
          return aPriority - bPriority;
        }
        
        // AI suggestions keep their original order
        return 0;
      });

      // Save valid supplements to database
      if (sortedFinalSupplements.length > 0) {
        try {
          // Debug: Log what we're about to save
          const itemsToSave = sortedFinalSupplements.map(item => {
            // Ensure source_system is explicitly set
            const itemToSave = {
              ...item,
              job_id: jobId,
              // Explicitly set these fields to prevent database defaults from overriding
              source_system: item.source_system || 'multi_pass_v1',
              business_rule_applied: item.business_rule_applied || null,
              validation_status: item.validation_status || 'pending'
            };
            return itemToSave;
          });
          
          this.log(LogLevel.DEBUG, 'supplement-save-debug', `Saving ${itemsToSave.length} supplements to database`, {
            items: itemsToSave.map(item => ({
              line_item: item.line_item,
              source_system: item.source_system,
              business_rule_applied: item.business_rule_applied,
              validation_status: item.validation_status,
              has_source_system: !!item.source_system,
              source_system_type: typeof item.source_system,
              id: item.id
            })),
            agentType: this.agentType
          });

          const { error: supplementSaveError } = await this.supabase
            .from('supplement_items')
            .insert(itemsToSave);

          if (supplementSaveError) {
            this.log(LogLevel.ERROR, 'supplement-save-failed', `Failed to save supplement items: ${supplementSaveError.message}`, { jobId, error: supplementSaveError, agentType: this.agentType });
            issuesOrSuggestions.push(`Database save failed: ${supplementSaveError.message}`);
            overallConfidence *= 0.8; // Reduce confidence for save failures
          } else {
            this.log(LogLevel.SUCCESS, 'supplement-save-success', `${sortedFinalSupplements.length} validated supplement items saved to database`, { jobId, count: sortedFinalSupplements.length, agentType: this.agentType });
            
            // Verify what was actually saved
            await this.writeJobLog(jobId, 'multi-pass-save-verification', LogLevel.INFO, `Multi-Pass System: Verifying saved supplements`, {
              savedCount: sortedFinalSupplements.length,
              savedItems: sortedFinalSupplements.map(item => ({
                id: item.id,
                line_item: item.line_item,
                source_system: item.source_system,
                business_rule_applied: item.business_rule_applied,
                validation_status: item.validation_status
              }))
            });
          }
        } catch (saveError: any) {
          this.log(LogLevel.ERROR, 'supplement-save-error', `Error saving supplements: ${saveError.message}`, { error: saveError.message, agentType: this.agentType });
          issuesOrSuggestions.push(`Database error: ${saveError.message}`);
          overallConfidence *= 0.8;
        }
      }

      // Transform to output format
      generatedSupplementsForOutput = sortedFinalSupplements.map((dbItem): GeneratedSupplementItem => {
        const generatedId = dbItem.id || uuidv4();
        supplementRationales[generatedId] = dbItem.reason;
        return {
          id: generatedId, 
          xactimateCode: dbItem.xactimate_code || 'TBD',
          description: dbItem.line_item,
          quantity: dbItem.quantity,
          unit: dbItem.unit,
          justification: dbItem.reason,
          confidence: dbItem.confidence_score,
          sourceRecommendationId: `multi_pass_${generatedId}`,
        };
      });

    } catch (error: any) {
        this.log(LogLevel.ERROR, 'multi-pass-critical-error', `Critical error in multi-pass supplement generation: ${error.message}`, { jobId, error: error.toString(), stack: error.stack, agentType: this.agentType });
        issuesOrSuggestions.push(`Critical system error: ${error.message}`);
        overallConfidence = 0.1;
    }

    const output: SupplementGenerationOutput = {
      jobId,
      generatedSupplements: generatedSupplementsForOutput,
      supplementRationales,
      issuesOrSuggestions,
      overallConfidence: parseFloat(overallConfidence.toFixed(3)),
    };

    this.log(LogLevel.SUCCESS, 'multi-pass-complete', 
      `Multi-pass supplement generation completed for job ${jobId}. Final results: ${generatedSupplementsForOutput.length} supplements, confidence: ${output.overallConfidence}`, 
      { jobId, itemCount: generatedSupplementsForOutput.length, confidence: output.overallConfidence, agentType: this.agentType }
    );

    return {
      data: output,
      validation: await this.validate(output, context),
      processingTimeMs: 0, // Set by base Agent
      model: 'multi_pass_system'
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