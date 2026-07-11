import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCachedThreads, getBuckets, cacheClassifications } from "@/lib/cache";
import { classifyThreads } from "@/lib/pipeline";

/**
 * GET /api/classify
 * Runs the full classification pipeline over all cached threads (batch →
 * concurrency-capped → backoff → confidence escalation), caches the result,
 * and returns the classifications plus pipeline stats.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const threads = getCachedThreads(session.user.email);
  if (!threads || threads.length === 0) {
    return NextResponse.json(
      { error: "No cached threads. Load /api/threads first." },
      { status: 400 },
    );
  }

  try {
    const buckets = getBuckets(session.user.email);
    const { classifications, stats } = await classifyThreads(threads, buckets);
    cacheClassifications(session.user.email, classifications);
    return NextResponse.json({ stats, classifications, buckets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
