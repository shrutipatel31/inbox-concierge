export interface RetryOptions {
  retries?: number; // max additional attempts after the first
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/** Pull an HTTP-ish status out of whatever the SDK threw. */
function extractStatus(err: unknown): number {
  if (typeof err === "object" && err !== null) {
    const e = err as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof e.status === "number") return e.status;
    if (typeof e.code === "number") return e.code;
    // The SDK often throws an Error whose message embeds JSON:
    // {"error":{"code":429,...}}
    if (typeof e.message === "string") {
      const m = e.message.match(/"code"\s*:\s*(\d{3})/);
      if (m) return Number(m[1]);
    }
  }
  return 0;
}

/** Transient failures worth retrying: rate limit (429) or server errors (5xx). */
export function isRetryable(err: unknown): boolean {
  const status = extractStatus(err);
  return status === 429 || (status >= 500 && status <= 599);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff + full jitter.
 * `onRetry` fires before each wait so callers can count retries. Non-retryable
 * errors and exhausted retries rethrow.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
  onRetry?: (attempt: number) => void,
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= retries) throw err;
      attempt++;
      onRetry?.(attempt);
      const ceiling = Math.min(max, base * 2 ** (attempt - 1));
      await sleep(Math.random() * ceiling); // full jitter
    }
  }
}
