import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCachedThreads } from "@/lib/cache";
import { classifyBatch } from "@/lib/classifier";
import { DEFAULT_BUCKETS } from "@/lib/buckets";

/**
 * GET /api/classify  (M3 v0)
 * Classifies the first ~20 cached threads in a single Gemini batch and returns
 * the raw classifications. The full pipeline (all 200, batching, concurrency,
 * backoff, escalation) lands in M4.
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
    const batch = threads.slice(0, 20);
    const classifications = await classifyBatch(batch, DEFAULT_BUCKETS);
    return NextResponse.json({ count: classifications.length, classifications });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
