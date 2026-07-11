/**
 * Run `fn` over `items` with at most `limit` promises in flight at once, and
 * return the results in input order. A tiny worker-pool: `limit` workers pull
 * the next index off a shared counter until the list is exhausted.
 *
 * `fn` is expected not to throw (callers handle per-item failure and return a
 * fallback), so one bad item never rejects the whole batch.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
