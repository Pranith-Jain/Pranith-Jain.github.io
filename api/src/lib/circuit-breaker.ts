import type { ProviderId } from '../providers/types';

/**
 * Provider circuit breaker — tracks consecutive failures per provider and
 * short-circuits repeatedly-failing providers so the IOC check doesn't wait
 * 8s on a dead upstream for every user.
 *
 * The circuit opens when a provider accumulates N consecutive errors within
 * the cache window. Once open, the IOC route skips that provider entirely
 * (returns an immediate `unsupported`) until the window expires.
 *
 * Backed by the Cloudflare Cache API (not KV) — zero KV quota cost, auto-
 * expiring entries, per-colo state that's good enough for abuse protection.
 */
const CONSECUTIVE_FAIL_LIMIT = 3;
const CIRCUIT_WINDOW_SEC = 300; // 5 min — unhealthy provider stays skipped
const CACHE_PREFIX = 'https://cb.internal/v1/';

function cacheKey(provider: ProviderId): Request {
  return new Request(`${CACHE_PREFIX}${encodeURIComponent(provider)}`);
}

/**
 * Check whether the circuit is open for a provider. Returns `true` when the
 * provider should be skipped (open circuit).
 *
 * Fail-open: if the cache is unreachable, allow the call through.
 */
export async function isCircuitOpen(provider: ProviderId): Promise<boolean> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const entry = await cache.match(cacheKey(provider));
    if (!entry) return false;
    const failCount = parseInt(await entry.text(), 10);
    return failCount >= CONSECUTIVE_FAIL_LIMIT;
  } catch {
    return false; // cache error — fail open, let the request through
  }
}

/**
 * Record a provider failure. Increments the consecutive-fail counter.
 * The Cache API entry auto-expires after CIRCUIT_WINDOW_SEC, which
 * gracefully re-allows the provider after the window.
 */
export async function recordProviderFailure(provider: ProviderId): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const key = cacheKey(provider);
    const existing = await cache.match(key);
    const count = existing ? (parseInt(await existing.text(), 10) || 0) + 1 : 1;
    await cache.put(
      key,
      new Response(String(count), {
        headers: { 'cache-control': `max-age=${CIRCUIT_WINDOW_SEC}` },
      })
    );
  } catch {
    // non-fatal — next request will try again
  }
}

/**
 * Record a provider success. Clears the failure counter so consecutive
 * failures reset on the first success.
 */
export async function recordProviderSuccess(provider: ProviderId): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.put(
      cacheKey(provider),
      new Response('0', {
        headers: { 'cache-control': `max-age=${CIRCUIT_WINDOW_SEC}` },
      })
    );
  } catch {
    // non-fatal
  }
}
