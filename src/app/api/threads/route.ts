import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchThreads, GmailError } from "@/lib/gmail";
import { getCachedThreads, cacheThreads } from "@/lib/cache";

/**
 * GET /api/threads
 * Returns the last ~200 Gmail threads for the signed-in user. Serves from the
 * per-session cache when present; otherwise fetches from Gmail and caches.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const key = session.user.email;

  const cached = getCachedThreads(key);
  if (cached) {
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
