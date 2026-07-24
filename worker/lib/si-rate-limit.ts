/**
 * Per-provider rate limiter for Security Investigator IP enrichment.
 *
 * The upstream security-investigator calls enrichment providers (ipinfo,
 * abuseipdb, shodan, shodan-internetdb, vpnapi) directly, so the free tiers
 * cap how aggressively an LLM client can drive si_enrich_ip_batch. Our
 * Worker fans out through env.SELF to the same providers, and the free
 * quotas are the SAME — 1000 AbuseIPDB lookups/day, 50k ipinfo/month,
 * Shodan varies by plan, Shodan-InternetDB is uncapped, VPNAPI is
 * plan-based.
 *
 * To avoid burning the platform's quotas, this module sits in front of
 * the per-provider fetches inside `si-enrich.ts` (callers wrap the
 * provider call with `await rateLimit.consume(env, 'abuseipdb')`). When
 * a bucket is empty, we surface `status: 'rate_limited'` in the
 * `diagnostics` array so the LLM client knows WHY a field is empty
 * (vs. "the provider returned nothing").
 *
 * Strategy: fixed-window counter in `caches.default`. Per-provider,
 * per-window key like `rl:abuseipdb:2026-06-13`. Cache-API is free,
 * per-colo, and survives across invocations. The trade-off vs KV is
 * that each colo tracks its own counter — the effective limit is
 * ~maxPerWindow per colo, not globally. This is acceptable because:
 *   - The quotas are daily (1000/day abuseipdb), not per-second
 *   - Each colo sees a subset of traffic
 *   - Worst case: slight over-counting, which is fine for loose daily caps
 *
 * Migrated from KV on 2026-07-24 to drop 1 KV read + 1 KV write per
 * enrichment call (the single biggest KV consumer in the SI pipeline).
 */

export type RateLimitedProvider =
  'ipinfo' | 'ipqs' | 'abuseipdb' | 'shodan' | 'shodan-internetdb' | 'vpnapi' | 'phantomcandle';

export interface ProviderQuota {
  /** Provider identifier (matches the keys in env / diagnostics). */
  provider: RateLimitedProvider;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max calls per window. */
  maxPerWindow: number;
  /** Whether this provider is rate-limited at all. shodan-internetdb is
   *  not — it's free and uncapped, so we skip the check. */
  enabled: boolean;
}

/**
 * Conservative quotas based on free tiers documented at the upstream
 * services (2026-01):
 *   - ipinfo free: 50k/month ≈ 1700/day ≈ 70/hour
 *   - abuseipdb free: 1000/day
 *   - shodan free: 100/month (essentially off for batch use)
 *   - shodan-internetdb: unlimited (no limiter)
 *   - vpnapi free: 1000/day
 *   - phantomcandle free: ~1500/month ≈ 50/day
 *
 * The Worker tier is the same as the user tier — these caps protect
 * the platform's API keys, not just the per-client usage.
 */
export const PROVIDER_QUOTAS: Record<RateLimitedProvider, ProviderQuota> = {
  ipinfo: { provider: 'ipinfo', windowMs: 60 * 60 * 1000, maxPerWindow: 70, enabled: true },
  ipqs: { provider: 'ipqs', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 500, enabled: true },
  abuseipdb: { provider: 'abuseipdb', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 1000, enabled: true },
  shodan: { provider: 'shodan', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 5, enabled: true },
  'shodan-internetdb': { provider: 'shodan-internetdb', windowMs: 0, maxPerWindow: 0, enabled: false },
  vpnapi: { provider: 'vpnapi', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 1000, enabled: true },
  phantomcandle: { provider: 'phantomcandle', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 50, enabled: true },
};

export interface RateLimitDecision {
  /** Whether the call is allowed to proceed. */
  allowed: boolean;
  /** Current count after this call (only meaningful when `allowed`). */
  count: number;
  /** Limit configured for this provider. */
  limit: number;
  /** Window start timestamp in ms. */
  windowStart: number;
  /** Window length in ms. */
  windowMs: number;
  /** Seconds until the window rolls over. Use this for the
   *  `Retry-After` header and the diagnostics error string. */
  retryAfterSeconds: number;
  /** When the call was rate-limited, the limit value (0 if disabled). */
  remaining: number;
}

