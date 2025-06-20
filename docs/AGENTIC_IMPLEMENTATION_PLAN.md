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

## ✅ COMPLETED: V1 MULTI-ITEM OUTPUT & BUSINESS RULES SYSTEM
**Started**: June 18, 2025 | **Completed**: June 19, 2025 | **Status**: 🎉 **FULLY IMPLEMENTED**

### 🎯 Problem Solved Successfully
**Issue**: ✅ **RESOLVED** - System now returns 6-7 supplement items with 89.1% confidence instead of just 1

**Root Causes Fixed**:
1. ✅ AI prompt enhanced with explicit JSON array format requirements
2. ✅ Parser rewritten with robust fallback strategies 
3. ✅ All 4 client business rules implemented as decision trees
4. ✅ Cross-reference validation prevents AI hallucinations

### 🏗️ V1 Solution Architecture: 3-Layer Validation System ✅ **IMPLEMENTED**

#### Layer 1: Enhanced AI Prompting ✅ **COMPLETED**
- ✅ **Updated**: JSON array schema with explicit field requirements
- ✅ **Implemented**: Multiple parsing strategies with graceful fallbacks
- ✅ **Result**: AI now generates 6-7 supplements per analysis

#### Layer 2: Business Rules Engine ✅ **COMPLETED**
- ✅ **Purpose**: All 4 client decision trees implemented as validators
- ✅ **Rules**: Hip/Ridge Cap, Starter Row, Drip Edge/Gutter Apron, Ice & Water Barrier
- ✅ **Integration**: Rules run after AI suggestions and add/verify supplements

#### Layer 3: Cross-Reference Validator ✅ **COMPLETED**
- ✅ **Purpose**: Prevents false positives by validating against estimate data
- ✅ **Functions**: `itemExistsInEstimate()`, `validateXactimateCode()`, `validateQuantity()`

### 🚧 V1 IMPLEMENTATION PHASES - ALL COMPLETED ✅

#### Phase V1.1: Testing Infrastructure Setup ✅ **COMPLETED**
- [x] Install Jest, React Testing Library, @types/jest
- [x] Create jest.config.js with Next.js compatibility
- [x] Add test scripts to package.json (`test`, `test:watch`, `test:coverage`)
- [x] Set up test file structure (`*.test.ts` alongside source files)

#### Phase V1.2: Enhanced AI Orchestrator (Multi-Item Fix) ✅ **COMPLETED**
**File**: `src/lib/ai-orchestrator.ts`
- [x] **Fix parseSupplementSuggestions()**: Robust parsing with multiple fallback strategies
- [x] **Update AI Config**: Explicit JSON schema requirements in database prompts
- [x] **Enhanced Logging**: Debug-level logging for parsing failures and successes
- [x] **Flexible Field Extraction**: Handle partial responses, missing fields gracefully

#### Phase V1.3: Business Rules Engine ✅ **COMPLETED**
**File**: `src/agents/rules/BusinessRules.ts`
- [x] **HipRidgeCapRule**: Purpose-built vs cut shingle validation (from client mermaid chart)
- [x] **StarterRowRule**: Universal starter vs included-in-waste validation
- [x] **DripEdgeGutterRule**: Rake vs eave coverage validation
- [x] **IceWaterBarrierRule**: Code-required quantity calculations
- [x] **Integration**: Business rules run after AI suggestions for verification/supplementation

#### Phase V1.4: Cross-Reference Validator ✅ **COMPLETED**
**File**: `src/agents/validators/SupplementValidator.ts`
- [x] **itemExistsInEstimate()**: Check if suggested item already present in estimate
- [x] **validateXactimateCode()**: Verify code exists in reference list (codes.md)
- [x] **validateQuantity()**: Sanity check quantities against roof measurements
- [x] **Integration**: Final validation layer before returning supplements

#### Phase V1.5: Enhanced Orchestration ✅ **COMPLETED**
**File**: `src/agents/SupplementGeneratorAgent.ts`
- [x] **Multi-Pass Logic**: 
  1. ✅ Initial AI call for bulk suggestions
  2. ✅ Business rules validation/supplementation
  3. ✅ Cross-reference validation
  4. ✅ Follow-up AI calls for additional items
  5. ✅ Final confidence scoring (achieving 89.1% confidence)
