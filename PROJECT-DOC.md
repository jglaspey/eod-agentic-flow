# Project: Roofing Estimate Analyzer (ClaudeCode Supplement Creation)

## Current Status (as of Friday, May 24th, 2025 - EOD)

The application is designed to take a roofing insurance estimate PDF and a roof measurement report PDF, analyze them using AI, and identify discrepancies or missing items to suggest for a supplement.

**Key Functionality Implemented:**

*   **File Upload:** Users can upload two PDF files (estimate and roof report).
*   **Backend Processing API (`/api/process`):**
    *   Receives uploaded files.
    *   Creates a job record in the Supabase `jobs` table with `status: 'processing'`.
    *   Asynchronously processes the files:
        *   Extracts data from both PDFs using an `AIOrchestrator` class (leveraging OpenAI and Anthropic models).
        *   Analyzes discrepancies between the estimate and roof report.
        *   Generates potential supplement items.
        *   Saves extracted information into the `job_data` table.
        *   Saves generated supplement items into the `supplement_items` table.
        *   Updates the job status in the `jobs` table to `'completed'` or `'failed'`, including processing time and any error messages.
*   **Results Page (`/results/[jobId]`):**
    *   Polls the backend for job status and data.
    *   Displays a "Processing..." message while the backend works.
    *   Displays an error message if the job status is `'failed'`.
    *   Displays extracted property details, roof measurements, and a list of identified supplement items once the job is `'completed'` and data is available.
*   **Database Schema:**
    *   `jobs`: Tracks overall job status, creation time, processing time, and errors.
    *   `job_data`: Stores all extracted textual and numerical data from the PDFs.
    *   `supplement_items`: Stores line items suggested for the supplement.
    *   `ai_config`: Stores configurations for different AI models and prompts used in various extraction/analysis steps.
*   **Error Handling:**
    *   Backend processing includes try/catch blocks for AI calls and database operations, updating job status to `'failed'` with an error message upon failure.
    *   Client-side results page handles `'processing'`, `'completed'`, and `'failed'` states appropriately.

## Current Challenges & Areas for Improvement

1.  **Initial Page Load Experience (404/Loading State):**
    *   **Issue:** When a user uploads files and is redirected to the results page, the backend processing can take a significant amount of time (observed ~60-70 seconds). The client-side polling mechanism in `getJobData` on the results page was initially timing out and showing a 404 error because it couldn't find completed data quickly enough.
    *   **Recent Fixes (Applied):**
        *   Modified `getJobData` to use `.maybeSingle()` for `job_data` to prevent errors if the row isn't there yet.
        *   If the job status is still `'processing'` after all retries, `getJobData` now returns the current job state (with `status: 'processing'`) instead of `null`. This allows the `ResultsDisplay` component to show a "Processing..." UI.
        *   Updated the `Job` type definition to include `error_message`.
        *   `ResultsDisplay` component now explicitly handles `'processing'`, `'failed'`, and data inconsistency states.
    *   **Current Behavior:** The 404 error during initial load *should* now be replaced by a "Processing..." state. This was the state as of our last interaction before this document creation.
    *   **To Verify on Monday:** Confirm that the initial load consistently shows the "Processing..." state for new jobs and then transitions to the results or an error state correctly without manual refresh.

2.  **Accuracy of AI Extractions and Supplement Generation:**
    *   **Issue:** Earlier, there were issues with the AI not correctly extracting multi-line claim numbers and potentially other inaccuracies. The prompt engineering and choice of models are critical here.
    *   **Recent Fixes (Applied):**
        *   Updated AI models to `gpt-4o` and `claude-3-opus-20240229` (though we discussed `claude-4-sonnet` - this might need re-verification in `database-schema.sql` and AI config).
        *   Updated prompts in `database-schema.sql` (via `setup-database.sql`) to be more robust, especially for claim number extraction.
        *   Updated the Anthropic SDK version.
    *   **To Address Next:** Rigorous testing is needed to evaluate the accuracy of:
        *   Property Address extraction.
        *   Claim Number extraction (especially multi-line).
        *   Insurance Carrier identification.
        *   RCV, ACV, Deductible amounts.
        *   Extraction of all roof measurements from the roof report.
        *   The logic for identifying missing items (e.g., drip edge, gutter apron) based on measurements.
        *   The quality and relevance of reasons provided for supplement items.
        *   Confidence scores.

3.  **User Experience for Long Processing Times:**
    *   While the "Processing..." state is better than a 404, ~70 seconds is a long wait.
    *   **Potential Enhancements:**
        *   More granular progress updates (e.g., "Extracting estimate data...", "Analyzing roof report..."). This is complex as it requires the backend to report sub-statuses.
        *   Consider if any AI calls can be parallelized further or if less computationally intensive models can be used for certain simpler extraction tasks without sacrificing too much accuracy.
        *   WebSockets for real-time updates instead of polling, though polling is simpler for now.

4.  **Completeness of Extracted Data:**
    *   Ensure all necessary fields from both typical insurance estimates and common roof reports (like EagleView, Hover) are being targeted for extraction.
    *   The current `JobData` and `SupplementItem` interfaces should be reviewed against comprehensive examples.

5.  **Supplement Item Logic:**
    *   The rules for when to suggest an item (e.g., "Missing gutter apron based on eave measurements") need to be robust and cover common scenarios. This is currently handled in `AIOrchestrator.generateSupplementItems`.

## Next Steps (Suggestions for Monday)

