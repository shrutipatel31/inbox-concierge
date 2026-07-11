import type { Thread, Classification } from "./types";
import type { Bucket } from "./buckets";

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
  buckets: Bucket[],
  classifications: Classification[],
): void {
  const data = ensure(key);
  data.buckets = buckets;
  data.classifications = classifications;
}

export function getCachedClassifications(
  key: string,
): Classification[] | undefined {
  return store.get(key)?.classifications;
}
