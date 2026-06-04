/** Read a value previously written to the Cloudflare Cache API by a cron job. */
export async function readReportCache<T>(key: string): Promise<T | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(new Request(key));
    if (hit) return (await hit.json()) as T;
  } catch {
    /* miss / unavailable */
  }
  return null;
}
