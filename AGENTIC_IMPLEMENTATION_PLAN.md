# 🤖 Agentic Workflow Implementation Plan

## ✅ COMPLETED ITEMS

### Phase 1: Core Agent Infrastructure ✅ DONE
- [x] **Agent Base Class** (`src/agents/Agent.ts`) ✅
  - [x] Abstract base with logging, error handling, and AI client management
  - [x] Standardized `act()` method signature
  - [x] Built-in OpenAI and Anthropic client initialization

- [x] **Agent Type System** (`src/agents/types.ts`) ✅
  - [x] Core interfaces: `AgentConfig`, `TaskContext`, `AgentResult`
  - [x] Input/output interfaces for each agent type
  - [x] Logging levels and error handling types

- [x] **OrchestrationAgent** (`src/agents/OrchestrationAgent.ts`) ✅
  - [x] Main workflow coordinator
  - [x] Manages task sequencing and data flow
  - [x] Error recovery and fallback handling
  - [x] Integration with LogStreamer for real-time updates

### Phase 2: Specialized Extraction Agents ✅ DONE
- [x] **EstimateExtractorAgent** (`src/agents/EstimateExtractorAgent.ts`) ✅
  - [x] PDF text extraction and parsing
  - [x] Line item extraction with structured output
  - [x] Metadata extraction (claim number, carrier, RCV, etc.)
  - [x] Confidence scoring for extracted data

- [x] **RoofReportExtractorAgent** (`src/agents/RoofReportExtractorAgent.ts`) ✅
  - [x] Roof measurement extraction
  - [x] Damage assessment parsing
  - [x] Structured roof data output
  - [x] Integration with estimate data for comparison

### Phase 3: Analysis and Generation ✅ DONE
- [x] **SupplementGeneratorAgent** (`src/agents/SupplementGeneratorAgent.ts`) ✅
  - [x] Discrepancy analysis between estimate and roof report
  - [x] Xactimate code integration from `codes.md`
  - [x] Structured supplement recommendations
  - [x] Integration with AIOrchestrator for improved accuracy

- [x] **AIOrchestrator Integration** (`src/lib/ai-orchestrator.ts`) ✅
  - [x] Centralized AI interaction layer
  - [x] Prompt management via database
  - [x] Code lookup and validation
  - [x] Detailed logging of AI interactions

### Phase 4: Real-time Monitoring ✅ DONE
- [x] **LogStreamer** (`src/lib/log-streamer.ts`) ✅
  - [x] In-memory log collection per job
  - [x] Real-time event streaming
  - [x] Structured log levels and categorization

- [x] **SSE Endpoint** (`src/app/api/jobs/[id]/logs/route.ts`) ✅
  - [x] Server-Sent Events for live job updates
  - [x] Automatic cleanup and connection management
  - [x] Job status monitoring and stream termination

## 🚧 IN PROGRESS / NEXT STEPS

### Phase 5: Enhanced Accuracy & Validation
- [x] **Serverless Environment Fixes** ✅ (June 10, 2025)
  - [x] Fixed EstimateExtractorAgent vision processing checks
  - [x] Improved text extraction quality handling for image-based PDFs
  - [x] Added graceful fallback when extraction methods fail
  - [x] Enhanced error handling to prevent job failures
  
- [x] **Mistral OCR Integration** ✅ (June 10, 2025)
  - [x] Replaced Python-dependent vision processing with Mistral OCR API
  - [x] Added direct PDF processing capability via Mistral Pixtral model
  - [x] Implemented extractFieldsFromMistralOCR method for serverless compatibility
  - [x] Enhanced logging to track Mistral OCR vs other extraction methods
  - [x] **Enhanced Confidence Scoring** - Dynamic calculation based on extraction quality
  - [x] **Line Item Extraction** - Added support for extracting estimate line items
  - [x] **Improved Error Handling** - Timeout, rate limits, and network errors
  - [x] **JSON Parsing Fallback** - Regex extraction when JSON parsing fails

- [x] **File Upload Optimization** ✅ (June 10, 2025)
  - [x] Increased file size limits to 4MB per file, 4.2MB total
  - [x] Added comprehensive file size validation on client and server
  - [x] Improved error messages for file size and format issues
  - [x] Optimized for Vercel's 4.5MB serverless request limits

- [ ] **Supplement Validation System**
  - [ ] Cross-reference generated supplements with actual estimate line items
  - [ ] Implement confidence scoring for supplement recommendations
  - [ ] Add validation rules to prevent false positives

- [ ] **Improved Discrepancy Detection**
  - [ ] Better parsing of estimate line items to avoid "missing item" hallucinations
  - [ ] Enhanced comparison logic between estimate and roof report data
  - [ ] Contextual understanding of when items are actually present

### Phase 6: User Experience Improvements
- [ ] **Frontend Dashboard Enhancements**
  - [ ] Real-time progress indicators with LogStreamer integration
  - [ ] Interactive supplement review and editing
  - [ ] Confidence indicators for each recommendation

