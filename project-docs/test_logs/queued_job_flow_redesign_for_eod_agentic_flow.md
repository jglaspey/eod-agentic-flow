# Queued Job Flow Redesign

**Project:** EOD Agentic Flow (Vercel serverless + Supabase) **Audience:** Dev team — implementer hand‑off **Goal:** Let users fire off many jobs quickly while keeping only one heavy PDF‑processing task running at a time. Subsequent jobs sit in a *queue* (status `queued`) and automatically start when the previous job finishes. Zero changes to storage locations, AI pipeline, or Supabase tables beyond adding the new status.

---

## 1. Current Job Submission Flow (baseline)

1. **User uploads two PDFs & clicks *****Analyze*****.**
2. Front‑end posts to `POST /api/process`.
3. API creates a row in `jobs` → status `processing`.
4. Same request immediately parses PDFs, runs AI agents (\~60 s), writes results & logs back to Supabase, then sets status → `completed | failed`.
5. Front‑end is blocked (button disabled) until the response returns; user can’t start another job meanwhile.
6. Dashboard polls every 3 s, flips the row from *Processing* to *Completed* when DB changes.
7. Results page retries until full data exists, causing a 1‑4 s “Loading…” delay.

### Key Issues

- **UX friction:** must wait \~60 s before submitting another job.
- **Single‑job throughput:** only one heavy task at a time per user, but enforced on the *client*, not the server.
- **Perceived slowness:** Results page pauses even after DB has the data.

---

## 2. New Queued‑Job Design (no storage or infra changes)

### High‑Level Overview

- **Immediate acknowledgment:** As soon as the user submits, we create a job with status `queued`, save the files, and return `{jobId}` in \~1 s.
- **Dedicated runner:** A small helper (`triggerRunner`) checks if a job is already `processing`. If not, it *atomically* claims the oldest `queued` job (SQL function `claim_next_job`) and runs the existing 60‑second pipeline.
- **Automatic chaining:** When a job finishes (success or fail), the runner immediately looks for the next queued job and processes it, repeating until none remain.
- **Front‑end freedom:** Upload button is re‑enabled right after each API call, so users can stack up 4–7 jobs rapidly. Dashboard shows badges: **Queued → Processing → Completed/Failed**.
- **Results page:** Accessible instantly. If status is `queued`, it displays “In queue…”. When the job flips to `processing`, live logs stream; on completion, full results load automatically.

### UX Timeline Example

| Time    | User Action / UI      | Job 1      | Job 2      | Job 3      |
| ------- | --------------------- | ---------- | ---------- | ---------- |
|  0 s    | Click Analyze         | queued     |  —         |  —         |
|  1 s    | Dashboard row appears | processing |  —         |  —         |
|  3 s    | Click Analyze again   | processing | queued     |  —         |
|  5 s    | Third upload          | processing | queued     | queued     |
| \~60 s  | Job 1 completes       | completed  | processing | queued     |
| \~120 s | Job 2 completes       | completed  | completed  | processing |
| etc.    | …                     | …          | …          | …          |

### Safety & Robustness

- **Single active job:** `claim_next_job()` uses `FOR UPDATE SKIP LOCKED` so two concurrent runners can’t grab the same job.
- **Crash resilience:** If the pipeline throws, that job → `failed`, runner still proceeds to the next queued job.
- **Spam control:** Add an optional cap (e.g. 10 queued jobs per user) in `enqueueJob()` if needed.
- **No infra leap:** Everything remains in Vercel functions + Supabase tables/logs. No cron, no queues, no workers to provision.

---

## 3. Implementation Checklist

1. **Schema update** – add `queued` to the status enum and an index on `(status, created_at)`.
2. **Add **``** helper library** with `enqueueJob` + `triggerRunner` (see code).
3. **Create SQL function **`` (Postgres plpgsql) to atomically switch one `queued` job → `processing`.
4. **Replace **`` with lightweight `/api/createJob` that:
   - inserts job row (`queued`),
   - uploads PDFs (existing helper),
   - fires `triggerRunner()` *but does not await it*,
   - returns `{jobId}`.
5. **Frontend tweaks** \* UploadInterface: disable button only while the fetch is in‑flight; on success, append new row & reset.
   - Dashboard: if status `queued`, show yellow “Queued” badge.
   - Results page: detect `queued` → show “In queue” placeholder; existing SSE stays for logs once `processing`.
6. **Deploy to staging, queue 10 jobs, verify serial execution and UI updates.**

---

## 4. Code Snippets (drop‑in)

```ts
// lib/queue.ts
import { supabase } from '@/lib/supabaseClient';
import { processFilesWithNewAgent } from '@/lib/processor';

export async function enqueueJob(files: File[]): Promise<string> {
  const jobId = crypto.randomUUID();
  await supabase.from('jobs').insert({ id: jobId, status: 'queued' });
  await saveFiles(jobId, files); // existing helper
  triggerRunner().catch(console.error);
  return jobId;
}

export async function triggerRunner() {
  // exit if something already processing
  const { data: running } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'processing')
    .limit(1)
    .maybeSingle();
  if (running) return;

  // atomically claim next queued job
  const { data: job } = await supabase.rpc('claim_next_job');
  if (!job) return; // no queued job

  try {
    await processFilesWithNewAgent(job.id);
    await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id);
  } catch (err) {
    await supabase.from('jobs')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', job.id);
  } finally {
    await triggerRunner(); // loop to next job
  }
}
```

```sql
create or replace function claim_next_job()
returns jobs as $$
declare j jobs;
begin
  update jobs
     set status = 'processing'
   where id in (
         select id from jobs
         where status = 'queued'
         order by created_at
         limit 1
         for update skip locked)
   returning * into j;
  return j;
end;
$$ language plpgsql;
```

```ts
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = [form.get('pdf1'), form.get('pdf2')] as File[];

  const jobId = await enqueueJob(files);
  return NextResponse.json({ jobId });
}
```

---

☑ **Hand‑off complete.** Your dev can drop these pieces in with minimal surface‑area changes and gain instant‑queue UX tomorrow.

