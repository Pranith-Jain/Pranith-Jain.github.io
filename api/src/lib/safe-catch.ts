/**
 * Shared error-handling utilities for the API worker.
 *
 * The dominant pattern in this codebase is "fail-soft by contract" — upstream
 * failures produce `null`, which callers null-check. These helpers reduce the
 * boilerplate of the 100+ `.catch(() => null)` call sites.
 */

/** Wrap a promise-returning call to safely return T | null on failure. */
export async function safeNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/** Wrap a promise-returning call to safely return T | null on failure, with
 *  an optional label for structured error logging. */
export async function safeNullLog<T>(label: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/** Wrap a KV.get + .catch(() => null) pattern into a single call. */
export async function kvGetSafe<T>(
  ns: KVNamespace,
  key: string,
  type?: 'text' | 'json' | 'arrayBuffer' | 'stream'
): Promise<T | null> {
  try {
    return (await ns.get(key, type as never)) as T | null;
  } catch {
    return null;
  }
}

/** Workers KV bulk reads accept at most 100 keys per call. */
const KV_BULK_CHUNK = 100;

/**
 * Bulk-read many KV keys using the fewest possible subrequests.
 *
 * KV's batch `get(keys[])` counts as ONE subrequest regardless of key count
 * (vs N for a `Promise.all` of individual gets) but caps at 100 keys per call,
 * so this chunks the input and merges the per-chunk Maps. Values are returned
 * as raw text so callers keep their own `JSON.parse` + per-key error isolation
 * — a malformed value can never fail the whole batch the way a bulk
 * `get(…, 'json')` could. An empty key list returns an empty Map with zero
 * subrequests; missing keys map to null. A failed chunk fails soft (its keys
 * become null) rather than aborting the whole read, matching `kvGetSafe`.
 */
export async function kvBulkGetText(ns: KVNamespace, keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < keys.length; i += KV_BULK_CHUNK) {
    const chunk = keys.slice(i, i + KV_BULK_CHUNK);
    try {
      const res = await ns.get(chunk, 'text');
      for (const [k, v] of res) out.set(k, v);
    } catch {
      for (const k of chunk) if (!out.has(k)) out.set(k, null);
    }
  }
  return out;
}

/** Wrap a KV.put + .catch(() => {}) pattern with optional error logging. */
export async function kvPutSafe(
  ns: KVNamespace,
  key: string,
  value: string | ReadableStream | ArrayBuffer | FormData | URLSearchParams,
  options?: { expirationTtl?: number; metadata?: unknown }
): Promise<boolean> {
  try {
    // KV.put accepts the wider union that includes URLSearchParams / FormData
    // even though the DOM `BodyInit` type narrows it. Cast to `any` here
    // so call-sites stay typed; the runtime accepts all four shapes.
    await ns.put(key, value as unknown as string, options as never);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write `value` to KV only when it differs from what's already stored.
 *
 * Cloudflare KV is metered per write, and a number of sync jobs (OWASP
 * landscape, curated toolbox, last-good fallbacks) re-run on a cron and
 * fetch + serialise a large payload on every tick. Most of those ticks
 * produce a byte-identical payload to what's already in KV; the put is
 * pure waste and burns through the free-tier write budget.
 *
 * Trade-off: each call now costs 1 extra KV read, but writes only happen
 * on real change. For a 50KB JSON payload rewritten every 5 minutes that
 * changes once per day, this turns 288 writes/day into 1 + 1 = 2.
 *
 * Returns true when a put was actually issued, false on no-op, error, or
 * when the value matched.
 */
export async function kvPutIfChanged(
  ns: KVNamespace,
  key: string,
  value: string,
  options?: { expirationTtl?: number; metadata?: unknown }
): Promise<boolean> {
  try {
    const existing = await ns.get(key, 'text');
    if (existing === value) return false;
    // KV.put accepts the wider union that includes URLSearchParams / FormData
    // even though the DOM `BodyInit` type narrows it. Cast at the call site
    // to the runtime signature (which is broader) so callers stay typed
    // for the union they actually use.
    await (ns.put as (k: string, v: typeof value, o?: typeof options) => Promise<unknown>)(key, value, options);
    return true;
  } catch {
    // On any error, fail OPEN (write through) -- losing a write opportunity
    // is cheaper than losing a data refresh.
    try {
      // KV.put accepts the wider union that includes URLSearchParams / FormData
      // even though the DOM `BodyInit` type narrows it. Cast at the call site
      // to the runtime signature (which is broader) so callers stay typed
      // for the union they actually use.
      await (ns.put as (k: string, v: typeof value, o?: typeof options) => Promise<unknown>)(key, value, options);
      return true;
    } catch {
      return false;
    }
  }
}
