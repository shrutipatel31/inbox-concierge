import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getCachedThreads,
  cacheThreads,
  getBuckets,
  getCachedResult,
  cacheClassifications,
} from "@/lib/cache";
import { fetchThreads, GmailError } from "@/lib/gmail";
import { classifyThreads } from "@/lib/pipeline";
import type { Thread } from "@/lib/types";

/**
 * GET /api/classify
 * Returns cached classifications when available; runs the full pipeline (batch
 * → concurrency-capped → backoff → confidence escalation) on a cache miss or
 * when ?rerun=1 is passed (used after a Gmail refresh or a new bucket).
 *
 * Self-sufficient: if threads aren't cached (e.g. a different serverless
 * instance handled /api/threads), it fetches them from Gmail itself so the
 * call works regardless of instance affinity.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 },
    );
  }
  const key = session.user.email;

  let threads = getCachedThreads(key);
  if (!threads || threads.length === 0) {
    if (!session.accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    try {
      threads = await fetchThreadsAndCache(key, session.accessToken);
    } catch (err) {
      if (err instanceof GmailError) {
        const status = err.status === 401 ? 401 : 502;
        return NextResponse.json({ error: err.message }, { status });
      }
      return NextResponse.json(
        { error: "Failed to fetch threads" },
        { status: 502 },
      );
    }
  }

  if (threads.length === 0) {
    return NextResponse.json({ error: "No emails found." }, { status: 400 });
  }

  const rerun = new URL(request.url).searchParams.get("rerun") === "1";
  const buckets = getBuckets(key);

  if (!rerun) {
    const cached = getCachedResult(key);
    if (cached) {
      return NextResponse.json({ ...cached, buckets, cached: true });
    }
  }

  try {
    const { classifications, stats } = await classifyThreads(threads, buckets);
    cacheClassifications(key, classifications, stats);
    return NextResponse.json({ stats, classifications, buckets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchThreadsAndCache(
  key: string,
  accessToken: string,
): Promise<Thread[]> {
  const threads = await fetchThreads(accessToken);
  cacheThreads(key, threads);
  return threads;
}
