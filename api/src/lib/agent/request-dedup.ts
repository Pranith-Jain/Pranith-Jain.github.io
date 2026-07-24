/**
 * Request deduplication — prevents concurrent identical investigations
 * for the same query. Uses Cache-API for lightweight per-colo tracking.
 */

const DEDUP_TTL_SECONDS = 300; // 5 minutes — investigation window

function dedupKey(query: string): Request {
  const normalized = query.trim().toLowerCase();
  return new Request(`https://agent-dedup.internal/v1/${normalized}`);
}

/**
 * Check if an identical investigation is already running.
 * Returns the existing investigation ID if found, null otherwise.
 */
export async function checkDuplicate(query: string): Promise<string | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(dedupKey(query));
    if (!hit) return null;
    const data = (await hit.json()) as { id: string; startedAt: number };
    // Check if the investigation is still running (within TTL)
    if (Date.now() - data.startedAt > DEDUP_TTL_SECONDS * 1000) {
      return null; // expired
    }
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Register an investigation as running for dedup tracking.
 */
export async function registerInvestigation(query: string, id: string): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.put(
      dedupKey(query),
      new Response(JSON.stringify({ id, startedAt: Date.now() }), {
        headers: { 'cache-control': `max-age=${DEDUP_TTL_SECONDS}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Remove an investigation from dedup tracking (on completion/error).
 */
export async function unregisterInvestigation(query: string): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.delete(dedupKey(query));
  } catch {
    /* best-effort */
  }
}
