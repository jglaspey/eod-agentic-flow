import { EstimateFieldExtractions, RoofMeasurements, SupplementRecommendation, ExtractedField } from '../types';

export interface RuleContext {
  estimate: EstimateFieldExtractions;
  roofReport: RoofMeasurements;
  // Potentially add other contextual data like job type, location for regional codes, etc.
}

export interface SupplementRule {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  condition: (context: RuleContext) => boolean; // Function to check if the rule applies
  action: (context: RuleContext) => SupplementRecommendation | null; // Function to generate a recommendation
}

/**
 * Example Rule: Check for missing starter shingles if there are eaves and roof area.
 */
const missingStarterShinglesRule: SupplementRule = {
  id: 'MISSING_STARTER',
  name: 'Missing Starter Shingles',
  description: 'Checks if starter shingles are included when eave length is present.',
  priority: 'high',
  condition: (context: RuleContext): boolean => {
    const { estimate, roofReport } = context;
    const hasEaves = roofReport.eaveLength?.value && roofReport.eaveLength.value > 0;
    if (!hasEaves) return false;

    // Check if starter shingles are already in the estimate line items
    const hasStarterInEstimate = estimate.lineItems?.value?.some(item => 
      item.description?.toLowerCase().includes('starter')
    );
    return !hasStarterInEstimate;
  },
  action: (context: RuleContext): SupplementRecommendation => {
    const quantity = context.roofReport.eaveLength.value || 0;
    return {
      id: uuidv4(), // Generate a unique ID for this recommendation instance
      description: 'Starter Shingles (Linear Feet)',
      quantity: {
        value: quantity,
        confidence: context.roofReport.eaveLength.confidence, // Base on eave confidence
        rationale: 'Calculated based on eave length from roof report.',
        source: 'hybrid',
        attempts: 1
      },
      unit: 'LF',
      reason: 'Starter shingles are required along all eave lengths.',
      confidence: context.roofReport.eaveLength.confidence * 0.9, // Overall confidence for this item
      xactimateCode: 'RFG STAR', // Example Xactimate code
      category: 'missing',
      priority: 'high',
      supporting_evidence: [`Eave length: ${quantity} LF from roof report.`]
    };
  }
};

/**
 * Example Rule: Check for missing ridge cap if ridge/hip length is present.
 */
const missingRidgeCapRule: SupplementRule = {
  id: 'MISSING_RIDGE_CAP',
  name: 'Missing Ridge Cap',
  description: 'Checks if ridge cap is included when ridge/hip length is present.',
  priority: 'high',
  condition: (context: RuleContext): boolean => {
    const { estimate, roofReport } = context;
    const hasRidgeHip = roofReport.ridgeHipLength?.value && roofReport.ridgeHipLength.value > 0;
    if (!hasRidgeHip) return false;

    const hasRidgeCapInEstimate = estimate.lineItems?.value?.some(item =>
      item.description?.toLowerCase().includes('ridge cap') || 
      item.description?.toLowerCase().includes('hip & ridge')
    );
    return !hasRidgeCapInEstimate;
  },
  action: (context: RuleContext): SupplementRecommendation => {
    const quantity = context.roofReport.ridgeHipLength.value || 0;
    return {
      id: uuidv4(),
      description: 'Ridge Cap Shingles (Linear Feet)',
      quantity: {
        value: quantity,
        confidence: context.roofReport.ridgeHipLength.confidence,
        rationale: 'Calculated based on ridge & hip length from roof report.',
        source: 'hybrid',
        attempts: 1
      },
      unit: 'LF',
      reason: 'Ridge cap shingles are required along all ridge and hip lengths.',
      confidence: context.roofReport.ridgeHipLength.confidence * 0.9,
      xactimateCode: 'RFG H&R', // Example Xactimate code
      category: 'missing',
      priority: 'high',
      supporting_evidence: [`Ridge/Hip length: ${quantity} LF from roof report.`]
    };
  }
};

// Array of all supplement rules
export const supplementRules: SupplementRule[] = [
  missingStarterShinglesRule,
  missingRidgeCapRule,
  // Add more rules here, e.g.:
  // - Ice & Water Shield in valleys or based on regional codes
  // - Sufficient waste factor for shingles
  // - Drip edge if not present
  // - Pipe jack flashing based on number of pipes (if extractable)
];

/**
 * Evaluates all supplement rules against the given context.
 * @param context The data context from estimate and roof report.
 * @returns An array of SupplementRecommendations for items that should be added.
 */
export function evaluateSupplementRules(context: RuleContext): SupplementRecommendation[] {
  const recommendations: SupplementRecommendation[] = [];
  for (const rule of supplementRules) {
    if (rule.condition(context)) {
      const recommendation = rule.action(context);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }
  }
  return recommendations;
}

// Helper to generate UUIDs for recommendations - requires uuid to be installed
// If not already installed: npm install uuid && npm install --save-dev @types/uuid
// Alternatively, manage IDs in a different way if uuid is not desired here.
import { v4 as uuidv4 } from 'uuid'; 