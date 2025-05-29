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
  OrchestrationOutput,
  SupervisorInput,
  SupervisorReport,
  JobStatus,
  ExtractedField
} from './types';
import { getSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

/**
 * SupervisorAgent reviews the output of the OrchestrationAgent, performs final quality checks,
 * and provides an overall assessment of the job processing.
 */
export class SupervisorAgent extends Agent {
  private supabase = getSupabaseClient();

  constructor() {
    const config: AgentConfig = {
      name: 'SupervisorAgent',
      version: '1.0.0',
      capabilities: ['final_quality_assurance', 'output_validation', 'status_assessment', 'ai_review'],
      defaultTimeout: 30000, // 30 seconds for review
      maxRetries: 1,
      confidenceThreshold: 0.75, // Supervisor needs high confidence in its own assessment
      tools: [] 
    };
    super(config);
  }

  get agentType(): AgentType {
    return AgentType.SUPERVISOR_AGENT;
  }

  async plan(input: SupervisorInput, context: TaskContext): Promise<AgentExecutionPlan> {
    this.log(LogLevel.INFO, 'planning-supervision', `Planning supervision for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const tasks = [
      {
        id: uuidv4(),
        type: 'supervise_orchestration_output',
        input: input,
        context,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    return { tasks, dependencies: new Map(), estimatedDuration: 15000, confidence: 0.9 };
  }

  async act(input: SupervisorInput, context: TaskContext): Promise<AgentResult<SupervisorReport>> {
    this.log(LogLevel.INFO, 'supervision-start', `Starting supervision for job ${input.jobId}`, { parentTaskId: context.taskId, agentType: this.agentType });
    const { orchestrationOutput, jobId } = input;

    const report: SupervisorReport = {
      jobId,
      finalStatus: JobStatus.PENDING, // Initial status, to be determined
      overallConfidence: 0.0,
      summary: 'Supervision in progress.',
      highlights: [],
      issuesToAddress: [],
      actionableSuggestions: [],
      orchestrationOutputSummary: {
        status: orchestrationOutput.status,
        estimateExtracted: !!orchestrationOutput.estimateExtraction?.data,
        roofReportExtracted: !!orchestrationOutput.roofReportExtraction?.data,
        discrepancyAnalyzed: !!orchestrationOutput.discrepancyAnalysis?.data,
        supplementsGenerated: !!orchestrationOutput.supplementGeneration?.data,
        errorCount: orchestrationOutput.errors.length
      }
    };

    // Rule-based checks
    this.performRuleBasedChecks(orchestrationOutput, report);

    // AI-driven review (optional, based on config and AI availability)
    if (this.openai || this.anthropic) {
      try {
        const aiConfigKey = 'supervisor_review_orchestration';
        const config = (await this.getAIConfigs([aiConfigKey]))[aiConfigKey];
        const prompt = this.constructSupervisorPrompt(orchestrationOutput, report.issuesToAddress, config.prompt);
        const aiResponse = await this.callAI(config, prompt, jobId);
        this.parseAndIntegrateAIResponse(aiResponse, report);
      } catch (error) {
        this.log(LogLevel.WARN, 'supervisor-ai-review-error', `Supervisor AI review failed: ${error}`, { jobId, error, agentType: this.agentType });
        report.issuesToAddress.push('AI-powered review could not be completed.');
        report.summary = 'Rule-based checks completed. AI review failed.';
      }
    }

    // Determine final status and confidence based on checks and AI review
    this.determineFinalStatusAndConfidence(report, orchestrationOutput);

    this.log(
        report.finalStatus === JobStatus.COMPLETED || report.finalStatus === JobStatus.PENDING ? LogLevel.SUCCESS : LogLevel.WARN, // PENDING might mean 'approved, pending user action'
        'supervision-complete', 
        `Supervision for job ${jobId} finished with status: ${report.finalStatus}. Confidence: ${report.overallConfidence.toFixed(3)}`, 
        { finalStatus: report.finalStatus, confidence: report.overallConfidence, agentType: this.agentType }
    );

    return {
      data: report,
      validation: await this.validate(report, context),
      processingTimeMs: 0, 
      model: (this.openai || this.anthropic) ? 'hybrid' : 'rules_based'
    };
  }
  
  private performRuleBasedChecks(orchestrationOutput: OrchestrationOutput, report: SupervisorReport): void {
    const { estimateExtraction, roofReportExtraction, discrepancyAnalysis, supplementGeneration, errors, status } = orchestrationOutput;

    if (status === JobStatus.FAILED) {
      report.issuesToAddress.push('Orchestration failed catastrophically. Manual review required for all aspects.');
      report.summary = 'Orchestration reported a full FAILED status.';
      return;
    }

    if (errors.length > 0) {
      report.issuesToAddress.push(`Orchestration reported ${errors.length} error(s). Please review orchestration logs and error details.`);
      errors.forEach(err => report.actionableSuggestions.push(`Review orchestration error: ${err.substring(0, 100)}...`));
    }

    if (!estimateExtraction?.data) {
      report.issuesToAddress.push('CRITICAL: Estimate data was not successfully extracted. This is a fundamental issue.');
    } else {
      const checkField = (fieldName: string, field: ExtractedField<any> | undefined, critical: boolean = false) => {
        if (!field || field.value === null || field.value === undefined || (typeof field.value === 'string' && !field.value.trim())) {
          const severity = critical ? 'CRITICAL' : 'WARNING';
          report.issuesToAddress.push(`${severity}: Required field '${fieldName}' is missing or empty in estimate extraction.`);
        } else if (field.confidence < 0.5) {
          report.issuesToAddress.push(`WARNING: Field '${fieldName}' in estimate has low confidence (${field.confidence.toFixed(2)}).`);
        }
      };
      // --- Mandatory Estimate Fields ---
      checkField('Property Address', estimateExtraction.data.propertyAddress, true);
      checkField('Total RCV', estimateExtraction.data.totalRCV, true);
      checkField('Claim Number', estimateExtraction.data.claimNumber, true);
      checkField('Insurance Carrier', estimateExtraction.data.insuranceCarrier, true);
      if (estimateExtraction.data.lineItems.value && estimateExtraction.data.lineItems.value.length > 0) {
        report.highlights.push('Estimate line items were extracted.');
      } else {
        report.issuesToAddress.push('WARNING: No line items extracted from estimate.');
      }
    }

    if (orchestrationOutput.wasRoofReportProvided && !roofReportExtraction?.data) {
      report.issuesToAddress.push('CRITICAL: Roof report was provided but data extraction failed or yielded no results.');
    }
    
    if (roofReportExtraction?.data) {
      const checkRoofField = (fieldName: string, field: ExtractedField<any> | undefined) => {
        const roofExtractionConfidence = roofReportExtraction?.validation?.confidence ?? 0;

        const fieldMissing = !field || field.value === null || field.value === undefined || (typeof field.value === 'string' && !field.value.toString().trim());

        if (fieldMissing) {
          const severity = roofExtractionConfidence < 0.5 ? 'WARNING' : 'CRITICAL';
          report.issuesToAddress.push(`${severity}: Required roof measurement field '${fieldName}' is missing or empty.`);
        } else if (field.confidence < 0.5) {
          report.issuesToAddress.push(`WARNING: Roof field '${fieldName}' has low confidence (${field.confidence.toFixed(2)}).`);
        }
      };

      // --- Mandatory Roof Measurement Fields ---
      checkRoofField('Total Roof Area', roofReportExtraction.data.totalRoofArea);
      checkRoofField('Eave Length', roofReportExtraction.data.eaveLength);
      checkRoofField('Rake Length', roofReportExtraction.data.rakeLength);
      checkRoofField('Ridge/Hip Length', roofReportExtraction.data.ridgeHipLength);
      checkRoofField('Valley Length', roofReportExtraction.data.valleyLength);
      checkRoofField('Stories', roofReportExtraction.data.stories);
      checkRoofField('Pitch', roofReportExtraction.data.pitch);
    }

    if (discrepancyAnalysis?.data) {
        if (discrepancyAnalysis.data.overallConsistencyScore < 0.5) {
            report.issuesToAddress.push(`WARNING: Discrepancy analysis resulted in low consistency score (${discrepancyAnalysis.data.overallConsistencyScore.toFixed(2)}).`);
        }
        if (discrepancyAnalysis.data.consistencyWarnings.length > 0) {
            report.actionableSuggestions.push(...discrepancyAnalysis.data.consistencyWarnings.map(w => `Address discrepancy warning: ${w}`));
        }
        report.highlights.push('Discrepancy analysis was performed.');
    } else if (estimateExtraction?.data) { // Only an issue if estimate data was there for it to run
        report.issuesToAddress.push('WARNING: Discrepancy analysis did not run or produce output, despite estimate data being available.');
    }

    if (supplementGeneration?.data) {
        if (supplementGeneration.data.generatedSupplements.length > 0) {
            report.highlights.push(`${supplementGeneration.data.generatedSupplements.length} supplement item(s) were suggested.`);
        }
        if (supplementGeneration.data.overallConfidence < 0.6) {
            report.issuesToAddress.push(`WARNING: Supplement generation has low overall confidence (${supplementGeneration.data.overallConfidence.toFixed(2)}).`);
        }
        if (supplementGeneration.data.issuesOrSuggestions.length > 0) {
            report.actionableSuggestions.push(...supplementGeneration.data.issuesOrSuggestions.map(is => `Note supplement generation issue/suggestion: ${is}`));
        }
    } else if (estimateExtraction?.data) { // Only an issue if estimate data was there for it to run
         report.issuesToAddress.push('WARNING: Supplement generation did not run or produce output, despite estimate data being available.');
    }
  }

  private constructSupervisorPrompt(orchestrationOutput: OrchestrationOutput, ruleBasedIssues: string[], basePrompt?: string): string {
    let prompt = basePrompt || "You are a senior quality assurance specialist for roofing claim estimates. Review the following automated processing results and provide a final assessment.";

    prompt += "\n\n== Orchestration Summary ==\n";
    prompt += `Job Status: ${orchestrationOutput.status}\n`;
    prompt += `Errors Reported: ${orchestrationOutput.errors.length}\n`;
    prompt += `Estimate Extracted: ${!!orchestrationOutput.estimateExtraction?.data}\n`;
    if (orchestrationOutput.estimateExtraction?.data) {
      prompt += `  - Address Conf: ${orchestrationOutput.estimateExtraction.data.propertyAddress?.confidence.toFixed(2)}\n`;
      prompt += `  - Total RCV Conf: ${orchestrationOutput.estimateExtraction.data.totalRCV?.confidence.toFixed(2)}\n`;
    }
    prompt += `Roof Report Extracted: ${!!orchestrationOutput.roofReportExtraction?.data}\n`;
    prompt += `Discrepancy Analyzed: ${!!orchestrationOutput.discrepancyAnalysis?.data}\n`;
    if (orchestrationOutput.discrepancyAnalysis?.data) {
      prompt += `  - Consistency Score: ${orchestrationOutput.discrepancyAnalysis.data.overallConsistencyScore.toFixed(2)}\n`;
    }
    prompt += `Supplements Generated: ${!!orchestrationOutput.supplementGeneration?.data}\n`;
    if (orchestrationOutput.supplementGeneration?.data) {
      prompt += `  - Supplement Items: ${orchestrationOutput.supplementGeneration.data.generatedSupplements.length}\n`;
      prompt += `  - Supplement Confidence: ${orchestrationOutput.supplementGeneration.data.overallConfidence.toFixed(2)}\n`;
    }

    prompt += "\n\n== Rule-Based Issues Identified Prior to Your Review ==\n";
    if (ruleBasedIssues.length > 0) {
      ruleBasedIssues.forEach(issue => prompt += `- ${issue}\n`);
    } else {
      prompt += "No major rule-based issues flagged.\n";
    }

    prompt += "\n\n== Instructions for Your Review ==\n";
    prompt += "Provide your final assessment in JSON format. The JSON object should have the following keys:";
    prompt += "\n- \"ai_summary\": A concise paragraph summarizing the overall quality and key findings.";
    prompt += "\n- \"ai_highlights\": An array of strings for any positive aspects or strong results you observed.";
    prompt += "\n- \"ai_issues_to_address\": An array of strings for critical or major issues you identified that need human attention.";
    prompt += "\n- \"ai_actionable_suggestions\": An array of strings for suggestions on how to improve this specific result or for future processing.";
    prompt += "\nFocus on whether the combined output is reliable enough for a human to use. Consider if any data seems contradictory or nonsensical even if individual agent confidence was high. Flag if critical data points are missing or highly suspect.";
    prompt += "\nIf the overall result is good, say so. If it has problems, be specific.";
    return prompt;
  }

  private parseAndIntegrateAIResponse(aiResponseText: string, report: SupervisorReport): void {
    try {
      const cleanedResponse = aiResponseText.replace(/^```json\n|\n```$/gim, '').trim();
      const parsed = JSON.parse(cleanedResponse);

      if (parsed.ai_summary && typeof parsed.ai_summary === 'string') {
        report.summary = parsed.ai_summary;
      }
      if (Array.isArray(parsed.ai_highlights)) {
        report.highlights.push(...parsed.ai_highlights.map(String));
      }
      if (Array.isArray(parsed.ai_issues_to_address)) {
        report.issuesToAddress.push(...parsed.ai_issues_to_address.map(String));
      }
      if (Array.isArray(parsed.ai_actionable_suggestions)) {
        report.actionableSuggestions.push(...parsed.ai_actionable_suggestions.map(String));
      }
    } catch (error) {
      this.log(LogLevel.WARN, 'supervisor-ai-response-parse-error', `Failed to parse AI supervisor response: ${error}. Raw: ${aiResponseText.substring(0, 300)}`, { error, agentType: this.agentType });
      report.issuesToAddress.push('AI supervisor review response was not in the expected JSON format.');
    }
  }

  private determineFinalStatusAndConfidence(report: SupervisorReport, orchestrationOutput: OrchestrationOutput): void {
    let confidence = 0.7; // Base if all seems okay

    const hasCritical = report.issuesToAddress.some(issue => issue.startsWith('CRITICAL'));
    const orchestratorFailed = orchestrationOutput.status === JobStatus.FAILED;
    const orchestratorPartial = orchestrationOutput.status === JobStatus.FAILED_PARTIAL;

    if (orchestratorFailed) {
      report.finalStatus = JobStatus.FAILED;
      report.summary = report.summary || 'Critical failure during orchestration process.';
      confidence = 0.05;
    } else if (hasCritical || orchestratorPartial) {
      // Real errors that block automated completion
      report.finalStatus = JobStatus.FAILED_PARTIAL;
      report.summary = report.summary || 'Critical or blocking issues identified. Manual review required.';
      confidence = 0.2;
    } else {
      // Only warnings / low-confidence issues
      report.finalStatus = JobStatus.COMPLETED;
      if (report.issuesToAddress.length > 0) {
        // downgrade confidence but still succeed
        confidence = 0.6;
        report.summary = report.summary || 'Completed with warnings that should be reviewed.';
      } else {
        confidence = 0.9;
        report.summary = report.summary || 'Supervision completed. All checks passed.';
      }
      report.highlights.push('Process completed without critical issues.');
    }
    
    // Factor in orchestrator's confidence
    const orchestratorConfidence = orchestrationOutput.estimateExtraction?.validation.confidence || 0.5; // Example, could be more nuanced
    report.overallConfidence = Math.max(0.05, Math.min(0.95, (confidence + orchestratorConfidence)/2));
    
    if (report.summary === 'Supervision in progress.' && !report.issuesToAddress.length && !report.highlights.length) {
        report.summary = 'Automated supervision checks completed. No specific AI summary was generated or rule-based issues found beyond orchestration status.';
    }
}


  async validate(result: SupervisorReport, context: TaskContext): Promise<ValidationResult> {
    this.log(LogLevel.INFO, 'validating-supervisor-report', `Validating supervisor report for job ${result.jobId}`, { agentType: this.agentType });
    const errors: string[] = [];
    if (!result.jobId) errors.push('Job ID is missing.');
    if (!result.finalStatus) errors.push('Final status is missing.');
    if (typeof result.overallConfidence !== 'number' || result.overallConfidence < 0 || result.overallConfidence > 1) {
      errors.push(`Overall confidence (${result.overallConfidence}) is invalid.`);
    }
    if (!result.summary) errors.push('Summary is missing.');
    if (!Array.isArray(result.issuesToAddress)) errors.push('issuesToAddress is not an array.');

    return {
      isValid: errors.length === 0,
      confidence: errors.length > 0 ? 0.3 : 0.95, // Confidence in the report structure itself
      errors,
      warnings: [],
      suggestions: []
    };
  }
  
  private async getAIConfigs(stepNames: string[]): Promise<Record<string, AIConfig>> {
    this.log(LogLevel.DEBUG, 'get-supervisor-ai-configs', `Fetching AI configs for: ${stepNames.join(', ')}`, { agentType: this.agentType });
    const configs: Record<string, AIConfig> = {};
    for (const stepName of stepNames) {
      const { data, error } = await this.supabase
        .from('ai_configs')
        .select('*')
        .eq('step_name', stepName)
        .single();

      if (error) {
        this.log(LogLevel.WARN, 'supervisor-config-fetch-error', `Error fetching AI config for ${stepName}: ${error.message}`, { agentType: this.agentType });
        configs[stepName] = {
            step_name: stepName,
            prompt: "Review the provided job processing summary. Identify highlights, critical issues, and actionable suggestions. Respond in JSON with keys: ai_summary, ai_highlights, ai_issues_to_address, ai_actionable_suggestions.",
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-sonnet-20240229' : 'gpt-4-turbo-preview',
            temperature: 0.5,
            max_tokens: 1000,
            json_mode: true
        };
      } else if (data) {
        // Map database columns to AIConfig interface
        configs[stepName] = {
          step_name: data.step_name,
          prompt: data.prompt,
          model_provider: data.provider, // Map database 'provider' to 'model_provider'
          model_name: data.model, // Map database 'model' to 'model_name'
          temperature: data.temperature,
          max_tokens: data.max_tokens,
          json_mode: true
        }
      } else {
         this.log(LogLevel.WARN, 'supervisor-config-not-found', `AI config not found for ${stepName}, using default.`, { agentType: this.agentType });
         configs[stepName] = { // Same default as error case
            step_name: stepName,
            prompt: "Review job summary. Provide JSON: ai_summary, ai_highlights, ai_issues_to_address, ai_actionable_suggestions.",
            model_provider: this.anthropic ? 'anthropic' : 'openai',
            model_name: this.anthropic ? 'claude-3-sonnet-20240229' : 'gpt-4-turbo-preview',
            temperature: 0.5,
            max_tokens: 1000,
            json_mode: true
        }; 
      }
    }
    return configs;
  }
} 