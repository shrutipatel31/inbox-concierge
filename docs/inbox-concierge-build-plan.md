# Inbox Concierge — Build Plan

An LLM-powered email triage app. Authenticates a Gmail account, pulls the last 200 threads, classifies them into buckets with an LLM pipeline, and lets the user create custom buckets that re-classify everything.

**Stack:** Next.js (App Router) · Auth.js (NextAuth) · Gmail API · Google Gemini Flash-Lite (free tier) · Tailwind

---

## 1. Goals & grading alignment

The Tenex rubric rewards "systems, not demos." This plan is built around four things their video sections ask for:

- **Product demo** — clean inbox UI with bucketed emails + custom bucket creation.
- **Tech stack** — Next.js full-stack, Gemini free tier, Auth.js. Justified below.
- **Architectural decisions** — the classification pipeline is the centerpiece: batching, caching, confidence-based escalation, rate-limit handling.
- **Technical trade-offs** — what you deliberately skipped and how you'd productionize.

The engineering signal lives in the **pipeline**, not the UI. Spend your rigor there.

---

## 2. Tech stack & why

| Choice | Why |
|---|---|
| **Next.js (App Router)** | One repo for React frontend + backend API routes. Fast to deploy (Vercel). Keeps OAuth tokens server-side. |
| **Auth.js (NextAuth)** | Handles Google OAuth + token refresh with minimal code. Gmail scope added to the Google provider. |
| **Gmail API** | `users.threads.list` + `users.messages.get` (metadata format) for subject/sender/snippet. |
| **Gemini Flash-Lite** | Free tier, no credit card, fast, native structured-output (JSON schema). Perfect for classification. Stays in the Google ecosystem you're already in for OAuth. |
| **Tailwind** | Fast, clean UI without hand-writing CSS. |
| **Storage: in-memory server cache (per session)** | For a take-home, avoid a DB. Cache fetched threads + classifications in a server-side Map keyed by session. Re-classification reruns over cached data. (Note the DB path in trade-offs.) |

**Deliberate non-choice:** no separate Express backend, no Postgres, no vector DB. This is classification, not RAG — none of that is needed, and adding it would be over-engineering you'd have to defend.

---

## 3. Architecture overview

```
Browser (React)
   │  sign in with Google
   ▼
Auth.js  ──►  Google OAuth (Gmail readonly scope)
   │
   ▼
Next.js API routes
   ├── /api/threads       → Gmail: fetch last 200 threads (subject, sender, snippet)
   ├── /api/classify      → Gemini pipeline: batch → classify → escalate low-confidence
   └── /api/buckets       → add custom bucket → re-run classify over cached threads
   │
   ▼
Server cache (per session): { threads[], buckets[], classifications[] }
```

Flow: sign in → fetch 200 threads once (cache them) → run classification pipeline → render bucketed inbox → user adds a bucket → re-classify cached threads with the new bucket set.

---

## 4. Google OAuth + Gmail setup

1. **Google Cloud Console:** create a project, enable the **Gmail API**, create OAuth 2.0 credentials (Web application). Add `http://localhost:3000/api/auth/callback/google` and your deployed callback URL as authorized redirect URIs.
2. **Scope:** `https://www.googleapis.com/auth/gmail.readonly` (read-only is all you need and looks responsible in a demo).
3. **Auth.js config:** Google provider with the Gmail scope, `access_type: "offline"` + `prompt: "consent"` to get a refresh token. Persist `access_token` in the JWT/session callback so API routes can call Gmail.
4. **Test users:** while the OAuth consent screen is unverified, add your **test Google account** as an allowed test user. Use that throwaway account with sample emails — not your personal inbox — since you'll be filming this.

**Fetching threads efficiently:**
- `users.threads.list` with `maxResults: 100`, paginate once for ~200.
- For each thread, `users.messages.get` with `format: "metadata"` and `metadataHeaders: ["Subject", "From", "Date"]` + read `snippet`. Metadata format avoids downloading full bodies (faster, lighter).
- Run these fetches with a **concurrency limit** (e.g. 10 at a time) to stay under Gmail rate limits.

---

## 5. The classification pipeline (the centerpiece)

This is where you earn the "elite engineering rigor" score. Design it as a real pipeline, not a for-loop of 200 API calls.

### 5.1 Buckets

Default buckets (you choose these): `Important`, `Can Wait`, `Newsletter`, `Auto-archive`, `Promotions`. Each has a **name + description** used in the prompt.

### 5.2 Structured output schema

Gemini supports `responseSchema` (JSON mode). Have the model return, per thread:

```json
{
  "threadId": "string",
  "bucket": "one of the allowed bucket names (enum)",
  "confidence": "number 0-1",
  "reason": "short string, why this bucket"
}
```

`bucket` as an **enum** constrains the model to valid buckets. `confidence` + `reason` power both the escalation logic and a wow-factor UI ("why is this here?").

### 5.3 Batching

Don't send 200 requests. Send **~15–25 threads per call** as a JSON list; the model returns a JSON array of classifications. This cuts 200 calls → ~10 calls: faster, fewer rate-limit hits, and the shared prompt overhead is amortized.

### 5.4 Prompt caching

Your system prompt = instructions + bucket definitions + few-shot examples. That block is **identical across all batches**. Use Gemini **context caching** for it (or, minimally, note in the video that this block is cache-eligible and why). Only the per-batch thread list varies. Real, pointable cost optimization.

### 5.5 Concurrency + rate-limit handling

- Fire the ~10 batch calls with a **concurrency cap** (e.g. `p-limit(3)`) to respect free-tier RPM limits.
- **Exponential backoff with jitter** on HTTP 429 / 5xx. Retry a batch up to N times before marking its threads `Unclassified`.
- This is exactly the "edge-case aware (error handling, rate limits)" item on their checklist.

