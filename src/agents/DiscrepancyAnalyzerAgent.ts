import { Agent } from './Agent';
import {
  AgentType,
  AgentConfig,
  AgentResult,
  AgentExecutionPlan,
  TaskContext,
  ValidationResult,
  EstimateFieldExtractions,
  RoofMeasurements,
  SupplementRecommendation,
  ExtractedField,
  LogLevel,
  AIConfig
} from './types';
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { evaluateSupplementRules, RuleContext } from './rules/SupplementRules'; // Import rule evaluation

interface DiscrepancyAnalysisInput {
  estimateData: AgentResult<EstimateFieldExtractions>;
  roofReportData: AgentResult<RoofMeasurements>;
  // Potentially add job context, historical data, or specific rules to apply
}

export interface DiscrepancyAnalysisOutput {
  missingItems: SupplementRecommendation[];
  quantityDiscrepancies: any[]; // Define a proper type later
  consistencyWarnings: string[];
  overallAssessmentConfidence: number;
}

/**
 * Agent responsible for analyzing discrepancies between estimate and roof report data.
 * Identifies missing items, quantity mismatches, and other inconsistencies.
 */
export class DiscrepancyAnalyzerAgent extends Agent {
  private supabase = getSupabaseClient();

  constructor() {
    const config: AgentConfig = {
      name: 'DiscrepancyAnalyzerAgent',
      version: '1.0.0',
      capabilities: ['cross_document_validation', 'rule_based_analysis', 'discrepancy_detection'],
      defaultTimeout: 15000, // 15 seconds - optimized for serverless
      maxRetries: 1,
      confidenceThreshold: 0.6, // Confidence in the analysis itself
      tools: ['supplement_rule_engine'] // Added rule engine as a conceptual tool
    };
    super(config);

    // AI clients are initialized in the base Agent class
  }

  get agentType(): AgentType {
    return AgentType.DISCREPANCY_ANALYZER;
  }

  async plan(input: DiscrepancyAnalysisInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-discrepancy-analysis', `Planning discrepancy analysis for task ${context.taskId}`);
    const tasks = [
      {
        id: uuidv4(),
        type: 'analyze_discrepancies',
        input: input, // Contains both estimate and roof report data
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    return {
      tasks,
      dependencies: new Map(), // Standalone analysis task for now
      estimatedDuration: 20000, // Estimate for analysis logic
      confidence: 0.9 // High confidence in the plan to analyze
    };
  }

  async act(input: DiscrepancyAnalysisInput, context: TaskContext): Promise<AgentResult<DiscrepancyAnalysisOutput>> {
    this.log(LogLevel.INFO, 'discrepancy-analysis-start', `Starting discrepancy analysis for task ${context.taskId}`);
    
    const { estimateData, roofReportData } = input;

    const analysisOutput: DiscrepancyAnalysisOutput = {
      missingItems: [],
      quantityDiscrepancies: [],
      consistencyWarnings: [],
      overallAssessmentConfidence: 0.6 // Initial confidence
    };

    // Ensure data exists before proceeding
    if (!estimateData?.data || !roofReportData?.data) {
        this.log(LogLevel.WARN, 'insufficient-data-for-analysis', 'Estimate or Roof Report data is missing, cannot perform full discrepancy analysis.', { taskId: context.taskId });
        analysisOutput.consistencyWarnings.push('Full discrepancy analysis could not be performed due to missing estimate or roof report data.');
        analysisOutput.overallAssessmentConfidence = 0.2;
        return {
            data: analysisOutput,
            validation: await this.validate(analysisOutput, context),
            processingTimeMs: 0,
            model: 'logic_rules'
        };
    }

    // 1. Evaluate supplement rules
    this.log(LogLevel.DEBUG, 'evaluating-supplement-rules', 'Evaluating supplement rules', { taskId: context.taskId });
    const ruleContext: RuleContext = {
      estimate: estimateData.data,
      roofReport: roofReportData.data
    };
    try {
      analysisOutput.missingItems = evaluateSupplementRules(ruleContext);
      this.log(LogLevel.INFO, 'supplement-rules-evaluated', `Found ${analysisOutput.missingItems.length} potential missing items via rules.`, { taskId: context.taskId, count: analysisOutput.missingItems.length });
    } catch (ruleError) {
        this.log(LogLevel.ERROR, 'supplement-rule-error', `Error during supplement rule evaluation: ${ruleError}`, { taskId: context.taskId, error: ruleError });
        analysisOutput.consistencyWarnings.push(`Error during rule evaluation: ${ruleError}`);
        // Note: Rule evaluation error occurred, will be factored into final confidence calculation
    }
    
    // 2. Basic check for roof area consistency (example)
    if (estimateData.validation.confidence > 0.6 && roofReportData.validation.confidence > 0.6) {
        const estimateLineItems = estimateData.data.lineItems?.value || [];
        const estimateTotalAreaSqFt = estimateLineItems
            .filter(item => 
                item.description?.toLowerCase().includes('roof') && 
                (item.description?.toLowerCase().includes('sq') || item.unit?.toLowerCase() === 'sq'))
            .reduce((sum, item) => {
                const quantity = parseFloat(item.quantity);
                // If unit is SF, divide by 100, else assume it's SQ
                return sum + (item.unit?.toLowerCase() === 'sf' ? (quantity / 100) : quantity);
            }, 0) * 100; // Convert final sum to Sq Ft if it was in Squares

        const reportTotalAreaSq = roofReportData.data.totalRoofArea?.value || 0;
        const reportTotalAreaSqFt = reportTotalAreaSq * 100;

        if (reportTotalAreaSqFt > 0 && estimateTotalAreaSqFt > 0) {
            const diffPercentage = Math.abs(reportTotalAreaSqFt - estimateTotalAreaSqFt) / Math.max(reportTotalAreaSqFt, estimateTotalAreaSqFt);
            if (diffPercentage > 0.20) { // More than 20% difference is a stronger warning
                analysisOutput.consistencyWarnings.push(
                    `Significant roof area discrepancy: Estimate total ~${estimateTotalAreaSqFt.toFixed(0)} sq ft, Roof Report total ${reportTotalAreaSqFt.toFixed(0)} sq ft. Difference: ${(diffPercentage * 100).toFixed(1)}%`
                );
                // Note: Significant area discrepancy found, will be factored into final confidence
            } else if (diffPercentage > 0.10) { // 10-20% difference
                 analysisOutput.consistencyWarnings.push(
                    `Potential roof area discrepancy: Estimate total ~${estimateTotalAreaSqFt.toFixed(0)} sq ft, Roof Report total ${reportTotalAreaSqFt.toFixed(0)} sq ft. Difference: ${(diffPercentage * 100).toFixed(1)}%`
                );
                 // Note: Potential area discrepancy found, will be factored into final confidence
            }
        } else if (reportTotalAreaSqFt > 0 && estimateTotalAreaSqFt === 0) {
            analysisOutput.consistencyWarnings.push('Roof area is present in roof report but seems missing or zero in estimate line items.');
            // Note: Missing roof area in estimate, will be factored into final confidence
        }
    }

    // 3. TODO: Implement more sophisticated discrepancy checks (quantityDiscrepancies)
    //    - Compare quantities of shared items (e.g., felt, ice & water shield based on roof area).
    //    - This might involve creating a mapping of common line item descriptions.

    // 4. TODO: Consider AI call for overall review or complex scenarios
    // if (analysisOutput.missingItems.length > 3 || analysisOutput.consistencyWarnings.length > 1) {
    //   // Potentially call an AI to summarize findings or look for deeper issues
    // }
    
    // Calculate final confidence based on analysis quality and findings
    let finalConfidence = 0.7; // Base confidence for completed analysis
    
    // Factor in quality of input data
    const estimateConfidence = estimateData?.validation?.confidence || 0;
    const roofReportConfidence = roofReportData?.validation?.confidence || 0;
    const avgInputConfidence = (estimateConfidence + roofReportConfidence) / 2;
    
    // Weight final confidence: 60% from analysis completion, 40% from input quality
    finalConfidence = finalConfidence * 0.6 + avgInputConfidence * 0.4;
    
    // Adjust based on findings (but don't penalize too heavily for finding real issues)
    if (analysisOutput.missingItems.length > 0 || analysisOutput.consistencyWarnings.length > 0) {
        // Slight reduction for issues found, but this might actually be good analysis
        const issueCount = analysisOutput.missingItems.length + analysisOutput.consistencyWarnings.length;
        const issueReduction = Math.min(0.2, issueCount * 0.05); // Max 20% reduction
        finalConfidence = Math.max(0.4, finalConfidence - issueReduction);
    } else {
        // Bonus for clean analysis (no issues found)
        finalConfidence = Math.min(0.9, finalConfidence + 0.1);
    }
    
    analysisOutput.overallAssessmentConfidence = finalConfidence;

    this.log(LogLevel.SUCCESS, 'discrepancy-analysis-complete', 
        `Discrepancy analysis finished. Missing: ${analysisOutput.missingItems.length}, Warnings: ${analysisOutput.consistencyWarnings.length}`,
        { taskId: context.taskId, missingCount: analysisOutput.missingItems.length, warningCount: analysisOutput.consistencyWarnings.length }
    );

    return {
      data: analysisOutput,
      validation: await this.validate(analysisOutput, context),
      processingTimeMs: 0, // Set by base Agent
      model: 'rule_engine/custom_logic'
    };
  }

  async validate(result: DiscrepancyAnalysisOutput, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-discrepancy-analysis', `Validating discrepancy analysis for task ${context.taskId}`);
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    let confidence = result.overallAssessmentConfidence;

    if (result.missingItems.length === 0 && result.quantityDiscrepancies.length === 0 && result.consistencyWarnings.length === 0) {
      suggestions.push('No discrepancies identified by the automated analysis.');
      confidence = Math.min(0.95, confidence + 0.1); // Slightly boost confidence if no issues automatically found
    } else {
        if (result.missingItems.length > 2 || result.consistencyWarnings.length > 1) {
            suggestions.push('Multiple discrepancies found. Detailed manual review is highly recommended.');
        }
    }

    if (result.missingItems.some(item => item.priority === 'critical')) {
        warnings.push('Critical missing items identified. Requires immediate attention and verification.');
        confidence = Math.max(0.3, confidence -0.2); // Reduce confidence if critical items are flagged by rules
    }

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0.1, Math.min(0.95, confidence)),
      errors,
      warnings,
      suggestions
    };
  }
  
  // Placeholder for AI configuration fetching (if needed for this agent)
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-discrepancy-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`);
    const configs: Record<string, AIConfig> = {};
    // Similar fetching logic as other agents if AI calls are made
    // Example for a hypothetical summarization step:
    // if (stepNames.includes('summarize_discrepancies_ai')) {
    //   // ... fetch config for this step ...
    // }
    return configs;
  }

  // Placeholder for AI call wrapper (if needed for this agent)
  // Using base class callAI method
} 