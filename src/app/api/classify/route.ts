import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCachedThreads, cacheClassifications } from "@/lib/cache";
import { classifyThreads } from "@/lib/pipeline";
import { DEFAULT_BUCKETS } from "@/lib/buckets";

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
    const { classifications, stats } = await classifyThreads(
      threads,
      DEFAULT_BUCKETS,
    );
    cacheClassifications(session.user.email, DEFAULT_BUCKETS, classifications);
    return NextResponse.json({ stats, classifications });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
