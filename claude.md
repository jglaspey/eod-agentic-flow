# Claude.md - Roofing Supplement Generation System

## Project Overview
This is a Next.js application that processes roofing estimates and inspection reports to generate supplement recommendations using AI and business rules.

## Key System Components

### Multi-Pass Supplement Generation ✅ WORKING
The system uses a 5-pass approach:
1. **AI Suggestions** - Initial AI call for bulk supplement ideas
2. **Business Rules** - 4 decision trees validate/add supplements
3. **Cross-Reference** - Validate against existing estimate items
4. **Follow-up** - Additional AI calls if needed
5. **Confidence Scoring** - Final scoring (currently achieving 89.1%)

**Status**: Fully implemented and working correctly (6-7 supplements generated)

### Business Rules Engine ✅ IMPLEMENTED
Four client decision trees in `src/agents/rules/BusinessRules.ts`:
- **HipRidgeCapRule**: Purpose-built vs cut shingle validation
- **StarterRowRule**: Universal starter vs included-in-waste validation  
- **DripEdgeGutterRule**: Rake vs eave coverage validation
- **IceWaterBarrierRule**: Code-required quantity calculations

### Source Attribution System ✅ BACKEND WORKING
- `source_system` field tracks: `business_rule` vs `ai_suggestion`
- Database correctly saves attribution data
- Backend logs confirm proper source tracking

## Current Issue: Visual Source Attribution 🔍 DEBUGGING

### Problem
Frontend shows "Unknown Source" instead of colored dots for Business Rules vs AI Suggestions.

### Root Cause
- ✅ Backend working correctly (database has proper `source_system` values)
- 🔍 Frontend `getSourceIcon()` function in `ResultsDisplay.tsx` falling back to default
- 🔍 Possible React data fetching or rendering issue

### Debug Status
- ✅ Enhanced logging added to `ResultsDisplay.tsx` (lines 18-32, 89-98)
- 🔍 Next: Check browser console (F12) for debug output with 🔍 emoji markers
- 🔍 Look for data fetching issues or component rendering problems

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
- `jobs` - Job metadata and status
- `job_data` - Extracted property and roof data
- `supplement_items` - Generated supplements with source attribution
- `job_logs` - Multi-pass system logs (UUID issue fixed)

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

## Next Steps
1. 🔍 Debug visual source attribution UI (check browser console)
2. 🔧 Fix `getSourceIcon()` component if data fetching issue found
3. 🧹 Remove debug logging once visual indicators work
4. 🚀 Plan V2 features (user feedback loop)

## Documentation
- `DEVELOPMENT_NOTES.md` - Detailed session logs and achievements
- `AGENTIC_IMPLEMENTATION_PLAN.md` - Technical roadmap and implementation status
- `project-docs/` - Client research and business rules documentation