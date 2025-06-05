import { Agent } from './Agent';
import {
  AgentType,
  AgentConfig,
  AgentResult,
  AgentExecutionPlan,
  TaskContext,
  ValidationResult,
  LogLevel,
  AIConfig,
  EstimateFieldExtractions,
  RoofMeasurements,
  DiscrepancyReport,
  ComparisonPoint,
  ExtractedField,
  EstimateLineItem
} from './types';
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';

interface DiscrepancyAnalysisInput {
  jobId: string;
  estimateData: EstimateFieldExtractions | null;
  roofData: RoofMeasurements | null;
}

/**
 * DiscrepancyAnalysisAgent compares extracted data from estimates and roof reports.
 * It identifies matches, mismatches, and missing information, providing a consistency score.
 */
export class DiscrepancyAnalysisAgent extends Agent {
  private supabase = getSupabaseClient();

  constructor() {
    const config: AgentConfig = {
      name: 'DiscrepancyAnalysisAgent',
      version: '1.0.0',
      capabilities: ['data_comparison', 'consistency_checking', 'ai_summarization'],
      defaultTimeout: 15000, // 15 seconds - optimized for serverless
      maxRetries: 1, // Reduced for speed
      confidenceThreshold: 0.65,
      tools: [] // May use specialized comparison tools later
    };
    super(config);

    // AI clients are initialized in the base Agent class
  }

  get agentType(): AgentType {
    return AgentType.DISCREPANCY_ANALYZER;
  }

  async plan(input: DiscrepancyAnalysisInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-discrepancy-analysis', `Planning discrepancy analysis for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const tasks = [
      {
        id: uuidv4(),
        type: 'analyze_discrepancies',
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
      estimatedDuration: 25000,
      confidence: 0.9
    };
  }

