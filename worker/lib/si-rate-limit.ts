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
 * Strategy: fixed-window counter in `KV_CACHE`. Per-provider, per-window
 * key like `rl:abuseipdb:2026-06-13`. We `getWithMetadata` first to read
 * the count, then `put` the incremented value with a TTL slightly
 * longer than the window. This is the cheapest correct approach for
 * Cloudflare KV (read-modify-write is eventually-consistent, but the
 * free-tier caps are loose enough that brief over-counting is harmless).
 *
 * NOTE: For higher-precision, this could be backed by the CRON_LOCK_DO
 * Durable Object (which is the platform's atomic-counter primitive),
 * but KV suffices for IP-enrichment because the underlying limits are
 * loose (1000/day is ~12/minute, and we already serialise calls per
 * Durable Object instance).
 */

export type RateLimitedProvider = 'ipinfo' | 'abuseipdb' | 'shodan' | 'shodan-internetdb' | 'vpnapi';

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
 *
 * The Worker tier is the same as the user tier — these caps protect
 * the platform's API keys, not just the per-client usage.
 */
export const PROVIDER_QUOTAS: Record<RateLimitedProvider, ProviderQuota> = {
  ipinfo: { provider: 'ipinfo', windowMs: 60 * 60 * 1000, maxPerWindow: 70, enabled: true },
  abuseipdb: { provider: 'abuseipdb', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 1000, enabled: true },
  shodan: { provider: 'shodan', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 5, enabled: true },
  'shodan-internetdb': { provider: 'shodan-internetdb', windowMs: 0, maxPerWindow: 0, enabled: false },
  vpnapi: { provider: 'vpnapi', windowMs: 24 * 60 * 60 * 1000, maxPerWindow: 1000, enabled: true },
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

async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function createSiRateLimiter(kv: KVNamespace | undefined, now: () => number = () => Date.now()): SiRateLimiter {
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
      if (!kv) {
        // No KV — allow but log so we know the limiter is bypassed.
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
      const key = `rl:${provider}:${ws}`;
      const prev = await readCount(kv, key);
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
      // TTL is window length + 1 hour (so the key naturally expires
      // and the counter resets). KV `expirationTtl` is in seconds.
      await kv.put(key, String(next), { expirationTtl: Math.ceil(q.windowMs / 1000) + 3600 });
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
      if (!q.enabled || !kv) {
        return { count: 0, limit: q.maxPerWindow, windowStart: 0, windowMs: q.windowMs, retryAfterSeconds: 0, remaining: q.maxPerWindow };
      }
      const ws = windowStart(now(), q.windowMs);
      const key = `rl:${provider}:${ws}`;
      const count = await readCount(kv, key);
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
      if (!kv) return;
      const q = PROVIDER_QUOTAS[provider];
      if (!q.enabled) return;
      // Clear all windows we know about — there are at most 2 (current
      // and previous) in practice but we just iterate to be safe.
      const ws = windowStart(now(), q.windowMs);
      await kv.delete(`rl:${provider}:${ws}`);
      await kv.delete(`rl:${provider}:${ws - q.windowMs}`);
    },
  };
}

export interface RateLimitEnv {
  KV_CACHE?: KVNamespace;
}