export interface SiRateLimiter {
  /** Record a call against the provider. Returns the decision; if
   *  `allowed` is false, the caller should NOT make the upstream call. */
  consume(provider: RateLimitedProvider): Promise<RateLimitDecision>;
  /** Read the current state without consuming. Useful for diagnostic
   *  endpoints that want to surface "you have N calls left". */
  peek(provider: RateLimitedProvider): Promise<Omit<RateLimitDecision, 'allowed'>>;
  /** Bulk reset — only callable from admin / test paths. The caller
   *  is responsible for gating this with an admin token. */
  reset(provider: RateLimitedProvider): Promise<void>;
}

function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function retryAfter(now: number, ws: number, wms: number): number {
  return Math.max(1, Math.ceil((ws + wms - now) / 1000));
}

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

function cacheKey(provider: string, ws: number): Request {
  return new Request(`https://si-rl.internal/v1/${provider}/${ws}`);
}

async function readCount(cache: Cache, provider: string, ws: number): Promise<number> {
  try {
    const hit = await cache.match(cacheKey(provider, ws));
    if (!hit) return 0;
    const n = parseInt(await hit.text(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function createSiRateLimiter(_kv?: unknown, now: () => number = () => Date.now()): SiRateLimiter {
  // _kv is accepted for backwards compatibility but ignored — we use Cache-API
  return {
    async consume(provider) {
      const q = PROVIDER_QUOTAS[provider];
      if (!q.enabled) {
        return {
          allowed: true,
          count: 0,
          limit: 0,
          windowStart: 0,
          windowMs: 0,
          retryAfterSeconds: 0,
          remaining: Number.MAX_SAFE_INTEGER,
        };
      }
      const cache = cacheApi();
      if (!cache) {
        // Cache unavailable — fail open
        return {
          allowed: true,
          count: 0,
          limit: q.maxPerWindow,
          windowStart: 0,
          windowMs: q.windowMs,
          retryAfterSeconds: 0,
          remaining: q.maxPerWindow,
        };
      }
      const ws = windowStart(now(), q.windowMs);
      const prev = await readCount(cache, provider, ws);
      const next = prev + 1;
      if (next > q.maxPerWindow) {
        return {
          allowed: false,
          count: prev,
          limit: q.maxPerWindow,
          windowStart: ws,
          windowMs: q.windowMs,
          retryAfterSeconds: retryAfter(now(), ws, q.windowMs),
          remaining: 0,
        };
      }
      // Best-effort increment. max-age expires the entry at the end of the
      // window so the bucket resets without a TTL sweep.
      const windowSec = Math.ceil(q.windowMs / 1000);
      try {
        await cache.put(
          cacheKey(provider, ws),
          new Response(String(next), {
            headers: { 'cache-control': `max-age=${windowSec}` },
          })
        );
      } catch {
        /* best-effort — a write failure doesn't block the request */
      }
      return {
        allowed: true,
        count: next,
        limit: q.maxPerWindow,
        windowStart: ws,
        windowMs: q.windowMs,
        retryAfterSeconds: retryAfter(now(), ws, q.windowMs),
        remaining: q.maxPerWindow - next,
      };
    },

    async peek(provider) {
      const q = PROVIDER_QUOTAS[provider];
      const cache = cacheApi();
      if (!q.enabled || !cache) {
        return {
          count: 0,
          limit: q.maxPerWindow,
          windowStart: 0,
          windowMs: q.windowMs,
          retryAfterSeconds: 0,
          remaining: q.maxPerWindow,
        };
      }
      const ws = windowStart(now(), q.windowMs);
      const count = await readCount(cache, provider, ws);
      return {
        count,
        limit: q.maxPerWindow,
        windowStart: ws,
        windowMs: q.windowMs,
        retryAfterSeconds: retryAfter(now(), ws, q.windowMs),
        remaining: Math.max(0, q.maxPerWindow - count),
      };
    },

    async reset(provider) {
      const cache = cacheApi();
      if (!cache) return;
      const q = PROVIDER_QUOTAS[provider];
      if (!q.enabled) return;
      const ws = windowStart(now(), q.windowMs);
      // Best-effort delete current and previous window
      try {
        await Promise.all([cache.delete(cacheKey(provider, ws)), cache.delete(cacheKey(provider, ws - q.windowMs))]);
      } catch {
        /* best-effort */
      }
    },
  };
}

export interface RateLimitEnv {
  KV_CACHE?: unknown;
}
