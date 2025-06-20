# eod-agentic-flow Queue Refactor – Explicit Technical Reference

**Author:** ChatGPT (OpenAI o3)  
**Date:** 20 Jun 2025  
**Context:** Summarises all prior attempts to support *multiple concurrent PDF jobs* on Vercel + Supabase, analyses failure points, and lays out a step‑wise “serverless‑first” redesign.

---

## 1  Current Problem Statement
1. Each user upload = *one* PDF‑pair “job” that runs ~60 s (AI extraction, analysis, summary PDF).  
2. While a job runs, the UI is effectively locked → user can’t add more jobs, **other users can’t process anything**.  
3. Goal:  
   - Unlimited jobs queued per user.  
   - Concurrent usage by many users.  
   - Keep stack **minimal**: Vercel Functions + Supabase (storage + Postgres).  

---

## 2  What We Tried & Why It Hurt

| Attempt | Key Idea | Outcome | Root Cause |
|---------|----------|---------|------------|
| **A. Baseline synchronous** (main branch) | Do all work in `/api/process` before returning. | Works locally, but 60 s jobs bump against Vercel’s 10 s/60 s hard timeout. | Long‑running blocking call in serverless function. |
| **B. queue‑mode branch** | Maintain an in‑memory queue + global `isProcessing` flag to serialize jobs. | 💥 Works on dev, **fails on Vercel**: jobs hang, queue resets on every cold start, second user starves. | Serverless statelessness: each invocation gets fresh memory; no shared globals. |
|     | Added “fire‑and‑forget” fetch to kick job after response. | Reduced UI block, but random 504s when job > 60 s; duplicate jobs when two lambdas raced. | Hard execution cap & no cross‑instance locking. |
|     | “Cleanup” endpoint to mark stuck jobs → rolled back. | Bandaid; chased ghosts; too many edge‑cases. | Symptoms, not cause. |

**Lessons captured:**  
*State must live in the database, not RAM. Functions must finish in < 60 s. Concurrency control has to be done at DB or queue level, not via JS singletons.*

---

## 3  Platform Constraints Cheat‑Sheet

| Constraint | Value | Design implication |
|------------|-------|--------------------|
| Vercel Serverless Time‑limit | 10 s (Hobby) / 60 s (Pro) | Split work or move heavy tasks elsewhere. |
| No sticky sessions | Each request may spawn a *new* lambda | No globals for queue / locks. |
| Parallel invocations | 1 per request (scales automatically) | Need DB row‑locking to avoid double‑work. |
| Supabase | Postgres + Realtime + Storage | Use it for durable job table + advisory/row locks. |

---

## 4  Recommended Path (Layered, stop when happy)

### 4.1  Layer 0 – Data Schema
```sql
-- jobs table
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid references auth.users,
  status text CHECK (status IN ('pending','processing','done','error')),
  progress int default 0,          -- 0‑100 %
  input_urls text[],               -- Supabase Storage paths
  output_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE INDEX ON jobs (status);
```

### 4.2  Layer 1 – *Decouple & Kick‑Off* (No new services)
1. **/api/submitUpload**  
   a. Upload PDFs to Storage.  
   b. `INSERT INTO jobs … status='pending'`.  
   c. `fetch('/api/processJob?id=...', {method:'POST', keepalive:true, headers:{Authorization:INTERNAL}})` *without* `await`.  
   d. Respond `200 { jobId }` to UI in < 2 s.

2. **/api/processJob** (runs as a fresh lambda)  
   a. `BEGIN; SELECT * FROM jobs WHERE id=$1 FOR UPDATE SKIP LOCKED;`  
   b. `UPDATE … status='processing', progress=0; COMMIT;`  
   c. Run AI pipeline (≤ 60 s). Periodically `UPDATE progress`.  
   d. On success: `UPDATE status='done', output_url=...`.  
   e. On error/timeout: `UPDATE status='error', error_msg=…`.

3. **Concurrency control**  
   - `FOR UPDATE SKIP LOCKED` ensures only **one** lambda can grab a given job.  
   - Multiple pending jobs? Each new lambda grabs the next unlocked row → natural parallelism until concurrency = arrival rate.

4. **Frontend**  
   - Supabase Realtime `SUBSCRIBE jobs WHERE user_id = currentUser` → live dashboard.  
   - New upload just appends to list; no UI freeze.

*Why this meets the brief:*  
- Zero extra infra.  
- Works if jobs ≤ 60 s (your current average 1 min).  
- Handles any number of simultaneous users ‑ each job becomes an independent record.

### 4.3  Layer 2 – Supabase NOTIFY Trigger (Optional neatness)
Instead of `fetch()` fire‑and‑forget, create a Postgres trigger:

