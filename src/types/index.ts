export interface Job {
  id: string
  created_at: string
  status: 'processing' | 'completed' | 'failed'
  estimate_pdf_url?: string
  roof_report_pdf_url?: string
  processing_time_ms?: number
  error_message?: string
}

export interface JobData {
  id: string
  job_id: string
  property_address?: string
  claim_number?: string
  insurance_carrier?: string
  date_of_loss?: string
  total_rcv?: number
  roof_area_squares?: number
  eave_length?: number
  rake_length?: number
  ridge_hip_length?: number
  valley_length?: number
  stories?: number
  pitch?: string
}

export interface SupplementItem {
  id: string
  job_id: string
  line_item: string
  xactimate_code?: string
  quantity: number
  unit: string
  reason: string
  confidence_score: number
  calculation_details?: string
}

export interface JobReport {
  id: string
  job_id: string
  report_md: string
  created_at: string
}

export interface AIConfig {
  id: string
  step_name: string
  provider: 'openai' | 'anthropic'
  model: string
  prompt: string
  temperature: number
  max_tokens: number
}

export interface EstimateData {
  propertyAddress?: string
  claimNumber?: string
  insuranceCarrier?: string
  dateOfLoss?: string
  totalRCV?: number
  lineItems: LineItem[]
}

export interface RoofData {
  propertyAddress?: string
  totalRoofArea?: number
  totalFacets?: number
  ridgeHipLength?: number
  valleyLength?: number
  rakeLength?: number
  eaveLength?: number
  stories?: number
  pitch?: string
}

export interface LineItem {
  description: string
  code?: string
  quantity: number
  unit: string
  unitPrice?: number
  totalPrice?: number
}