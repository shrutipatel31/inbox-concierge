# Engineering Notes — issues, decisions, findings

A running log of the non-obvious problems hit while building Inbox Concierge, the
direction chosen for each, and why. Useful as a reference and for the walkthrough video.

---

## Scaffolding & stack

- **`create-next-app` rejected the folder name.** The working dir is `Tenex`, and npm
  package names can't contain capitals. Fix: scaffolded into a lowercase subfolder
  (`inbox-concierge`) and moved the files up.
- **Newer stack than expected: Next.js 16 + React 19 + Tailwind v4.** The scaffold even
  shipped an `AGENTS.md` warning that APIs may differ from training data. We read the
  bundled `node_modules/next/dist/docs` for route-handler conventions before writing.
  Practical effects downstream: async request APIs, the new flat ESLint config, and
  stricter React hooks lint rules (see below).

## Auth (Auth.js v5)

- **Chose Auth.js v5 (beta) over v4.** The single `auth()` helper makes reading the
  session/token in server code clean. Trade-off named: it's still beta.
- **Env var naming.** v5 natively prefers `AUTH_*` names; we explicitly passed
  `process.env.GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_SECRET` so the
  `.env.example` matches the spec.
- **Token expiry bit us mid-build.** Google access tokens last ~1 hour, so `/api/threads`
  started returning a Gmail 401 during testing. Added silent refresh in the `jwt`
  callback (POST the refresh token to Google's token endpoint on expiry, with a 60s skew).
  Needed because testing + recording spans more than an hour.

## Gmail

- **Raw `fetch`, not the `googleapis` SDK.** Two trivial endpoints; fewer deps and every
  line is explainable.
- **Spec said `messages.get`, but that needs a message id `threads.list` doesn't return.**
  Used `threads.get` with `format=metadata` + `metadataHeaders` to pull Subject/From/Date
  and the snippet from the first message. Ran the per-thread fetches in chunks of 10.

## Gemini & the classifier

- **Chose the `@google/genai` SDK over raw REST** (a deliberate inconsistency with the raw
  Gmail client): structured output + eventual caching are fiddly over REST and clean in
  the SDK, and the classifier is the graded centerpiece.
- **Model-id surprises (the biggest time sink).** `gemini-2.5-flash-lite` returns 404
  "no longer available to new users" on a fresh key — *even though it appears in
  `models.list`*. `gemini-3.1-flash` doesn't exist at all. Working models: first pass
  `gemini-3.1-flash-lite`, escalation `gemini-3.5-flash`.
  **Finding: a model being listed by `models.list` does NOT mean it's callable for
  `generateContent`. Always verify by actually making a call.** We wrote a throwaway
  script to probe each candidate before wiring it in.
- **Pinned model ids + `temperature: 0`** for reproducible classification (vs a
  `-latest` alias).

## The pipeline

- **Hand-rolled a ~15-line concurrency worker pool instead of `p-limit`** — zero-dep and
  exactly the kind of code worth being able to explain.
- **Escalation had to target a *stronger* model, not re-run the same one.** With
  `temperature: 0`, re-running the same model on the same input is a no-op, so escalation
  would do nothing. So the low-confidence tail routes to `gemini-3.5-flash`.
- **Escalation rarely fires naturally.** The calibrated prompt makes the model almost
  always self-report ≥0.6 confidence (matching the spec's "only a handful escalate"). To
  *prove* the escalation branch actually runs, we temporarily raised the threshold to 0.95,
  confirmed `escalatedThreads`/`escalationCalls` incremented and results merged, then
  reverted to 0.6.
- **Prompt caching is implicit, not explicit.** Gemini's explicit context cache
  (`caches.create`) has a large minimum-token floor that our system-prompt + few-shot
  prefix is under. So we rely on implicit prefix caching and surface `cachedTokens` in the
  stats rather than fake a number — in tests it read 0, reported honestly.
- **Graceful degradation:** a batch that exhausts retries marks its threads `Unclassified`
  instead of failing the whole run.

## Verification tooling

- **Verified the pipeline live (not just via build) with `npx tsx` scripts** that import
  the real `src/lib` modules. Snags hit and solved:
  - Top-level `await` failed because the project isn't `"type": "module"` (tsx compiled to
    CJS) → wrapped logic in an `async main()`.
  - Scripts placed in the scratchpad couldn't resolve `@google/genai` → ran them from the
    project root so `node_modules` resolves.
  - Node's native TS type-stripping doesn't resolve extensionless relative imports → used
    `npx tsx`, which does.
  - The sandbox blocks network + macOS keychain, so live LLM calls and `git push` run with
    the sandbox disabled for that one command.

## UI & lint

- **Client-side fetching on mount** (server page → client `InboxClient`) so the spec's
  loading states are possible; a server component would block ~18s with a blank screen.
- **Next 16's `react-hooks/set-state-in-effect` flagged the on-mount fetch.** Our
  `setState`s run after `await` (not synchronously) and data-fetching is React's sanctioned
  effect use case, so we used a narrow, commented `eslint-disable` on that one line rather
  than contort the code.
- **`@next/next/no-html-link-for-pages`** required `next/link` for the internal sign-in
  link instead of a raw `<a>`.
- **Prettier added, then removed.** It initially reformatted the spec docs (restored + a
  `.prettierignore` added), and the user preferred fewer moving parts, so we dropped it
  and kept ESLint only. Finding: run formatters scoped, not repo-wide, when hand-authored
  spec docs live in the tree.

## Caching & deploy

- **Page reloads were re-running the whole pipeline.** `/api/classify` now serves the
  server-cached classifications by default and only re-runs on `?rerun=1` (Refresh,
  Add-bucket) — instant reloads, no wasted API calls.
- **Serverless caveat (Vercel).** The in-memory cache is per-instance, so `/api/threads`
  and `/api/classify` can land on different instances and miss the cache. Mitigated by
  making `/api/classify` self-sufficient — it fetches threads itself on a cache miss
  (using the session token), so a single call works regardless of instance. Cached
  *classifications* still don't persist across instances (a cold instance re-runs the
  pipeline); that remains the in-memory-vs-DB trade-off to name on camera.

- **Refresh is a manual pull, by design.** The real-time answer is Gmail push
  (`users.watch` → Google Cloud Pub/Sub), but it's out of scope here and can't be demoed
  on localhost: it needs a public HTTPS webhook (deployed), a Pub/Sub topic + IAM,
  `users.watch` renewal every 7 days (a cron), and `history.list` on each delta — which
  means persisting the last `historyId` in a DB. Since this build deliberately has no DB
  and runs locally, we kept the manual Refresh button and treat pub/sub as a
  productionization talking point: replace the pull with push for real-time, incremental
  sync instead of re-fetching ~200 threads.