```sql
CREATE FUNCTION notify_new_job() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('new_job', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_insert AFTER INSERT ON jobs
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_new_job();
```

A **Supabase Edge Function** subscribed to `new_job` calls `/api/processJob`.  
Same lock logic. Benefit: upload endpoint stays pure DB; no background HTTP call.

### 4.4  Layer 3 – Chunked Pipeline (> 60 s tolerance)
Divide work:

1. `pending_extract` → extract text (≤ 30 s) → `pending_analyse`  
2. `pending_analyse` → GPT analysis (≤ 40 s) → `pending_render`  
3. `pending_render` → produce summary PDF (≤ 25 s) → `done`

Each step is its own lambda; chain via status transitions + same row‑lock trick.  
Gives you 3 × 60 s = 3 min total budget without new services.

### 4.5  Layer 4 – Add Upstash QStash (single lightweight external)
If jobs still exceed 60 s or you need guaranteed FIFO order, publish to QStash:

```js
await fetch('https://qstash.upstash.io/v2/publish/https://yourapp.com/api/processJob', {
  method:'POST',
  headers:{Authorization:`Bearer ${QSTASH_TOKEN}`},
  body: JSON.stringify({jobId})
});
```

QStash retries, dead‑letters, and can restrict to **one invocation at a time**, solving both ordering *and* >60 s tasks (it re‑invokes if you split into chunks).

---

## 5  Alternative Architectures (for the “other LLM” to critique)

| Option | Infra Added | Pros | Cons |
|--------|-------------|------|------|
| Vercel Cron job polls `jobs WHERE status='pending'` every minute | None | Simple polling; no outside queue. | Latency ≤ 1 min; still 60 s cap; possible thundering‑herd. |
| Long‑running worker on DigitalOcean Droplet + Redis queue | 1 Droplet, Redis | Unlimited job length; single queue; no serverless limits. | Ops burden; cost; not 100 % “serverless”. |
| Edge Function holds open HTTP stream & “keep‑alive” hacks | None | Might bypass 60 s via streaming. | Edge runtime Node‑compat limits; still a 30 s/300 s cap; complex. |
| Inngest / Trigger.dev | SaaS | Visual workflows, retries, cron. | New 3rd‑party, pricing. |

---

## 6  Why the Layered Plan Is Correct

* **Min‑infra first:** You solve today’s pain (UI unblocked, multi‑user) with **zero** new vendors.  
* **Durable state:** All queue data lives in Postgres, an ACID store you already pay for.  
* **Deterministic locking:** Postgres row locks are rock‑solid; they avoid the race conditions that killed `queue‑mode`.  
* **Incremental escape‑velocity:** Each layer is an additive tweak—no rewrite if you outgrow limits.  
* **Observability:** Status + progress live in one table → trivial to query, chart, alert.  
* **Cost‑predictable:** Until you exceed the 60 s boundary, you stay within Vercel Pro limits.  
* **Path to infinity:** When/if you hit bigger jobs, QStash or a single Droplet worker snaps in under one day of work.

---

## 7  Implementation Roadmap

| Day | Task |
|-----|------|
| **D0** | Checkout new branch `async-jobs`. Add `jobs` table + Supabase policy. |
| **D1** | Build `/api/submitUpload` + `/api/processJob` using Layer 1 pattern. |
| **D2** | Frontend dashboard: subscribe, list, progress bar. |
| **D3** | Load‑test 10 concurrent users × 3 jobs each. Verify no collisions. |
| **D4** | (If needed) Add NOTIFY trigger + Edge Function. |
| **D5** | Draft chunked pipeline (feature flag). |
| **D6** | Decide if QStash required; otherwise merge to `main` and sunset `queue‑mode`. |

---

## 8  Knowledge Prism – How to Avoid Repeating Past Mistakes

1. **Never rely on in‑RAM state** in a serverless function; *always* persist to DB.  
2. **Lock with the DB**; don’t roll your own mutex in JS.  
3. **Keep each invocation below platform limits** or chunk it.  
4. **Add outside tools only when limits demand**, and pick the smallest that gives a clear win.

---

## 9  Appendix A – Postgres Row‑Lock Snippet

```ts
// inside /api/processJob
await sql.begin(async (trx) => {
  const job = await trx`
    SELECT * FROM jobs
    WHERE id = ${jobId} AND status = 'pending'
    FOR UPDATE SKIP LOCKED;
  `;
  if (!job.length) return new Response('Already taken', {status:202});

  await trx`
    UPDATE jobs SET status='processing', updated_at = now()
    WHERE id = ${jobId};
  `;
});
// now run the heavy work
```

---

*End of document.*