### 5.6 Confidence-based escalation (the smart bit)

- First pass: everything through **Flash-Lite** (cheap, fast).
- Any thread with `confidence < 0.6` gets collected and re-sent — either in a second pass with richer context (more of the email, tighter prompt) or, in a production framing, escalated to a **stronger model** (Flash or a mid-tier model).
- In the demo you can run the escalation on the same free model; in the video, explain this as the **routing strategy**: cheap-by-default, escalate-on-ambiguity. That's the LLM-understanding signal Tenex is testing.

### 5.7 Pipeline summary (say this in the video)

> Cheap model by default → batch 20 threads per call → cache the shared prompt → cap concurrency + backoff on rate limits → escalate only low-confidence threads. Classification of 200 emails runs in ~10 calls, entirely on a free tier.

---

## 6. Custom buckets & re-classification

- **Add bucket:** user provides a name + (optional) description. Append to the bucket set.
- **Re-classify:** rerun the pipeline (§5) over the **cached** thread data with the updated bucket set. No re-fetch from Gmail needed — threads are already cached.
- **Optimization to mention:** you could re-classify only threads likely to move (e.g., re-check `Can Wait` + low-confidence ones against the new bucket) instead of a full rerun. Simplest correct version does a full rerun; note the targeted-rerun optimization as a trade-off.
- **UX:** optimistic loading state while re-classification runs; stream results in as batches complete so the UI fills progressively rather than blocking.

---

## 7. Data model (in-memory, per session)

```
Session
 ├── threads:        [{ id, subject, from, date, snippet }]
 ├── buckets:        [{ id, name, description, isDefault }]
 └── classifications:[{ threadId, bucketId, confidence, reason }]
```

Keyed by the Auth.js session id in a server-side `Map`. Simple, no DB, survives re-classification. (Resets on server restart — acceptable for a demo, flagged in trade-offs.)

---

## 8. UI structure

- **`/` (unauthenticated):** clean landing + "Sign in with Google" button.
- **`/inbox` (authenticated):**
  - Header: account, refresh, "Add bucket" button.
  - **Bucket columns/sections:** one per bucket, each rendering email **cards** (subject, sender, snippet preview) — like an email homepage. No need to open emails (per spec).
  - **Add-bucket modal:** name + optional description → triggers re-classification with a progress indicator.
  - **Loading states:** skeleton cards during first classification; per-bucket progressive fill as batches return.
- Keep it visually clean and intentional — this is half the demo. Consistent spacing, a restrained palette, clear bucket headers with counts.

---

## 9. Wow-factor extensions (pick 1, maybe 2)

You already emit `confidence` + `reason`, so the cheapest high-leverage wins:

1. **"Why here?"** — hover/expand a card to show the model's one-line reason + confidence. Turns the pipeline's internals into a visible product feature. **(Recommended — nearly free, very demo-able.)**
2. **Natural-language bucket creation** — user types "anything about invoices, receipts, or payments" and you generate the bucket description from it before classifying. Shows LLM use beyond classification.
3. **Confidence surfacing** — flag low-confidence emails with a subtle "unsure" badge; a "Review" view for those. Honest about model limits, which reads as maturity.
4. **Live pipeline/cost panel** — a small dev overlay showing calls made, threads/call, retries, and estimated cost — makes your batching/caching visible during the demo.

Recommended combo: **#1 + #4** — both directly showcase the engineering you already built, with minimal extra code.

---

## 10. Trade-offs to name in the video (§4 of their rubric)

- **In-memory cache vs DB:** chose in-memory for speed of build; production needs Postgres/Redis so classifications persist and scale across sessions/instances.
- **Read-only Gmail scope:** deliberately limited; a real product might need modify scope for archiving/labeling.
- **Full rerun on new bucket:** simplest correct approach; production would do a targeted re-classification pass to cut cost/latency.
- **Free-tier model:** demo runs on Flash-Lite; production would add the escalation tier and possibly a fine-tuned classifier for volume.
- **200-thread cap:** fine for demo; production needs pagination, incremental sync, and background jobs for large mailboxes.
- **No test suite depth:** note what you'd test first (pipeline determinism, schema validation, rate-limit backoff).

---

## 11. Build order (milestones)

1. **Scaffold** Next.js + Tailwind + Auth.js. Google sign-in working end to end.
2. **Gmail fetch** — `/api/threads` returns 200 threads (subject/sender/snippet), cached. Verify with a raw JSON view.
3. **Classification v0** — single-batch Gemini call with structured output over 20 threads. Get valid JSON back.
4. **Pipeline** — batching, concurrency cap, backoff, caching, confidence escalation. Classify all 200.
5. **Inbox UI** — bucketed cards, counts, loading states.
6. **Custom buckets** — add-bucket flow + re-classification over cached data.
7. **Wow factor** — "why here?" + pipeline panel.
8. **Polish** — empty states, errors, responsive, README.
9. **Deploy** (Vercel) + record video.

---

## 12. Submission checklist

- [ ] Public GitHub repo with a clear `README.md` (setup: Google Cloud project, env vars, `npm run dev`).
- [ ] `.env.example` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `NEXTAUTH_SECRET`.
- [ ] Deployed/live link (Vercel).
- [ ] Unlisted YouTube video, 10–20 min, no script: demo → tech stack → architecture (walk the pipeline) → trade-offs.
- [ ] Code is modular, linted, handles errors + rate limits.

---

## Env vars

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=          # free from Google AI Studio, no card
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```
