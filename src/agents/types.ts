/**
 * Core types and interfaces for the agentic workflow system
 */

export interface ExtractedField<T = any> {
  value: T;
  confidence: number; // 0-1 scale
  rationale?: string; // Why we believe this value is correct
  source: 'text' | 'vision' | 'hybrid' | 'fallback';
  attempts: number; // How many extraction attempts were made
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
  jobId: string;
  taskId: string;
  parentTaskId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  maxRetries: number;
  retryCount: number;
  timeoutMs: number;
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  name: string;
  version: string;
  capabilities: string[];
  defaultTimeout: number;
  maxRetries: number;
  confidenceThreshold: number; // Minimum confidence to accept result
  tools: string[]; // List of tool names this agent can use
}

// This was previously in @/types, ensure it's compatible or adjust
export interface AIConfig {
  id?: string;
  step_name: string;
  prompt: string;
  model_provider: 'openai' | 'anthropic';
  model_name: string;
  temperature?: number;
  max_tokens?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Tool {
  name: string;
  description: string;
  execute: (input: any, context: TaskContext) => Promise<any>;
  validate?: (input: any) => Promise<ValidationResult>;
}

export interface AgentTask {
  id: string;
  type: string;
  input: any;
  context: TaskContext;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  result?: AgentResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface AgentExecutionPlan {
  tasks: AgentTask[];
  dependencies: Map<string, string[]>; // taskId -> prerequisite taskIds
  estimatedDuration: number;
  confidence: number;
}

// Specific data types for our roofing domain
export interface EstimateFieldExtractions {
  propertyAddress: ExtractedField<string | null>;
  claimNumber: ExtractedField<string | null>;
  insuranceCarrier: ExtractedField<string | null>;
  dateOfLoss: ExtractedField<Date | null>;
  totalRCV: ExtractedField<number | null>;
  totalACV: ExtractedField<number | null>;
  deductible: ExtractedField<number | null>;
  lineItems: ExtractedField<any[]>; // Assuming line items are arrays of objects
}

export interface RoofMeasurements {
  totalRoofArea: ExtractedField<number>; // in squares
  eaveLength: ExtractedField<number>; // in linear feet
  rakeLength: ExtractedField<number>;
  ridgeHipLength: ExtractedField<number>;
  valleyLength: ExtractedField<number>;
  stories: ExtractedField<number>;
  pitch: ExtractedField<string>; // e.g., "7/12"
  facets: ExtractedField<number>;
}

export interface SupplementRecommendation {
  id: string;
  description: string;
  quantity: ExtractedField<number>;
  unit: string;
  reason: string;
  confidence: number;
  xactimateCode?: string;
  category: 'missing' | 'insufficient' | 'upgrade' | 'correction';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  supporting_evidence: string[];
}

// Agent-specific enums
export enum AgentType {
  ESTIMATE_EXTRACTOR = 'estimate_extractor',
  ROOF_REPORT_EXTRACTOR = 'roof_report_extractor',
  DISCREPANCY_ANALYZER = 'discrepancy_analyzer',
  SUPPLEMENT_GENERATOR = 'supplement_generator',
  ORCHESTRATOR = 'orchestrator',
  SUPERVISOR = 'supervisor'
}

export enum ExtractionStrategy {
  TEXT_ONLY = 'text_only',
  VISION_ONLY = 'vision_only',
  HYBRID = 'hybrid',
  FALLBACK = 'fallback'
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success'
}

export interface AgentLog {
  timestamp: Date;
  level: LogLevel;
  agentType: AgentType;
  taskId: string;
  message: string;
  data?: any;
  duration?: number;
}

// Represents a line item extracted from an estimate
export interface EstimateLineItem {
  description: string | null;
  quantity: string; // Keep as string for flexibility, parse as needed
  unit: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  category?: string | null; // e.g., Roofing, Siding, Gutters
  notes?: string | null;
  isUserDefined?: boolean; // True if manually added/edited by user
  confidence?: number; // Confidence in this specific line item extraction
  source?: 'text' | 'vision' | 'hybrid';
}

// For EstimateExtractorAgent
export interface EstimateFieldExtractions {
  propertyAddress: ExtractedField<string | null>;
  claimNumber: ExtractedField<string | null>;
  policyNumber?: ExtractedField<string | null>; // Optional
  carrierName?: ExtractedField<string | null>; // Optional
  insuredName?: ExtractedField<string | null>; // Optional
  dateOfLoss: ExtractedField<Date | string | null>; // Allow string for initial parsing
  rcv: ExtractedField<number | null>;
  acv?: ExtractedField<number | null>; // Optional
  deductible?: ExtractedField<number | null>; // Optional
  lineItems: ExtractedField<EstimateLineItem[]>;
  // Add other relevant summary fields if needed (e.g., total tax, overhead & profit)
}

// For RoofReportExtractorAgent
export interface RoofMeasurements {
  totalRoofArea: ExtractedField<number | null>; // Typically in squares (1 sq = 100 sq ft)
  eaveLength: ExtractedField<number | null>; // Linear feet
  rakeLength: ExtractedField<number | null>; // Linear feet
  ridgeHipLength: ExtractedField<number | null>; // Linear feet (ridges + hips)
  valleyLength: ExtractedField<number | null>; // Linear feet
  stories: ExtractedField<number | null>; // Number of stories (e.g., 1, 2)
  pitch: ExtractedField<string | null>; // e.g., "6/12", "8/12"
  facets?: ExtractedField<number | null>; // Number of distinct roof facets/planes
  // Consider adding fields for penetrations, waste factor if extractable
}

// For DiscrepancyAnalyzerAgent - used in SupplementRules
export interface SupplementRecommendation {
  id: string; // Unique ID for this recommendation
  description: string;
  quantity: ExtractedField<number>; // Quantity needed
  unit: string; // e.g., LF, SF, SQ, EA
  reason: string; // Why this item is recommended
  confidence: number; // Confidence in this recommendation
  xactimateCode?: string; // Optional Xactimate code
  category: 'missing' | 'quantity_mismatch' | 'upgrade' | 'code_requirement';
  priority: 'low' | 'medium' | 'high' | 'critical';
  supporting_evidence?: string[]; // Links or references to support the recommendation
  // Potential future fields: price_impact, notes for user
}

// For SupplementGeneratorAgent - the formatted output of a supplement item
export interface GeneratedSupplementItem {
  id: string; // Can be same as recommendation ID or new
  xactimateCode: string;
  description: string;
  quantity: number;
  unit: string;
  justification: string; // Well-formatted reason, potentially LLM-enhanced
  sourceRecommendationId?: string; // ID of the SupplementRecommendation it came from
  confidence: number; // Confidence in the final generated text and values
  // Optional: pricing info, notes for adjuster
}