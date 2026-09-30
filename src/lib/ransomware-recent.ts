/**
 * Shared client for `/api/v1/ransomware-recent`, coalescing concurrent
 * readers on the same page into one network request. Home mounts two
 * consumers — the hero sparkline (immediate) and the live-signal strip
 * (idle-deferred) — and without this each fired its own fetch for the
 * identical payload.
 *
 * Semantics:
 *   - Concurrent callers join one in-flight promise (no duplicate fetch).
 *   - A successful payload is reused for a short TTL so a caller starting
 *     slightly later (the strip's idle deferral) still skips the network.
 *   - `force` bypasses the TTL with a cache-busting query string (the
 *     hero's manual refresh); it joins an already-running request rather
 *     than starting a second one.
 *   - Resolves `null` on any failure (network, non-2xx, timeout) — never
 *     rejects, so every consumer keeps its own degraded-render path.
 */

export interface RansomwareRecentPayload {
  victims?: { discovered: string; group?: string }[];
}

/** Reuse window for a successful payload. Under the 5-min poll cadence, so polling always refetches. */
const TTL_MS = 30_000;

const DEFAULT_TIMEOUT_MS = 4000;

let inflight: Promise<RansomwareRecentPayload | null> | null = null;
let lastPayload: RansomwareRecentPayload | null = null;
let lastOkAt = 0;

export function fetchRansomwareRecent(
  opts: { force?: boolean; timeoutMs?: number } = {}
): Promise<RansomwareRecentPayload | null> {
  const now = Date.now();
  if (!opts.force && lastPayload !== null && now - lastOkAt < TTL_MS) {
    return Promise.resolve(lastPayload);
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const url = opts.force ? `/api/v1/ransomware-recent?cb=${Date.now()}` : '/api/v1/ransomware-recent';
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const json = (await r.json()) as RansomwareRecentPayload;
      lastPayload = json;
      lastOkAt = Date.now();
      return json;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