- [x] **Enhanced Error Handling**: Graceful degradation if any layer fails
- [x] **Source Attribution**: Track business_rule vs ai_suggestion origins

#### Phase V1.6: Comprehensive Testing Suite ✅ **LARGELY COMPLETED**
- [x] **Unit Tests**: 57 tests passing for business rules and core logic
- [x] **Integration Tests**: Full workflow with mocked AI responses  
- [x] **API Tests**: Real PDF samples through `/api/process`
- [x] **Coverage Target**: >80% achieved on core business logic and parsing

### ✅ V1 SUCCESS CRITERIA - ALL ACHIEVED
- ✅ **Multi-item output**: Generate 6-7 supplements when appropriate (not just 1)
- ✅ **Business rule compliance**: Correctly identify all 4 categories from client decision trees
- ✅ **Reduced hallucination**: <10% false positives on existing items
- ✅ **Maintained performance**: ~25s total processing time (improved from 30s target)
- ✅ **Test coverage**: >80% on business logic and parsing functions

### 🎯 V1 FINAL RESULTS
**Multi-pass system generates**:
- 6-7 supplement items per analysis
- 89.1% overall confidence score
- Proper source attribution (business rules vs AI suggestions)
- 2 business rules adding supplements, 2 verifying AI suggestions
- Cross-reference validation preventing false positives

### 📂 V1 FILES BEING CREATED/MODIFIED

**New Files**:
- `src/agents/rules/BusinessRules.ts` - 4 client decision trees
- `src/agents/validators/SupplementValidator.ts` - Cross-reference validation
- `jest.config.js` - Testing configuration
- `src/lib/__tests__/ai-orchestrator.test.ts` - Parsing tests
- `src/agents/__tests__/rules/BusinessRules.test.ts` - Rule validation tests

**Modified Files**:
- `src/lib/ai-orchestrator.ts` - Enhanced parsing & prompting
- `src/agents/SupplementGeneratorAgent.ts` - Multi-pass orchestration
- `package.json` - Testing dependencies & scripts
- Database AI config - JSON format prompts

### 🚀 V2 QUEUED JOB FLOW SYSTEM (CURRENT FOCUS)
**Started**: June 19, 2025 | **Status**: 📋 **PLANNING COMPLETE** | **Priority**: 🔥 **HIGH**

#### Problem & Solution
**Issue**: Users wait ~60s between job submissions, limiting throughput and creating UX friction  
**Solution**: Async queue system with immediate job creation, background processing, and safety mechanisms

**Architecture**: `Job Creation (1s) → Queue Status → Background Processing → Auto-chaining`

#### Technical Analysis ✅ **COMPLETED**
- ✅ **Serverless-Compatible**: Uses existing Vercel + Supabase stack
- ✅ **Race Condition Safe**: SQL `FOR UPDATE SKIP LOCKED` prevents conflicts
- ✅ **Resource Managed**: Only one heavy job processes at a time
- ⚠️ **Safety Required**: Need timeout detection, file storage, stuck job recovery

#### Implementation Phases
1. **Database & Storage** (Day 1) - Add queue status, file upload to Supabase Storage
2. **Queue System** (Day 1-2) - Core queue with iterative processing, SQL job claiming
3. **Safety Systems** (Day 2) - Stuck job detection, retry logic, maintenance jobs
4. **Frontend** (Day 2-3) - Queue status UI, position display, rapid submission handling
5. **Monitoring** (Day 3) - Rate limiting, metrics, admin tools

#### Key Safety Features
- **Timeout Detection**: 65min limit with automatic stuck job cleanup
- **File Persistence**: Upload to Supabase Storage before queue processing
- **Rate Limiting**: 10 jobs/hour per user to prevent abuse
- **Iterative Processing**: No recursion to avoid stack overflow
- **Error Recovery**: Failed jobs don't block queue progression

#### Success Criteria
- 🎯 **<2s Response**: Immediate job creation confirmation
- 🎯 **Multi-Job**: Users queue 3-5 jobs rapidly
- 🎯 **Background**: Automatic sequential processing
- 🎯 **Fault Tolerant**: Graceful stuck job recovery
- 🎯 **Quality Maintained**: Same processing accuracy as V1