  async act(input: DiscrepancyAnalysisInput, context: TaskContext): Promise<AgentResult<DiscrepancyReport>> {
    this.log(LogLevel.INFO, 'discrepancy-analysis-start', `Starting discrepancy analysis for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    
    const { estimateData, roofData, jobId } = input;
    const comparisons: ComparisonPoint[] = [];
    let consistencyWarnings: string[] = [];
    let aiSummary = "No AI summary generated.";

    if (!estimateData) {
      this.log(LogLevel.WARN, 'missing-estimate-data', 'Estimate data is missing, cannot perform full discrepancy analysis.', { jobId, agentType: this.agentType });
      const report: DiscrepancyReport = {
        jobId,
        comparisons,
        aiSummary: 'Estimate data was not provided for analysis.',
        consistencyWarnings: ['Estimate data missing.'],
        overallConsistencyScore: 0.1
      };
      return {
        data: report,
        validation: await this.validate(report, context),
        processingTimeMs: 0, 
        model: 'rules_based'
      };
    }

    this.log(LogLevel.DEBUG, 'direct-field-comparison', 'Performing direct field comparisons.', { jobId, agentType: this.agentType });
    comparisons.push(...this.compareDirectFields(estimateData, roofData));

    if (this.openai || this.anthropic) {
      try {
        this.log(LogLevel.DEBUG, 'ai-discrepancy-analysis', 'Performing AI-powered discrepancy analysis.', { jobId, agentType: this.agentType });
        const aiConfigKey = 'analyze_estimate_roof_discrepancies';
        const config = (await this.getAIConfigs([aiConfigKey]))[aiConfigKey];
        
        const prompt = this.constructDiscrepancyPrompt(estimateData, roofData, comparisons, config.prompt);
        const aiResponse = await this.callAI(config, prompt, jobId);
        
        const parsedAIResponse = this.parseAIResponse(aiResponse);
        aiSummary = parsedAIResponse.summary;
        consistencyWarnings.push(...parsedAIResponse.warnings);

      } catch (error) {
        this.log(LogLevel.WARN, 'ai-discrepancy-error', `AI discrepancy analysis failed: ${error}`, { jobId, error, agentType: this.agentType });
        aiSummary = "AI summary generation failed. Check logs for details.";
        consistencyWarnings.push("AI-powered analysis could not be completed.");
      }
    } else {
      aiSummary = "AI providers not configured. Summary based on direct comparisons only.";
      this.log(LogLevel.WARN, 'ai-provider-missing', 'No AI provider (OpenAI/Anthropic) configured for advanced discrepancy analysis.', { jobId, agentType: this.agentType });
    }

    const overallConsistencyScore = this.calculateOverallConsistency(comparisons, consistencyWarnings);

    const report: DiscrepancyReport = {
      jobId,
      comparisons,
      aiSummary,
      consistencyWarnings,
      overallConsistencyScore
    };

    this.log(LogLevel.SUCCESS, 'discrepancy-analysis-complete', 
      `Discrepancy analysis completed for job ${jobId}. Score: ${overallConsistencyScore.toFixed(3)}`, 
      { jobId, score: overallConsistencyScore, comparisonCount: comparisons.length, warningCount: consistencyWarnings.length, agentType: this.agentType }
    );

    return {
      data: report,
      validation: await this.validate(report, context),
      processingTimeMs: 0, 
      model: (this.openai || this.anthropic) ? 'hybrid' : 'rules_based'
    };
  }

  private compareDirectFields(estimate: EstimateFieldExtractions, roof: RoofMeasurements | null): ComparisonPoint[] {
    const points: ComparisonPoint[] = [];

    points.push(this.createComparisonPoint(
      'Property Address',
      estimate.propertyAddress,
      null, 
      'Estimate Summary',
      'N/A in typical Roof Report'
    ));
    
    const estimateLineItemsValue = estimate.lineItems?.value;
    let foundEstimateRoofAreaSq: number | null = null;
    if (Array.isArray(estimateLineItemsValue)) {
        const roofAreaLineItem = estimateLineItemsValue.find(li => 
            (li.description?.toLowerCase().includes('roof') && li.description?.toLowerCase().includes('area')) || 
            (li.description?.toLowerCase().includes('shingles') && (li.description?.toLowerCase().includes('remove') || li.description?.toLowerCase().includes('replace')))
        );
        if (roofAreaLineItem && roofAreaLineItem.quantity) {
            const qty = parseFloat(roofAreaLineItem.quantity);
            if (!isNaN(qty)) {
                foundEstimateRoofAreaSq = qty / 100;
            }
        }
    }

    points.push(this.createComparisonPoint(
      'Total Roof Area (SQ)',
      foundEstimateRoofAreaSq !== null ? 
        { value: foundEstimateRoofAreaSq, confidence: 0.6, rationale: 'Inferred from line items (description match quantity / 100)', source: 'calculation', attempts: 1 } : 
        { value: null, confidence: 0.1, rationale: 'Not directly found or calculable from line items', source: 'fallback', attempts: 0 },
      roof?.totalRoofArea,
      'Estimate Line Items (calc)',
      'Roof Report Measurements'
    ));

    points.push(this.createComparisonPoint('Eave Length (LF)', estimate.eaveLength, roof?.eaveLength, 'Estimate Details', 'Roof Measurements'));
    points.push(this.createComparisonPoint('Rake Length (LF)', estimate.rakeLength, roof?.rakeLength, 'Estimate Details', 'Roof Measurements'));
    points.push(this.createComparisonPoint('Ridge/Hip Length (LF)', estimate.ridgeAndHipLength, roof?.ridgeHipLength, 'Estimate Details', 'Roof Measurements'));
    points.push(this.createComparisonPoint('Valley Length (LF)', estimate.valleyLength, roof?.valleyLength, 'Estimate Details', 'Roof Measurements'));
    points.push(this.createComparisonPoint('Roof Pitch', estimate.pitch, roof?.pitch, 'Estimate Details', 'Roof Measurements'));
    points.push(this.createComparisonPoint('Number of Stories', estimate.stories, roof?.stories, 'Estimate Details', 'Roof Measurements'));

    return points;
  }

  private createComparisonPoint<T extends string | number | Date | null | any[]>(
    field: string,
    estimateField: ExtractedField<T> | undefined | null,
    roofField: ExtractedField<T> | undefined | null,
    sourceEstimateContext: string,
    sourceRoofReportContext: string
  ): ComparisonPoint {
    const estValue = estimateField?.value;
    const roofValue = roofField?.value;
    let status: ComparisonPoint['status'] = 'NEEDS_VERIFICATION';
    let notes = '';
    const confidenceFactors: number[] = [];

    if (estimateField?.confidence) confidenceFactors.push(estimateField.confidence);
    if (roofField?.confidence) confidenceFactors.push(roofField.confidence);

    if (estValue !== undefined && estValue !== null && roofValue !== undefined && roofValue !== null) {
      const normEst = typeof estValue === 'string' ? estValue.trim().toLowerCase() : estValue;
      const normRoof = typeof roofValue === 'string' ? roofValue.trim().toLowerCase() : roofValue;
      
      if (normEst == normRoof) {
        status = 'MATCH';
        if (estimateField?.confidence && roofField?.confidence) {
            confidenceFactors.push((estimateField.confidence + roofField.confidence) / 2);
        }
      } else {
        status = 'MISMATCH';
        notes = `Estimate: ${estValue} (Conf: ${estimateField?.confidence?.toFixed(2)}), Report: ${roofValue} (Conf: ${roofField?.confidence?.toFixed(2)})`;
        confidenceFactors.push(Math.min(estimateField?.confidence || 0.5, roofField?.confidence || 0.5) * 0.7);
      }
    } else if (estValue !== undefined && estValue !== null) {
      status = 'MISSING_IN_ROOF_REPORT';
      notes = `Present in estimate: ${estValue}, but not in roof report.`;
      confidenceFactors.push(estimateField?.confidence || 0.6);
    } else if (roofValue !== undefined && roofValue !== null) {
      status = 'MISSING_IN_ESTIMATE';
      notes = `Present in roof report: ${roofValue}, but not in estimate.`;
      confidenceFactors.push(roofField?.confidence || 0.6);
    } else {
      status = 'NEEDS_VERIFICATION';
      notes = 'Data missing or unclear in both sources.';
      confidenceFactors.push(0.2);
    }

    const overallConfidence = confidenceFactors.length > 0 ? confidenceFactors.reduce((s, c) => s + c, 0) / confidenceFactors.length : 0.3;

    return {
      field,
      valueEstimate: estValue as string | number | null | undefined, // Cast to expected type
      valueRoofReport: roofValue as string | number | null | undefined, // Cast to expected type
      unitEstimate: (estimateField as any)?.unit,
      unitRoofReport: (roofField as any)?.unit,
      sourceEstimateContext: `${sourceEstimateContext} (Conf: ${estimateField?.confidence?.toFixed(2) || 'N/A'})`,
      sourceRoofReportContext: `${sourceRoofReportContext} (Conf: ${roofField?.confidence?.toFixed(2) || 'N/A'})`,
      status,
      notes,
      confidence: Math.max(0.05, Math.min(0.95, overallConfidence))
    };
  }

  private isExtractedField(obj: any): obj is ExtractedField<any> {
    return obj && typeof obj === 'object' && 'value' in obj && 'confidence' in obj && 'source' in obj;
  }

  private constructDiscrepancyPrompt(
    estimate: EstimateFieldExtractions,
    roof: RoofMeasurements | null,
    directComparisons: ComparisonPoint[],
    basePrompt?: string
  ): string {
    let prompt = basePrompt || "Analyze the following data from an insurance estimate and a roof measurement report. Identify key discrepancies, consistencies, and potential issues. Provide a concise summary and a list of actionable warnings or items needing verification.";

    const replacer = (key: string, value: any) => {
      if (this.isExtractedField(value)) {
        return value.value; // Only serialize the .value property
      }
      return value;
    };

    prompt += "\n\n== Estimate Data ==\n";
    prompt += JSON.stringify(estimate, replacer, 2);
    
    if (roof) {
      prompt += "\n\n== Roof Report Data ==\n";
      prompt += JSON.stringify(roof, replacer, 2);
    }

    prompt += "\n\n== Initial Field Comparisons ==\n";
    prompt += JSON.stringify(directComparisons.map(c => ({ 
        field: c.field, 
        estimate_value: c.valueEstimate, 
        roof_report_value: c.valueRoofReport, 
        status: c.status, 
        notes: c.notes 
    })), null, 2);

    prompt += "\n\n== Instructions ==\n";
    prompt += "Based on all the above, provide your analysis in JSON format with two keys: 'summary' (a string narrative) and 'warnings' (an array of strings). Focus on significant differences or confirmations that impact potential supplement items. Consider if measurements are reasonably consistent (e.g. roof area vs linear measurements). Flag any values that seem unusually high/low or if units might be mismatched.";
    prompt += " Example Warning: 'Roof area differs by >10% (Estimate: X sq, Report: Y sq). Verify correct area.'";

    return prompt;
  }

  private parseAIResponse(aiResponseText: string): { summary: string; warnings: string[] } {
    try {
      const cleanedResponse = aiResponseText.replace(/^```json\n|\n```$/gim, '').trim(); // More robust cleaning
      const parsed = JSON.parse(cleanedResponse);
      return {
        summary: parsed.summary || "AI analysis did not provide a summary.",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
      };
    } catch (error) {
      this.log(LogLevel.WARN, 'ai-response-parse-error', `Failed to parse AI response for discrepancy: ${error}. Raw: ${aiResponseText.substring(0, 300)}`, { error, agentType: this.agentType });
      return {
        summary: "Failed to parse AI summary. Raw response might contain insights.",
        warnings: ["AI response was not in the expected JSON format."]
      };
    }
  }

  private calculateOverallConsistency(comparisons: ComparisonPoint[], warnings: string[]): number {
    if (comparisons.length === 0) return 0.2;

    const matchWeight = 2;
    const mismatchWeight = -1.5;
    const missingWeight = -0.75;
    const needsVerificationWeight = -0.5;

    let score = 0;
    let totalPossibleScore = 0;

    comparisons.forEach(comp => {
      const confidence = comp.confidence || 0.5;
      totalPossibleScore += matchWeight * confidence;
      switch (comp.status) {
        case 'MATCH': score += matchWeight * confidence; break;
        case 'MISMATCH': score += mismatchWeight * confidence; break;
        case 'MISSING_IN_ESTIMATE':
        case 'MISSING_IN_ROOF_REPORT': score += missingWeight * confidence; break;
        case 'NEEDS_VERIFICATION':
        case 'PARTIAL_MATCH': score += needsVerificationWeight * confidence; break;
      }
    });

    let normalizedScore = 0.5;
    if (totalPossibleScore > 0) {
        normalizedScore = (score + totalPossibleScore) / (2 * totalPossibleScore);
        normalizedScore = Math.max(0.05, Math.min(0.95, normalizedScore));
    }
    
    const warningPenalty = warnings.length * 0.05;
    return Math.max(0.05, normalizedScore - warningPenalty);
  }

  async validate(result: DiscrepancyReport, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-discrepancy-report', `Validating discrepancy report for job ${result.jobId}`, { agentType: this.agentType });
    const errors: string[] = [];
    const warningsMsg: string[] = []; // Renamed to avoid conflict with function parameter name
    
    if (!result.jobId) errors.push('Job ID is missing from the report.');
    if (!result.comparisons) errors.push('Comparisons array is missing.');
    if (typeof result.overallConsistencyScore !== 'number' || result.overallConsistencyScore < 0 || result.overallConsistencyScore > 1) {
      errors.push(`Overall consistency score (${result.overallConsistencyScore}) is invalid.`);
    }

    if (result.comparisons.length === 0 && result.overallConsistencyScore > 0.3) {
        warningsMsg.push('Report has no comparisons but a non-low consistency score.');
    }
    if (result.aiSummary.includes("Failed") && result.overallConsistencyScore > 0.5){
        warningsMsg.push('AI Summary indicates failure, but consistency score is moderate/high.');
    }

    const confidence = result.overallConsistencyScore * 0.8 + (errors.length > 0 ? 0 : 0.2);

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0.1, Math.min(0.95, confidence)),
      errors,
      warnings: warningsMsg,
      suggestions: []
    };
  }
  
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-discrepancy-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`, { agentType: this.agentType });
    const configs: Record<string, AIConfig> = {};
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single();

      if (error) {
        this.log(LogLevel.WARN, 'discrepancy-config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`, { agentType: this.agentType });
        configs[stepName] = {
            step_name: stepName,
            prompt: "Analyze estimate and roof report data. Identify discrepancies, consistencies, and potential issues. Provide a JSON output with 'summary' (string) and 'warnings' (string[]).",
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-haiku-20240307' : 'gpt-3.5-turbo',
            temperature: 0.3,
            max_tokens: 1000,
        };
      } else if (data) {
        configs[stepName] = data as AIConfig;
      } else {
         this.log(LogLevel.WARN, 'discrepancy-config-not-found', `AI config not found for ${stepName}, using default.`, { agentType: this.agentType });
         configs[stepName] = {
            step_name: stepName,
            prompt: "Provide JSON with 'summary' and 'warnings' after analyzing estimate/roof data.",
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-haiku-20240307' : 'gpt-3.5-turbo',
            temperature: 0.3,
            max_tokens: 1000,
        }; 
      }
    }
    return configs;
  }

  // Using base class callAI method
} 