/**
 * Run async functions with a concurrency limit.
 * Drop-in replacement for Promise.all(items.map(fn)) that never
 * exceeds `limit` in-flight operations — critical in Workers where
 * the runtime caps concurrent subrequests (typically 6) and exceeding
 * that causes head-of-line blocking.
 */
export async function concurrentMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = 6
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }

  const workers: Promise<void>[] = [];
  const count = Math.min(limit, items.length);
  for (let i = 0; i < count; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}