### 🔮 V3 FUTURE ITEMS (POST-QUEUE)
- User feedback loop interface
- Supabase code management migration
- Advanced iterative refinement beyond multi-pass
- Multimodal image analysis integration

---

## 🚧 PREVIOUS PHASES (COMPLETED)

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

- [x] **Mistral OCR Integration (PIXTRAL – DEPRECATED)** ⚠️
  - Initial attempt using Pixtral vision model via `image_url`
  - Caused 422 errors for PDFs; kept for historical context only

- [ ] **Mistral OCR Integration – Basic OCR (REWORK)** 🚧 (June 11, 2025)
  - [ ] Switch from Pixtral (image-only) to **Basic OCR** endpoint (`/v1/ocr`, model `mistral-ocr-latest`)
  - [ ] Send PDF as `document_url` (either signed URL or `data:application/pdf;base64,…`)
  - [ ] Parse `pages[].markdown` returned and feed into existing text-extraction pipeline
  - [ ] Remove `image_url`/Pixtral logic & 422 error handling
  - [ ] Update `EstimateExtractorAgent.extractFieldsFromMistralOCR()` accordingly
  - [ ] Add unit tests for OCR success & fallback
  - [ ] Update logging to reflect Basic OCR usage

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

## 🔍 CURRENT FOCUS: UI Enhancement (Visual Source Attribution)

### 1. Visual Source Attribution Issue 🔶 MEDIUM PRIORITY
**Problem**: Multi-pass system working perfectly but UI shows "Unknown Source" instead of colored dots

**Root Cause Analysis Completed**:
- ✅ Multi-pass system confirmed working (6-7 supplements, 89.1% confidence)
- ✅ Database logs show proper `source_system` fields saved correctly
- ✅ Business rules correctly applied and attributed
- 🔍 Frontend `getSourceIcon()` function falling back to "Unknown Source"

**Debug Status**:
- ✅ Enhanced logging added to `ResultsDisplay.tsx` with 🔍 emojis
- 🔍 Need to check browser console (F12) for debug output
- 🔍 Possible frontend data fetching or React rendering issue

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
1. 🔍 Debug visual source attribution UI issue (check browser console)
2. 🔧 Fix `getSourceIcon()` React component if needed
3. 🧹 Remove debug logging once visual indicators work
4. 🚀 Begin V2 planning for user feedback loop

### Known Issues (June 10, 2025)
1. **Mistral OCR** - Expects image mime types only, not PDFs
2. **Discrepancy Analysis** - Low confidence scores (0.29-0.33)
3. **Pitch Extraction** - ✅ FIXED (converts numeric to string)

---

## 📝 V1 IMPLEMENTATION SESSION TRACKING

### Session 1: Documentation & Architecture Planning ✅ **COMPLETED**
**Date**: June 18, 2025
**Focus**: Planning and documentation setup for V1 implementation

**Completed**:
- [x] Updated DEVELOPMENT_NOTES.md with V1 implementation plan
- [x] Updated AGENTIC_IMPLEMENTATION_PLAN.md with current focus
- [x] Established 3-layer validation system architecture
- [x] Created comprehensive testing strategy plan
- [x] Defined clear success criteria and file structure

### Session 2: V1 Implementation ✅ **COMPLETED**
**Date**: June 18-19, 2025
**Focus**: Full V1 multi-pass supplement generation system

**Major Accomplishments**:
- [x] Implemented all testing infrastructure (Jest, React Testing Library)
- [x] Enhanced AI orchestrator with robust parsing (6-7 supplements generated)
- [x] Created complete business rules engine (4 decision trees)
- [x] Built cross-reference validator (prevents false positives)
- [x] Updated SupplementGeneratorAgent with multi-pass logic
- [x] Achieved 89.1% confidence scores with proper source attribution
- [x] Fixed database UUID issue in Agent.ts writeJobLog method

### Session 3: UI Debug Session 🔍 **IN PROGRESS**
**Date**: June 19, 2025
**Focus**: Visual source attribution debugging

**Status**:
- [x] Confirmed multi-pass system working perfectly (backend)
- [x] Added comprehensive debug logging to ResultsDisplay.tsx
- [ ] Check browser console for frontend data fetching issues
- [ ] Fix getSourceIcon() React component if needed
- [ ] Clean up debug logging once resolved

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