- [ ] **Export and Integration**
  - [ ] Xactimate-compatible export format
  - [ ] PDF report generation
  - [ ] Integration with estimating software APIs

### Phase 7: Advanced Features
- [ ] **Learning and Feedback System**
  - [ ] User feedback collection on supplement accuracy
  - [ ] Machine learning model training from feedback
  - [ ] Continuous improvement of extraction and analysis

- [ ] **Batch Processing**
  - [ ] Multiple file upload and processing
  - [ ] Queue management for large batches
  - [ ] Progress tracking across multiple jobs

## 🎯 CURRENT FOCUS AREAS

### 1. Supplement Accuracy Issue 🔥 HIGH PRIORITY
**Problem**: Generated supplements claim items are "missing" when they actually exist in the estimate.

**Root Cause Analysis Needed**:
- [ ] Review how `EstimateExtractorAgent` parses line items
- [ ] Examine `SupplementGeneratorAgent` comparison logic
- [ ] Validate `AIOrchestrator.analyzeDiscrepanciesAndSuggestSupplements()` method
- [ ] Check prompt engineering in `ai_config` table

**Action Items**:
- [ ] Add detailed logging to trace supplement generation process
- [ ] Implement validation checks against actual estimate data
- [ ] Review and improve AI prompts for better accuracy
- [ ] Add unit tests for supplement generation logic

### 2. Tracing and Observability 🔍 MEDIUM PRIORITY
**Current State**: LogStreamer implemented but need better visibility into AI decision-making.

**Needed Improvements**:
- [ ] Add AI prompt/response logging to all agent interactions
- [ ] Implement step-by-step tracing through the entire workflow
- [ ] Create debugging dashboard for development
- [ ] Add performance metrics and timing data

### 3. Code Integration 📋 MEDIUM PRIORITY
**Current State**: Xactimate codes from `codes.md` are hardcoded in AIOrchestrator.

**Improvements Needed**:
- [ ] Move codes to database table for easier management
- [ ] Implement code validation and lookup optimization
- [ ] Add support for code categories and hierarchies
- [ ] Create admin interface for code management

## 🔧 TECHNICAL DEBT

### Code Quality
- [ ] Add comprehensive unit tests for all agents
- [ ] Implement integration tests for full workflow
- [ ] Add TypeScript strict mode compliance
- [ ] Improve error handling and recovery

### Performance
- [ ] Optimize PDF processing for large files
- [ ] Implement caching for repeated AI calls
- [ ] Add request queuing and rate limiting
- [ ] Monitor and optimize memory usage

### Security
- [ ] Implement file upload validation and sanitization
- [ ] Add rate limiting for API endpoints
- [ ] Secure AI API key management
- [ ] Add audit logging for sensitive operations

## 📊 SUCCESS METRICS

### Accuracy Metrics
- [ ] Supplement recommendation accuracy rate (target: >90%)
- [ ] False positive rate for "missing" items (target: <5%)
- [ ] User satisfaction with generated supplements

### Performance Metrics
- [ ] Average processing time per job (target: <30 seconds)
- [ ] System uptime and reliability (target: >99%)
- [ ] AI API cost per job (target: <$0.50)

### User Experience Metrics
- [ ] Time from upload to actionable results
- [ ] User retention and repeat usage
- [ ] Support ticket volume and resolution time

---

## 📝 NOTES

### Recent Session Accomplishments (June 10, 2025)
1. ✅ Implemented comprehensive logging system with LogStreamer
2. ✅ Created SSE endpoint for real-time job monitoring
3. ✅ Integrated AIOrchestrator with agent workflow
4. ✅ Updated SupplementGeneratorAgent to use improved analysis
5. ✅ Added Xactimate code integration and lookup
6. ✅ Enhanced error handling and type safety across agents
7. ✅ **Serverless Deployment Fixes**
   - Fixed vision processing availability checks in EstimateExtractorAgent
   - Improved text extraction quality thresholds for low-quality PDFs
   - Added graceful fallback handling when both text and vision extraction fail
   - Enhanced error handling to prevent complete job failures
8. ✅ **Mistral OCR Confidence Improvements**
   - Implemented dynamic confidence scoring based on extraction quality
   - Added line item extraction for complete estimate analysis
   - Enhanced error handling with timeouts and specific error messages
   - Added JSON parsing fallback with regex extraction
   - Field-specific confidence calculation with validation

### Next Session Priorities
1. 🔥 Debug supplement accuracy issues (false "missing" items)
2. 🔍 Implement comprehensive tracing for AI decision-making
3. 📋 Test end-to-end workflow with real data
4. 🧪 Add validation and testing framework

### Cross-Reference
See [DEVELOPMENT_NOTES.md](./DEVELOPMENT_NOTES.md) for detailed session logs and milestone documentation.

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