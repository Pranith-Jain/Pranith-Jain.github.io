import type { ProviderId } from '../providers/types';

/**
 * Provider circuit breaker — tracks consecutive failures per provider and
 * short-circuits repeatedly-failing providers so the IOC check doesn't wait
 * 8s on a dead upstream for every user.
 *
 * The circuit opens when a provider accumulates N consecutive errors within
 * the time window. Once open, the IOC route skips that provider entirely
 * (returns an immediate `unsupported`) until the window expires.
 *
 * Uses an in-memory Map (not the Cache API) to avoid burning the Workers
 * 50-subrequest budget. Per-colo state is sufficient — the circuit only
 * needs to protect against a burst of slow timeouts, not global coordination.
 */
const CONSECUTIVE_FAIL_LIMIT = 3;
const CIRCUIT_WINDOW_MS = 300_000; // 5 min

interface CircuitState {
  count: number;
  resetAt: number;
}

const state = new Map<ProviderId, CircuitState>();

/**
 * Check whether the circuit is open for a provider. Returns `true` when the
 * provider should be skipped (open circuit).
 */
export function isCircuitOpen(provider: ProviderId): boolean {
  const entry = state.get(provider);
  if (!entry) return false;
  if (Date.now() >= entry.resetAt) {
    state.delete(provider);
    return false;
  }
  return entry.count >= CONSECUTIVE_FAIL_LIMIT;
}

/**
 * Record a provider failure. Increments the consecutive-fail counter.
 * Auto-resets after CIRCUIT_WINDOW_MS.
 *
 * Note: While Workers can process requests concurrently, the JS event loop
 * is single-threaded per request context, so the read-modify-write on the
 * Map is safe within a single microtask. The async label is kept for API
 * consistency with recordProviderSuccess.
 */
export function recordProviderFailure(provider: ProviderId): void {
  const now = Date.now();
  const entry = state.get(provider);
  if (!entry || now >= entry.resetAt) {
    state.set(provider, { count: 1, resetAt: now + CIRCUIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

/**
 * Record a provider success. Clears the failure counter so consecutive
 * failures reset on the first success.
 */
export async function recordProviderSuccess(provider: ProviderId): Promise<void> {
  state.delete(provider);
}
