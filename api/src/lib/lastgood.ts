/**
 * Generic cross-colo "last-good" fallback for single-upstream endpoints.
 *
 * `caches.default` is per-colo and short-lived; KV is global and durable. When
 * a live upstream fetch fails, times out, or the per-request compute blows the
 * Worker CPU budget, every colo can still serve the last payload *any* colo
 * successfully produced — flagged `stale: true` — instead of a hard 5xx /
 * "Couldn't load this".
 *
 * Pairs with `shouldWriteLastGood` (api/src/lib/lastgood-debounce.ts): reads are
 * cheap and unconditional, but writes are debounced per-key through a free
 * per-colo marker so a single shared KV key isn't rewritten on every
 * cache-miss-success (KV is metered and capped at 1 write/sec/key).
 *
 * Several routes (mti, ransomware-recent, malicious-packages, …) grew their own
 * copy of this read/write pair; this is the shared implementation they should
 * converge on.
 */

import type { Env } from '../env';
import { shouldWriteLastGood } from './lastgood-debounce';

/** 48h default — long enough to ride out a multi-hour upstream outage. */
const DEFAULT_TTL_SECONDS = 48 * 60 * 60;
const KEY_PREFIX = 'lastgood:v1:';

/**
 * Read the global last-good payload for `key`, or null if none / KV absent /
 * read error. Never throws — a missing fallback degrades to the caller's own
 * empty-state handling.
 */
export async function readLastGood<T>(env: Env, key: string): Promise<T | null> {
  if (!env.KV_CACHE) return null;
  try {
    return (await env.KV_CACHE.get(`${KEY_PREFIX}${key}`, 'json')) as T | null;
  } catch {
    return null;
  }
}

/**
 * Persist `value` as the global last-good for `key`, debounced so a hot key is
 * only rewritten once per `debounceTtlSeconds` (defaults to the debounce
 * helper's own 6h). Safe to call from `waitUntil`; never throws.
 *
 * Pass `force: true` to skip the debounce entirely — for controlled callers
 * like a cron precompute that runs on a fixed cadence and should always refresh
 * the global copy (the debounce only exists to throttle request-path writes).
 *
 * Returns true when a write was actually issued (debounce cold), false when it
 * was skipped or KV is unavailable — useful for logging/tests.
 */
export async function writeLastGood<T>(
  env: Env,
  key: string,
  value: T,
  opts: { ttlSeconds?: number; debounceTtlSeconds?: number; force?: boolean } = {}
): Promise<boolean> {
  if (!env.KV_CACHE) return false;
  try {
    if (!opts.force && !(await shouldWriteLastGood(`lastgood:${key}`, opts.debounceTtlSeconds))) return false;
    await env.KV_CACHE.put(`${KEY_PREFIX}${key}`, JSON.stringify(value), {
      expirationTtl: opts.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    });
    return true;
  } catch {
    return false;
  }
}
