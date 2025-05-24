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
  propertyAddress: ExtractedField<string>;
  claimNumber: ExtractedField<string>;
  insuranceCarrier: ExtractedField<string>;
  dateOfLoss: ExtractedField<Date | null>;
  totalRCV: ExtractedField<number>;
  totalACV: ExtractedField<number>;
  deductible: ExtractedField<number>;
  lineItems: ExtractedField<any[]>;
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