import type { Thread, Classification } from "./types";
import type { PipelineStats } from "./pipeline";
import { DEFAULT_BUCKETS, type Bucket } from "./buckets";

/**
 * In-memory, per-session cache (spec §7). Keyed by the signed-in user's email.
 * Holds the fetched threads, the active bucket set, and the latest
 * classifications. No DB — resets on server restart and isn't shared across
 * serverless instances; both are deliberate take-home trade-offs.
 *
 * Stashed on `globalThis` so it survives Next.js dev hot-reloads.
 */
export interface SessionData {
  threads: Thread[];
  buckets: Bucket[];
  classifications: Classification[];
  stats?: PipelineStats;
}

declare global {
  var __inboxCache: Map<string, SessionData> | undefined;
}

const store = globalThis.__inboxCache ?? new Map<string, SessionData>();
globalThis.__inboxCache = store;

function ensure(key: string): SessionData {
  let data = store.get(key);
  if (!data) {
    data = { threads: [], buckets: [], classifications: [] };
    store.set(key, data);
  }
  return data;
}

export function getSession(key: string): SessionData | undefined {
  return store.get(key);
}

export function getCachedThreads(key: string): Thread[] | undefined {
  return store.get(key)?.threads;
}

export function cacheThreads(key: string, threads: Thread[]): void {
  ensure(key).threads = threads;
}

export function cacheClassifications(
  key: string,
  classifications: Classification[],
  stats: PipelineStats,
): void {
  const data = ensure(key);
  data.classifications = classifications;
  data.stats = stats;
}

/** Cached classifications + stats for the session, if a run has completed. */
export function getCachedResult(
  key: string,
): { classifications: Classification[]; stats: PipelineStats } | undefined {
  const data = store.get(key);
  if (!data || data.classifications.length === 0 || !data.stats) return undefined;
  return { classifications: data.classifications, stats: data.stats };
}

/** Current bucket set for the session, seeded from defaults on first use. */
export function getBuckets(key: string): Bucket[] {
  const data = ensure(key);
  if (data.buckets.length === 0) data.buckets = [...DEFAULT_BUCKETS];
  return data.buckets;
}

/** Append a custom bucket and return the updated set. */
export function addBucket(key: string, bucket: Bucket): Bucket[] {
  const buckets = getBuckets(key);
  buckets.push(bucket);
  return buckets;
}
