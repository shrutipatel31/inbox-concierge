# Inbox Concierge

An LLM-powered email triage app. Sign in with Google, pull your last ~200 Gmail
threads, and classify them into buckets (`Important`, `Can Wait`, `Newsletter`,
`Promotions`, `Auto-archive`) with a batched, rate-limit-aware Gemini pipeline.
Add your own custom buckets and everything re-classifies.

**Stack:** Next.js 16 (App Router) · Auth.js v5 · Gmail API · Google Gemini
(Flash-Lite + Flash) · Tailwind v4 · TypeScript

---

## Features

- **Google sign-in** (Auth.js v5) with read-only Gmail scope and silent token refresh.
- **Gmail fetch** of the last ~200 threads (subject/sender/snippet), concurrency-limited.
- **Classification pipeline** — batched, concurrency-capped, exponential backoff on
  rate limits, and confidence-based escalation to a stronger model.
- **Custom buckets** — add a bucket (with an auto-generated description) and re-classify.
- **"Why here?"** — each card shows the model's reason + confidence.

---

## Architecture

```
Browser (React, client-fetched for loading states)
   │  sign in with Google
   ▼
Auth.js ── Google OAuth (gmail.readonly) ── silent refresh in the jwt callback
   │
   ▼
Next.js API routes
   ├── /api/threads   → Gmail: last ~200 threads (metadata only), cached
   ├── /api/classify  → pipeline: batch → concurrency → backoff → escalate
   └── /api/buckets   → add a custom bucket (auto-describe) → re-classify
   │
   ▼
In-memory per-session cache (Map keyed by email): { threads, buckets, classifications, stats }
```

### The classification pipeline (`src/lib/pipeline.ts`)

1. **Batch** all threads into groups of 20 (~10 calls for 200 emails, not 200).
2. **Concurrency-cap** at 3 in-flight batches to respect free-tier limits
   (`src/lib/concurrency.ts`).
3. **Backoff** — exponential + full jitter on HTTP 429/5xx, ~4 attempts; a batch
   that still fails degrades its threads to `Unclassified` instead of sinking the run
   (`src/lib/retry.ts`).
4. **Escalate** only the sub-0.6-confidence tail to a stronger model
   (`gemini-3.1-flash-lite` → `gemini-3.5-flash`), keeping the higher-confidence answer.
5. Return **stats** (calls, retries, escalations, tokens, duration) for observability.

The system prompt + few-shot are a stable prefix across every batch (cache-eligible);
`temperature: 0` and pinned model ids keep classification reproducible.

---

## Setup

### 1. Google Cloud (OAuth + Gmail API)

1. Create a project at <https://console.cloud.google.com>.
2. **Enable the Gmail API** (APIs & Services → Library → Gmail API → Enable).
3. **OAuth consent screen** (APIs & Services → OAuth consent screen): app name,
   support email, **Audience: External**, publishing status **Testing**. Add your
   Google account under **Test users**.
4. **Credentials → Create Credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy the **Client ID** and **Client secret**.

### 2. Gemini API key

Get a free key (no card) at <https://aistudio.google.com/apikey>.

### 3. Environment

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GEMINI_API_KEY=...
NEXTAUTH_SECRET=...     # generate with: npx auth secret   (or: openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
```

### 4. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, sign in with your **test-user** Google account, and the
inbox will fetch + classify.

---

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint

---

## Trade-offs & production notes

- **In-memory cache, not a DB** — chosen for build speed; resets on restart and isn't
  shared across serverless instances. Production would use Postgres/Redis.
- **Read-only Gmail scope** — deliberately minimal; a real product might need modify
  scope to archive/label.
- **Full re-classification on a new bucket** — simplest correct; production would do a
  targeted rerun (only re-check likely movers) to cut cost/latency.
- **Escalation on the free tier** — routes the ambiguous tail to a stronger model; with
  the calibrated prompt this fires rarely, keeping cost near zero.
- **Prompt caching** — relies on Gemini's implicit prefix caching (our constant block is
  under the explicit context-cache minimum); the stats surface `cachedTokens` when it fires.
- **200-thread cap** — fine for a demo; production needs pagination, incremental sync,
  and background jobs.
- **Tests** — no suite here; first targets would be pipeline batching/merge logic,
  schema/enum validation, and the retry/backoff classifier.
