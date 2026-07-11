import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchThreads, GmailError } from "@/lib/gmail";
import { getCachedThreads, cacheThreads } from "@/lib/cache";

/**
 * GET /api/threads
 * Returns the last ~200 Gmail threads for the signed-in user. Serves from the
 * per-session cache when present; otherwise fetches from Gmail and caches.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 },
    );
  }
  const key = session.user.email;

  // ?refresh=1 bypasses the cache to pull fresh mail from Gmail.
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const cached = getCachedThreads(key);
  if (cached && !force) {
    return NextResponse.json({ threads: cached, cached: true });
  }

  try {
    const threads = await fetchThreads(session.accessToken);
    cacheThreads(key, threads);
    return NextResponse.json({ threads, cached: false });
  } catch (err) {
    if (err instanceof GmailError) {
      // 401 → token expired/invalid (user should re-auth); else upstream failure.
      const status = err.status === 401 ? 401 : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
}
