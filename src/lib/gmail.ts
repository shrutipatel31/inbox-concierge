import type { Thread } from "./types";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 100; // Gmail max per threads.list page
const MAX_PAGES = 2; // ~200 threads total
const CONCURRENCY = 10; // parallel threads.get requests per chunk

/** Thrown when Gmail returns a non-2xx response; carries the HTTP status. */
export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

// Minimal shapes for the fields we read (Gmail returns much more).
interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessage {
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}
interface ThreadListResponse {
  threads?: { id: string }[];
  nextPageToken?: string;
}
interface ThreadGetResponse {
  id: string;
  messages?: GmailMessage[];
}

async function gmailFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GmailError(
      `Gmail ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

function header(msg: GmailMessage, name: string): string {
  const match = msg.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return match?.value ?? "";
}

/** Page through threads.list to collect up to ~200 thread IDs. */
async function listThreadIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ maxResults: String(PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailFetch<ThreadListResponse>(
      `/threads?${params}`,
      token,
    );
    for (const t of data.threads ?? []) ids.push(t.id);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

/**
 * Fetch one thread with metadata format (headers only, no bodies) and reduce
 * it to a Thread. We use the first message for subject/from/date/snippet —
 * simplest representative of the thread; good enough for classification.
 */
async function getThread(id: string, token: string): Promise<Thread> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of ["Subject", "From", "Date"]) params.append("metadataHeaders", h);
  const data = await gmailFetch<ThreadGetResponse>(
    `/threads/${id}?${params}`,
    token,
  );
  const msg = data.messages?.[0];
  return {
    id: data.id,
    subject: msg ? header(msg, "Subject") : "",
    from: msg ? header(msg, "From") : "",
    date: msg ? header(msg, "Date") : "",
    snippet: msg?.snippet ?? "",
  };
}

/**
 * Fetch the last ~200 threads as lightweight Thread records. Runs the per-
 * thread metadata fetches in chunks of CONCURRENCY to stay under Gmail's
 * rate limits without a full concurrency library.
 */
export async function fetchThreads(token: string): Promise<Thread[]> {
  const ids = await listThreadIds(token);
  const threads: Thread[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => getThread(id, token)));
    threads.push(...results);
  }
  return threads;
}
