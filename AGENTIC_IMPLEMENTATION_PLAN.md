# 🤖 Agentic Workflow Implementation Plan

## 🎯 Vision: From Monolithic AI to Hierarchical Agent System

Transform the current single `AIOrchestrator` class into a multi-agent system with:
- **Specialized extraction agents** for estimates and roof reports
- **Validation and QA agents** that check work quality  
- **Orchestration layer** that coordinates tasks and retries
- **Vision fallback** using `llm-pdf-to-images` for scanned PDFs
- **Confidence scoring** throughout the pipeline

---

## 📋 Phase 1: Foundation & Core Agent Architecture

### 1.1 Base Agent Framework
**Deliverable**: `src/agents/Agent.ts` - Abstract base class

**Features**:
- Standardized agent interface (`plan()`, `act()`, `validate()`)
- Built-in confidence scoring
- Retry logic with exponential backoff
- Structured logging integration
- Tool registration system

**Files to Create**:
- `src/agents/Agent.ts` - Base agent class
- `src/agents/types.ts` - Agent interfaces and types
- `src/agents/tools/index.ts` - Tool registry

### 1.2 PDF-to-Images Tool Integration
**Deliverable**: Vision fallback capability

**Implementation**:
- Create Node.js wrapper for `llm-pdf-to-images` Python tool
- Add image processing utilities
- Vision model integration (GPT-4V, Claude-3.5-Sonnet)

**Files to Create**:
- `src/tools/pdf-to-images.ts` - Python bridge wrapper
- `src/tools/vision-models.ts` - Vision AI integration
- `package.json` - Add Python subprocess dependencies

---

## 📋 Phase 2: Specialized Extraction Agents

### 2.1 EstimateExtractorAgent
**Deliverable**: Replace estimate extraction in AIOrchestrator

**Capabilities**:
- Text extraction with confidence scoring
- Vision fallback for scanned PDFs
- Field validation (address format, claim number patterns)
- Multi-attempt extraction with different strategies

**Files to Create**:
- `src/agents/EstimateExtractorAgent.ts`
- `src/agents/validators/EstimateValidator.ts`

### 2.2 RoofReportExtractorAgent
**Deliverable**: Replace roof data extraction

**Capabilities**:
- Measurement extraction with unit normalization
- Cross-field validation (area vs linear measurements)
- Vision processing for measurement diagrams
- Confidence-based retry logic

**Files to Create**:
- `src/agents/RoofReportExtractorAgent.ts`
- `src/agents/validators/RoofDataValidator.ts`

---

## 📋 Phase 3: Analysis & Generation Agents

### 3.1 DiscrepancyAnalyzerAgent
**Deliverable**: Intelligent comparison and gap analysis

**Capabilities**:
- Cross-document validation
- Missing item detection using rule engine
- Quantity discrepancy analysis
- Confidence-weighted recommendations

**Files to Create**:
- `src/agents/DiscrepancyAnalyzerAgent.ts`
- `src/agents/rules/SupplementRules.ts`

### 3.2 SupplementGeneratorAgent
**Deliverable**: Generate supplement items with justification

**Capabilities**:
- Rule-based supplement generation
- Line item pricing integration
- Reason generation for each item
- Xactimate code mapping

**Files to Create**:
- `src/agents/SupplementGeneratorAgent.ts`
- `src/data/xactimate-codes.ts`

---

## 📋 Phase 4: Orchestration & Quality Assurance

### 4.1 OrchestrationAgent
**Deliverable**: Replace `AIOrchestrator` with smart task coordinator

**Capabilities**:
- Parallel task execution where safe
- Dynamic retry strategies
- Progress tracking and reporting
- Agent failure recovery

**Files to Create**:
- `src/agents/OrchestrationAgent.ts`
- `src/agents/TaskQueue.ts`

### 4.2 SupervisorAgent (QA Guardian)
**Deliverable**: Quality assurance and validation

**Capabilities**:
- Cross-agent result validation
- Confidence threshold enforcement  
- Data completeness checking
- Revision request generation

**Files to Create**:
- `src/agents/SupervisorAgent.ts`
- `src/agents/validators/QualityChecks.ts`

---

## 📋 Phase 5: Enhanced Data Model & UI

### 5.1 Enhanced Database Schema
**Deliverable**: Support confidence scores and multi-attempt data

**Changes**:
- Add confidence columns to `job_data`
- Create `extraction_attempts` table
- Add `validation_results` table
- Update job status to include QA states

**Files to Modify**:
- `src/lib/database-schema.sql`
- `setup-database.sql`

### 5.2 Real-Time Progress UI
**Deliverable**: Agent activity dashboard

**Features**:
- Agent status visualization
- Confidence score display
- Retry attempt tracking
- Real-time log streaming (already implemented)

**Files to Create**:
- `src/components/AgentDashboard.tsx`
- `src/components/ConfidenceIndicator.tsx`

---

## 🛠️ Implementation Order & Timeline

### Week 1: Foundation (Phase 1)
- [ ] Create base Agent class with confidence scoring
- [ ] Implement PDF-to-images tool wrapper
- [ ] Add vision model integration
- [ ] Test vision fallback with sample PDFs

### Week 2: Core Agents (Phase 2)
- [ ] Build EstimateExtractorAgent
- [ ] Build RoofReportExtractorAgent  
- [ ] Implement field validators
- [ ] Test against current accuracy benchmarks

### Week 3: Analysis Agents (Phase 3)
- [ ] Create DiscrepancyAnalyzerAgent
- [ ] Build SupplementGeneratorAgent
- [ ] Implement supplement rules engine
- [ ] Add Xactimate code mapping

### Week 4: Orchestration (Phase 4)
- [ ] Replace AIOrchestrator with OrchestrationAgent
- [ ] Implement SupervisorAgent QA loop
- [ ] Add parallel task execution
- [ ] Comprehensive testing

### Week 5: Polish (Phase 5)
- [ ] Update database schema
- [ ] Build agent dashboard UI
- [ ] Performance optimization
- [ ] Documentation and deployment

---

## 🎯 Success Metrics

### Accuracy Improvements
- **Field Extraction**: >95% accuracy (vs current ~85%)
- **Supplement Detection**: >90% recall on missing items
- **False Positives**: <5% on supplement recommendations

### User Experience
- **Processing Time**: <60 seconds (maintain current)
- **Transparency**: Real-time agent progress visibility
- **Confidence**: User trust through confidence scores

### Technical Quality
- **Modularity**: Easy to add new agent types
- **Reliability**: Graceful handling of individual agent failures
- **Maintainability**: Clear separation of concerns

---

## 🚀 Getting Started

Let's begin with **Phase 1.1** - creating the base Agent framework and tool foundation.

**Next Steps**:
1. Create the Agent base class
2. Implement PDF-to-images tool wrapper
3. Test vision integration with sample PDFs
4. Build first EstimateExtractorAgent

Ready to start coding! 🔥 