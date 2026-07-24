/**
 * LLM provider health tracking — monitors rate limits, response times,
 * and success rates to route requests intelligently.
 *
 * Uses Cache-API for lightweight per-colo tracking (no KV quota).
 * Providers that are rate-limited are skipped proactively.
 */

export type Provider = 'groq' | 'gemini' | 'nvidia';

interface ProviderHealth {
  /** Timestamp of last rate-limit error (ms since epoch). 0 = not rate-limited. */
  lastRateLimit: number;
  /** Consecutive failures (reset on success). */
  consecutiveFailures: number;
  /** Total successes (for success rate). */
  successes: number;
  /** Total failures (for success rate). */
  failures: number;
  /** Average response time (ms). */
  avgResponseMs: number;
  /** Number of samples for avgResponseMs. */
  responseSamples: number;
}

const RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 minute cooldown after rate limit
const MAX_CONSECUTIVE_FAILURES = 3; // circuit breaker threshold
const HEALTH_TTL_SECONDS = 300; // 5 minutes

function healthKey(provider: Provider): Request {
  return new Request(`https://llm-health.internal/v1/${provider}`);
}

/**
 * Check if a provider is healthy enough to use.
 * Returns false if rate-limited or circuit-broken.
 */
export async function isProviderHealthy(provider: Provider): Promise<boolean> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(healthKey(provider));
    if (!hit) return true; // no data = assume healthy
    const health = (await hit.json()) as ProviderHealth;

    // Rate-limited — skip for cooldown period
    if (health.lastRateLimit > 0 && Date.now() - health.lastRateLimit < RATE_LIMIT_COOLDOWN_MS) {
      return false;
    }

    // Circuit breaker — too many consecutive failures
    if (health.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return false;
    }

    return true;
  } catch {
    return true; // best-effort: assume healthy
  }
}

/**
 * Record a successful call to a provider.
 */
export async function recordSuccess(provider: Provider, responseMs: number): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const existing = await getHealth(provider);
    const totalSamples = existing.responseSamples + 1;
    const avgMs = (existing.avgResponseMs * existing.responseSamples + responseMs) / totalSamples;

    const health: ProviderHealth = {
      lastRateLimit: 0,
      consecutiveFailures: 0,
      successes: existing.successes + 1,
      failures: existing.failures,
      avgResponseMs: avgMs,
      responseSamples: totalSamples,
    };

    await cache.put(
      healthKey(provider),
      new Response(JSON.stringify(health), {
        headers: { 'cache-control': `max-age=${HEALTH_TTL_SECONDS}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Record a failure (rate limit or other error).
 */
export async function recordFailure(provider: Provider, isRateLimit: boolean): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const existing = await getHealth(provider);

    const health: ProviderHealth = {
      lastRateLimit: isRateLimit ? Date.now() : existing.lastRateLimit,
      consecutiveFailures: existing.consecutiveFailures + 1,
      successes: existing.successes,
      failures: existing.failures + 1,
      avgResponseMs: existing.avgResponseMs,
      responseSamples: existing.responseSamples,
    };

    await cache.put(
      healthKey(provider),
      new Response(JSON.stringify(health), {
        headers: { 'cache-control': `max-age=${HEALTH_TTL_SECONDS}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

async function getHealth(provider: Provider): Promise<ProviderHealth> {
  const empty: ProviderHealth = {
    lastRateLimit: 0,
    consecutiveFailures: 0,
    successes: 0,
    failures: 0,
    avgResponseMs: 0,
    responseSamples: 0,
  };
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(healthKey(provider));
    if (!hit) return empty;
    return { ...empty, ...(await hit.json()) };
  } catch {
    return empty;
  }
}

/**
 * Get health summary for all providers (for observability).
 */
export async function getProviderHealthSummary(): Promise<Record<Provider, ProviderHealth & { healthy: boolean }>> {
  const providers: Provider[] = ['groq', 'gemini', 'nvidia'];
  const summary = {} as Record<Provider, ProviderHealth & { healthy: boolean }>;
  for (const p of providers) {
    const health = await getHealth(p);
    const healthy = await isProviderHealthy(p);
    summary[p] = { ...health, healthy };
  }
  return summary;
}

/**
 * Reset a provider's health (e.g., after manual intervention).
 */
export async function resetProviderHealth(provider: Provider): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.delete(healthKey(provider));
  } catch {
    /* best-effort */
  }
}