1.  **Verify Loading Behavior:** Thoroughly test the results page loading for new jobs. Ensure the "Processing..." state displays correctly and transitions to results or an error without requiring a manual refresh.
2.  **Test Data Accuracy:**
    *   Prepare a diverse set of test estimate PDFs and roof report PDFs (different carriers, formats, complexities).
    *   Run them through the system and meticulously compare the AI's extracted `job_data` and generated `supplement_items` against the actual document contents.
    *   Identify specific fields or supplement rules that are inaccurate.
3.  **Refine Prompts & Models:** Based on accuracy testing, iteratively refine the prompts in `database-schema.sql` (and re-run `setup-database.sql` or update `ai_config` table directly) and potentially experiment with different AI models for specific tasks in `AIOrchestrator`.
4.  **Code Commit:** Once the loading behavior is stable and we have a baseline for accuracy, commit the recent changes.

## Planned Feature: Real-Time Log Streaming (Ready for Implementation)

**Goal:** Provide users with real-time visibility into the AI processing pipeline, showing exactly what the AI is "thinking" and doing during the 60-70 second processing time.

**User Experience:**
- Instead of just "Processing...", show a terminal-style log stream
- Display AI prompts, responses, and decision-making in real-time
- Show steps like "Extracting estimate data...", "Analyzing roof measurements...", etc.
- When processing completes, smoothly collapse logs and show results dashboard

**Technical Implementation Plan:**

### 1. LogStreamer Utility Class (`src/lib/log-streamer.ts`)
```typescript
interface LogEvent {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'error' | 'debug';
  step: string;
  message: string;
  data?: any;
}

class LogStreamer {
  private logs: Map<string, LogEvent[]> = new Map();
  
  addLog(jobId: string, event: Omit<LogEvent, 'id' | 'timestamp'>): void
  getLogs(jobId: string): LogEvent[]
  clearLogs(jobId: string): void
  
  // Structured logging methods
  logStep(jobId: string, step: string, message: string): void
  logAIPrompt(jobId: string, step: string, prompt: string): void
  logAIResponse(jobId: string, step: string, response: string, confidence?: number): void
  logError(jobId: string, step: string, error: string): void
  logSuccess(jobId: string, step: string, message: string): void
}
```

### 2. Server-Sent Events Endpoint (`src/app/api/jobs/[id]/logs/route.ts`)
```typescript
// GET /api/jobs/[id]/logs
// Returns SSE stream of log events for a specific job
// Polls LogStreamer every 500ms for new events
// Automatically closes when job status changes to 'completed' or 'failed'
```

### 3. Enhanced AIOrchestrator Integration
Update `AIOrchestrator` class to use LogStreamer:
```typescript
// Example integration points:
async extractEstimateData(jobId: string, pdfContent: string) {
  logStreamer.logStep(jobId, 'estimate-extraction', 'Analyzing estimate PDF with OpenAI...');
  logStreamer.logAIPrompt(jobId, 'estimate-extraction', prompt);
  
  const response = await openai.chat.completions.create({...});
  
  logStreamer.logAIResponse(jobId, 'estimate-extraction', 
    `Extracted: ${response.propertyAddress}, Claim: ${response.claimNumber}`, 
    response.confidence
  );
}
```

### 4. Real-Time Terminal UI Component (`src/components/LogTerminal.tsx`)
```tsx
interface LogTerminalProps {
  jobId: string;
  onComplete: () => void;
}

// Features:
// - Connects to SSE endpoint
// - Terminal-style scrolling log display with syntax highlighting
// - Auto-scroll to bottom with new messages
// - Collapsible/expandable sections by processing step
// - Clean transition to results when processing completes
// - Copy logs to clipboard functionality
```

### 5. Enhanced Results Page Integration
Modify `/results/[id]/page.tsx`:
```tsx
const [showLogs, setShowLogs] = useState(true);
const [isProcessing, setIsProcessing] = useState(job?.status === 'processing');

return (
  <div>
    {isProcessing ? (
      <LogTerminal 
        jobId={params.id} 
        onComplete={() => {
          setIsProcessing(false);
          setShowLogs(false);
          // Trigger data refresh
        }} 
      />
    ) : (
      <>
        <Button onClick={() => setShowLogs(!showLogs)}>
          {showLogs ? 'Hide' : 'Show'} Processing Logs
        </Button>
        {showLogs && <LogTerminal jobId={params.id} readonly />}
        <ResultsDisplay data={data} />
      </>
    )}
  </div>
);
```

### 6. Log Event Types & Structure
```typescript
// Standardized log events for consistent UI:
type LogEvents = 
  | 'job-started'
  | 'estimate-extraction-start'
  | 'estimate-ai-prompt'
  | 'estimate-ai-response'
  | 'roof-report-extraction-start'
  | 'roof-report-ai-prompt'
  | 'roof-report-ai-response'
  | 'discrepancy-analysis-start'
  | 'supplement-generation-start'
  | 'database-save-start'
  | 'job-completed'
  | 'error-occurred';
```

**Benefits:**
- Dramatically improves user experience during long processing times
- Provides transparency into AI decision-making process
- Helps with debugging and accuracy assessment
- Creates engaging, professional feel
- Maintains logs for post-processing analysis

**Estimated Implementation Time:** 4-6 hours
**Priority:** High (significantly improves UX for 70-second processing times)

## Open Questions/Considerations

*   Confirm the exact Anthropic model intended for use (Sonnet or Opus) and ensure it's correctly configured.
*   How will Xactimate codes be handled if not present in the AI's knowledge or input?
*   What's the strategy for handling highly non-standard PDF formats?

This document should provide a good starting point for Monday! 