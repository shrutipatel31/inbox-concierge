import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getCachedThreads,
  getBuckets,
  getCachedResult,
  cacheClassifications,
} from "@/lib/cache";
import { classifyThreads } from "@/lib/pipeline";

/**
 * GET /api/classify
 * Returns cached classifications when available; runs the full pipeline (batch
 * → concurrency-capped → backoff → confidence escalation) on a cache miss or
 * when ?rerun=1 is passed (used after a Gmail refresh or a new bucket).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const key = session.user.email;

  const threads = getCachedThreads(key);
  if (!threads || threads.length === 0) {
    return NextResponse.json(
      { error: "No cached threads. Load /api/threads first." },
      { status: 400 },
    );
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
