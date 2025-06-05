import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { JobData, LineItem } from '@/types';

/**
 * Core types and interfaces for the agentic workflow system
 */

export interface ExtractedField<T> {
  value: T;
  confidence: number;
  rationale: string;
  source: 'text' | 'vision' | 'hybrid' | 'user_input' | 'calculation' | 'fallback' | 'combined';
  attempts: number;
  pageNumber?: number; // Optional: page number where info was found
  coordinates?: string; // Optional: coordinates of the found element on the page (e.g., "x1,y1,x2,y2")
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface AgentResult<T = any> {
  data: T;
  validation: ValidationResult;
  processingTimeMs: number;
  model?: string; // Which AI model was used
  cost?: number; // API cost in USD
}

export interface TaskContext {
  jobId: string; // Overall job ID
  taskId: string; // ID for this specific task
  parentTaskId?: string; // ID of the parent task, if any
  priority: number; // Priority of the task (e.g., 1-5, 1 highest) - Adjusted to number
  timeoutMs?: number; // Specific timeout for this task
  maxRetries?: number; // Maximum number of retries allowed for this task
  retryCount?: number; // Current retry attempt number (internal use)
}

export interface AgentConfig {
  name: string;
  version: string;
  capabilities: string[];
  defaultTimeout: number; // Milliseconds
  maxRetries: number;
  confidenceThreshold: number; // 0-1 scale, minimum confidence for result to be considered good
  tools?: string[]; // List of tools this agent might use (conceptual)
}

export interface Tool {
  name: string;
  description: string;
  execute: (input: any, context?: TaskContext) => Promise<any>;
  isAvailable?: () => Promise<boolean> | boolean;
}

export interface AgentTask {
  id: string;
  type: string; 
  input: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  result?: AgentResult;
  error?: string;
  attempts?: number;
  createdAt: Date;
  updatedAt: Date;
  context: TaskContext;
  logs?: Array<{ timestamp: Date; level: LogLevel; message: string; details?: any }>;
}

export interface AgentExecutionPlan {
  tasks: AgentTask[];
  dependencies: Map<string, string[]>; // taskId -> array of prerequisite taskIds
  estimatedDuration: number; // in milliseconds
  confidence: number; // 0-1 initial confidence in this plan
}

export enum ExtractionStrategy {
  TEXT_ONLY = 'TEXT_ONLY',
  VISION_ONLY = 'VISION_ONLY',
  HYBRID = 'HYBRID',
  FALLBACK = 'FALLBACK'
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export enum AgentType {
  BASE_AGENT = 'BaseAgent',
  ORCHESTRATION_AGENT = 'OrchestrationAgent',
  SUPERVISOR_AGENT = 'SupervisorAgent',
  ESTIMATE_EXTRACTOR = 'EstimateExtractorAgent',
  ROOF_REPORT_EXTRACTOR = 'RoofReportExtractorAgent',
  DISCREPANCY_ANALYZER = 'DiscrepancyAnalyzerAgent',
  SUPPLEMENT_GENERATOR = 'SupplementGeneratorAgent'
}

export interface EstimateLineItem {
  description: string | null;
  quantity: string;
  unit: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  category?: string | null;
  notes?: string | null;
  isUserDefined?: boolean;
  confidence?: number;
  source?: 'text' | 'vision' | 'hybrid';
}

export interface EstimateFieldExtractions {
  propertyAddress: ExtractedField<string | null>;
  claimNumber: ExtractedField<string | null>;
  policyNumber?: ExtractedField<string | null>;
  insuranceCarrier: ExtractedField<string | null>;
  insuredName?: ExtractedField<string | null>;
  dateOfLoss: ExtractedField<Date | string | null>;
  totalRCV: ExtractedField<number | null>;
  totalACV: ExtractedField<number | null>;
  deductible: ExtractedField<number | null>;
  lineItems: ExtractedField<EstimateLineItem[]>;
  eaveLength?: ExtractedField<number | null>;
  rakeLength?: ExtractedField<number | null>;
  ridgeAndHipLength?: ExtractedField<number | null>;
  valleyLength?: ExtractedField<number | null>;
  stories?: ExtractedField<number | null>;
  pitch?: ExtractedField<string | null>;
}

export interface RoofMeasurements {
  totalRoofArea: ExtractedField<number | null>;
  eaveLength: ExtractedField<number | null>;
  rakeLength: ExtractedField<number | null>;
  ridgeHipLength: ExtractedField<number | null>;
  valleyLength: ExtractedField<number | null>;
  stories: ExtractedField<number | null>;
  pitch: ExtractedField<string | null>;
  facets?: ExtractedField<number | null>;
}

export interface SupplementRecommendation {
  id: string;
  description: string;
  quantity: ExtractedField<number>;
  unit: string;
  reason: string;
  confidence: number;
  xactimateCode?: string;
  category: 'missing' | 'quantity_mismatch' | 'upgrade' | 'code_requirement';
  priority: 'low' | 'medium' | 'high' | 'critical'; // Priority here is string based for rules
  supporting_evidence?: string[];
}

export interface GeneratedSupplementItem {
  id: string;
  xactimateCode: string;
  description: string;
  quantity: number;
  unit: string;
  justification: string;
  sourceRecommendationId?: string;
  confidence: number;
}

// Moved AIConfig to be more comprehensive, matching EstimateExtractorAgent
export interface AIConfig {
  id?: string; 
  step_name: string; 
  prompt: string; 
  model_provider: 'openai' | 'anthropic' | string; 
  model_name: string; 
  temperature?: number; 
  max_tokens?: number; 
  json_mode?: boolean; 
  version?: number; 
  created_at?: string;
  updated_at?: string;
}

export interface AgentPerformanceMetrics {
  agentName: string;
  agentVersion: string;
  taskId: string;
  jobId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  inputSize?: number;
  outputSize?: number;
  confidenceScore?: number;
  modelUsed?: string;
  cost?: number;
  status: 'success' | 'failure';
  errorMessage?: string;
  retryCount?: number;
  toolsUsed?: string[];
}

export type LLMProviderType = 'openai' | 'anthropic';

export interface VisionModelLog {
  timestamp: Date;
  provider: LLMProviderType;
  model: string;
  jobId?: string;
  taskId?: string;
  promptTokenCount?: number;
  completionTokenCount?: number;
  totalTokenCount?: number;
  cost?: number;
  latencyMs?: number;
  error?: string;
  imageCount: number;
  imageDetails?: Array<{ width?: number; height?: number; sizeBytes?: number }>;
  response?: any;
}

export interface TextModelLog {
  timestamp: Date;
  provider: LLMProviderType;
  model: string;
  jobId?: string;
  taskId?: string;
  promptTokenCount?: number;
  completionTokenCount?: number;
  totalTokenCount?: number;
  cost?: number;
  latencyMs?: number;
  error?: string;
  requestPayload?: any;
  responsePayload?: any;
}

// Orchestration Specific Types to be added next
// export enum JobStatus { ... }
// export interface OrchestrationOutput { ... }
// Need to ensure DiscrepancyAnalysisOutput and SupplementGenerationOutput are usable or use 'any'
// if direct import causes circular deps in OrchestrationOutput.

// Placeholder basic types to avoid circular dependencies if these are defined later in a more complex way.
// If DiscrepancyAnalysisOutput and SupplementGenerationOutput are already defined below, this is fine.
// If not, these act as minimal definitions.
export interface DiscrepancyAnalysisOutput {
  // Define basic structure or use 'any' if complex and defined elsewhere
  [key: string]: any;
}
export interface SupplementGenerationOutput {
  // Define basic structure or use 'any' if complex and defined elsewhere
  [key: string]: any;
}

export enum JobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED', // Only for catastrophic failures with no estimate data extracted
  FAILED_PARTIAL = 'FAILED_PARTIAL', // Has estimate data but truly critical errors (rare, treated as completed in DB)
  CANCELLED = 'CANCELLED'
}

export interface OrchestrationOutput {
  jobId: string;
  status: JobStatus;
  wasRoofReportProvided?: boolean;
  estimateExtraction?: AgentResult<EstimateFieldExtractions>;
  roofReportExtraction?: AgentResult<RoofMeasurements>;
  discrepancyAnalysis?: AgentResult<DiscrepancyReport>;
  supplementGeneration?: AgentResult<SupplementGenerationOutput>;
  errors: string[];
  warnings: string[];
  finalSupplementText?: string;
}

/**
 * Input for the SupervisorAgent.
 */
export interface SupervisorInput {
  jobId: string;
  orchestrationOutput: OrchestrationOutput;
  // Could include original PDFs or file paths if supervisor needs to re-verify against source for some checks
  // estimatePdfPath?: string;
  // roofReportPdfPath?: string;
}

/**
 * Output structure for the SupervisorAgent.
 */
export interface SupervisorReport {
  jobId: string;
  finalStatus: JobStatus; // e.g., APPROVED, NEEDS_REVIEW, REJECTED_CRITICAL_ERRORS
  overallConfidence: number; // Supervisor's confidence in the final combined output (0-1)
  summary: string; // Supervisor's summary of the job processing
  highlights: string[]; // Key positive findings or successful extractions
  issuesToAddress: string[]; // Specific issues that need manual review or correction
  actionableSuggestions: string[]; // Suggestions for improvement or next steps
  // Reference to the orchestration output for full details
  orchestrationOutputSummary: {
    status: JobStatus;
    estimateExtracted: boolean;
    roofReportExtracted: boolean;
    discrepancyAnalyzed: boolean;
    supplementsGenerated: boolean;
    errorCount: number;
  };
}

// Structured log entry used by Agent base class
export interface AgentLog {
  timestamp: Date;
  level: LogLevel;
  agentType: AgentType;
  taskId: string;
  message: string;
  data?: any;
  duration?: number;
}

/**
 * Describes a specific point of comparison between two data sources.
 */
export interface ComparisonPoint {
  field: string; // e.g., "Total Roof Area", "Property Address"
  valueEstimate: string | number | null | undefined;
  valueRoofReport: string | number | null | undefined;
  unitEstimate?: string;
  unitRoofReport?: string;
  sourceEstimateContext: string; // Where in the estimate this was found (e.g., "Summary", "Line Item X")
  sourceRoofReportContext: string; // Where in the roof report (e.g., "Measurements Table", "Diagram Notes")
  status: 'MATCH' | 'MISMATCH' | 'MISSING_IN_ESTIMATE' | 'MISSING_IN_ROOF_REPORT' | 'PARTIAL_MATCH' | 'NEEDS_VERIFICATION';
  notes?: string; // Any specific observations by the agent
  confidence: number; // Confidence in this specific comparison (0-1)
}

/**
 * Output of the DiscrepancyAnalysisAgent.
 */
export interface DiscrepancyReport {
  jobId: string;
  comparisons: ComparisonPoint[];
  aiSummary: string; // AI-generated summary of key discrepancies and agreements
  consistencyWarnings: string[]; // e.g., "Eave length in estimate seems high for the given roof area from report."
  overallConsistencyScore: number; // 0-1 score indicating overall agreement
}

/**
 * Input for the SupplementGeneratorAgent.
 */
export interface SupplementGeneratorInput {
  jobId: string;
  jobData: JobData; // The comprehensive, saved JobData object from @/types
  actualEstimateLineItems: LineItem[]; // The array of line items from the estimate, from @/types
  // The following fields are kept commented if OrchestrationAgent no longer passes them directly
  // or if SupplementGeneratorAgent will now rely solely on jobData and actualEstimateLineItems
  // for the AIOrchestrator call.
  // estimateExtractionData?: EstimateFieldExtractions | null; 
  // roofReportData?: RoofMeasurements | null;
  // discrepancyReport?: DiscrepancyReport | null;
  // estimateLineItems?: ExtractedField<EstimateLineItem[] | null>; // This was the old way of passing line items
}

/**
 * Output structure for the SupplementGeneratorAgent.
 */
export interface SupplementGenerationOutput {
    jobId: string;
    generatedSupplements: GeneratedSupplementItem[]; // Existing type
    supplementRationales: Record<string, string>; // Keyed by supplement item ID or description
    issuesOrSuggestions: string[]; // Any problems encountered or suggestions for improvement
    overallConfidence: number; // Confidence in the generated set of supplements
}