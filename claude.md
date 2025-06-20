# Claude.md - Roofing Supplement Generation System

## Project Overview
This is a Next.js application that processes roofing estimates and inspection reports to generate supplement recommendations using AI and business rules.

## Key System Components

### Multi-Pass Supplement Generation ✅ PRODUCTION READY
The system uses a 5-pass approach:
1. **AI Suggestions** - Initial AI call for bulk supplement ideas
2. **Business Rules** - 4 decision trees validate/add supplements
3. **Cross-Reference** - Validate against existing estimate items
4. **Follow-up** - Additional AI calls if needed
5. **Confidence Scoring** - Final scoring (currently achieving 89.1%)

**Status**: Fully implemented and working correctly (6-7 supplements generated)

### V2 Queue System 🚧 IN DEVELOPMENT
Async job processing for improved user experience:
1. **Immediate Job Creation** - <2s response with queue status
2. **File Storage** - Upload to Supabase Storage for async processing
3. **Background Processing** - Sequential job execution without UI blocking
4. **Safety Systems** - Stuck job detection, rate limiting, error recovery
5. **Queue Management** - SQL-based job claiming with race condition protection

**Target**: Users can submit 3-5 jobs rapidly without 60s waits

### Business Rules Engine ✅ IMPLEMENTED
Four client decision trees in `src/agents/rules/BusinessRules.ts`:
- **HipRidgeCapRule**: Purpose-built vs cut shingle validation
- **StarterRowRule**: Universal starter vs included-in-waste validation  
- **DripEdgeGutterRule**: Rake vs eave coverage validation
- **IceWaterBarrierRule**: Code-required quantity calculations

### Source Attribution System ✅ PRODUCTION READY
- `source_system` field tracks: `business_rule` vs `ai_suggestion`
- Database correctly saves attribution data
- Frontend visual indicators working correctly
- Full end-to-end source tracking operational

## Current Focus: V2 Queue System Implementation 🚀 IN DEVELOPMENT

### Problem
Users must wait ~60 seconds between job submissions, limiting throughput and creating UX friction.

### Solution: Async Job Queue System
- **Immediate Response**: Job creation returns in <2s with queue status
- **Background Processing**: Jobs process sequentially without blocking UI
- **Safety Systems**: Stuck job detection, rate limiting, error recovery
- **File Storage**: Upload to Supabase Storage for async processing

### Implementation Status
- ✅ **Planning Complete**: Technical analysis and architecture design finished
- 🚧 **Ready to Start**: Database schema + file storage foundation
- 📋 **Timeline**: 3-4 days for full implementation
- 🎯 **Goal**: Users can queue 3-5 jobs rapidly without waiting

## Key Files to Know

### Core Agents
- `src/agents/Agent.ts` - Base class with logging (UUID issue fixed)
- `src/agents/SupplementGeneratorAgent.ts` - Multi-pass orchestration
- `src/agents/OrchestrationAgent.ts` - Main workflow coordinator

### Business Logic
- `src/agents/rules/BusinessRules.ts` - 4 decision trees
- `src/agents/validators/SupplementValidator.ts` - Cross-reference validation
- `src/lib/ai-orchestrator.ts` - Enhanced parsing with fallbacks

### Frontend
- `src/components/ResultsDisplay.tsx` - Main results UI (debug logging added)
- `src/app/results/[id]/page.tsx` - Results page with data fetching
- `src/types/index.ts` - TypeScript interfaces

### Database Schema
Key tables:
- `jobs` - Job metadata and status (adding queue support)
- `job_data` - Extracted property and roof data
- `supplement_items` - Generated supplements with source attribution
- `job_logs` - Multi-pass system logs (UUID issue fixed)

**V2 Queue Additions**:
- `jobs.status` - Adding `queued` enum value
- `jobs.processing_started_at` - Stuck job detection
- `jobs.queue_position` - User queue visibility
- File storage moving to Supabase Storage for async processing

## Development Guidelines

### Testing
- 57 tests passing (Jest + React Testing Library)
- >80% coverage on business logic
- Run: `npm test`

### Logging
- Use `writeJobLog()` in agents for database persistence
- Multi-pass logs saved with `step` prefix: `multi-pass-*`
- Debug browser console with 🔍 emoji markers

### Source Attribution
When working with supplements, always check:
1. `source_system` field (`business_rule` | `ai_suggestion`)
2. `business_rule_applied` array for specific rule IDs
3. `validation_status` for cross-reference results

## Common Commands
```bash
npm test              # Run test suite
npm run dev          # Start development server
npm run build        # Build for production
```

## Next Steps (V2 Queue System)
1. 🗄️ Add `queued` status and tracking fields to database schema
2. 📁 Implement file upload to Supabase Storage for async processing
3. ⚙️ Build core queue system with `enqueueJob()` and `startRunner()`
4. 🛡️ Add safety systems: stuck job detection, rate limiting, cleanup
5. 🎨 Update frontend to handle queue status and rapid submissions

## Documentation
- `DEVELOPMENT_NOTES.md` - Detailed session logs and achievements
- `AGENTIC_IMPLEMENTATION_PLAN.md` - Technical roadmap and implementation status
- `project-docs/` - Client research and business rules documentation