import type { Thread, Classification } from "./types";
import type { Bucket } from "./buckets";
import {
  classifyBatch,
  DEFAULT_MODEL,
  ESCALATION_MODEL,
} from "./classifier";
import { runWithConcurrency } from "./concurrency";
import { withRetry } from "./retry";

const BATCH_SIZE = 20; // threads per Gemini call
const CONCURRENCY = 3; // batches in flight at once (free-tier RPM headroom)
const CONFIDENCE_THRESHOLD = 0.6; // below this → escalate
const UNCLASSIFIED = "Unclassified"; // sentinel for batches that fail all retries

export interface PipelineStats {
  totalThreads: number;
  batches: number;
  firstPassCalls: number;
  escalatedThreads: number;
  escalationCalls: number;
  retries: number;
  failedThreads: number;
  cachedTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface PipelineResult {
  classifications: Classification[];
  stats: PipelineStats;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Classify all threads: cheap model by default, batched, concurrency-capped,
 * with backoff on rate limits, then a second pass that escalates only the
 * low-confidence tail to a stronger model. Returns classifications in the
 * original thread order plus stats that make the pipeline's work observable.
 */
export async function classifyThreads(
  threads: Thread[],
  buckets: Bucket[],
): Promise<PipelineResult> {
  const start = Date.now();
  const stats: PipelineStats = {
    totalThreads: threads.length,
    batches: 0,
    firstPassCalls: 0,
    escalatedThreads: 0,
    escalationCalls: 0,
    retries: 0,
    failedThreads: 0,
    cachedTokens: 0,
    totalTokens: 0,
    durationMs: 0,
  };

  const threadById = new Map(threads.map((t) => [t.id, t]));
  const byId = new Map<string, Classification>();

  // ---- First pass: every batch on the cheap model ----
  const batches = chunk(threads, BATCH_SIZE);
  stats.batches = batches.length;

  const firstPass = await runWithConcurrency(
    batches,
    CONCURRENCY,
    async (batch): Promise<Classification[]> => {
      try {
        const res = await withRetry(
          () => classifyBatch(batch, buckets, DEFAULT_MODEL),
          {},
          () => stats.retries++,
        );
        stats.firstPassCalls++;
        stats.cachedTokens += res.cachedTokens;
        stats.totalTokens += res.totalTokens;
        return res.classifications;
      } catch {
        // Exhausted retries → don't sink the whole run; mark these Unclassified.
        stats.failedThreads += batch.length;
        return batch.map((t) => ({
          threadId: t.id,
          bucket: UNCLASSIFIED,
          confidence: 0,
          reason: "Classification failed",
        }));
      }
    },
  );
  for (const list of firstPass) for (const c of list) byId.set(c.threadId, c);

  // ---- Escalation: re-classify the low-confidence tail on the stronger model ----
  const lowConf = [...byId.values()].filter(
    (c) => c.bucket !== UNCLASSIFIED && c.confidence < CONFIDENCE_THRESHOLD,
  );
  stats.escalatedThreads = lowConf.length;

  if (lowConf.length > 0) {
    const escThreads = lowConf
      .map((c) => threadById.get(c.threadId))
      .filter((t): t is Thread => t !== undefined);
    const escBatches = chunk(escThreads, BATCH_SIZE);

    const escPass = await runWithConcurrency(
      escBatches,
      CONCURRENCY,
      async (batch): Promise<Classification[]> => {
        try {
          const res = await withRetry(
            () => classifyBatch(batch, buckets, ESCALATION_MODEL),
            {},
            () => stats.retries++,
          );
          stats.escalationCalls++;
          stats.cachedTokens += res.cachedTokens;
          stats.totalTokens += res.totalTokens;
          return res.classifications;
        } catch {
          return []; // escalation failed → keep the first-pass result
        }
      },
    );
    for (const list of escPass) {
      for (const c of list) {
        const prev = byId.get(c.threadId);
        // Keep whichever pass was more confident.
        if (!prev || c.confidence >= prev.confidence) byId.set(c.threadId, c);
      }
    }
  }

  // Return in original thread order.
  const classifications = threads
    .map((t) => byId.get(t.id))
    .filter((c): c is Classification => c !== undefined);
  stats.durationMs = Date.now() - start;
  return { classifications, stats };
}
