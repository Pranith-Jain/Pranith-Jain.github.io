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
  } catch (err) {
    console.warn(JSON.stringify({ job: 'safe-catch', label, error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

/** Wrap a KV.get + .catch(() => null) pattern into a single call. */
export async function kvGetSafe<T>(ns: KVNamespace, key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<T | null> {
  try {
    return await ns.get(key, type as never) as T | null;
  } catch {
    return null;
  }
}

/** Wrap a KV.put + .catch(() => {}) pattern with optional error logging. */
export async function kvPutSafe(ns: KVNamespace, key: string, value: string | ReadableStream | ArrayBuffer | FormData | URLSearchParams, options?: { expirationTtl?: number; metadata?: unknown }): Promise<boolean> {
  try {
    await ns.put(key, value, options as never);
    return true;
  } catch (err) {
    console.warn(JSON.stringify({ job: 'kv-put', key: key.slice(0, 80), error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}
