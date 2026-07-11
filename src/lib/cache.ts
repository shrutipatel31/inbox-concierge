import type { Thread } from "./types";

/**
 * In-memory, per-session thread cache (spec §7). Keyed by the signed-in
 * user's email. No DB — this resets on server restart and is not shared
 * across serverless instances; both are deliberate take-home trade-offs.
 *
 * Stashed on `globalThis` so the Map survives Next.js dev hot-reloads
 * (module re-evaluation would otherwise drop it on every edit).
 */
declare global {
  var __inboxThreadCache: Map<string, Thread[]> | undefined;
}

const store = globalThis.__inboxThreadCache ?? new Map<string, Thread[]>();
globalThis.__inboxThreadCache = store;

export function getCachedThreads(key: string): Thread[] | undefined {
  return store.get(key);
}

export function cacheThreads(key: string, threads: Thread[]): void {
  store.set(key, threads);
}
