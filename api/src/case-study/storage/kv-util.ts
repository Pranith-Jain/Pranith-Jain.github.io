import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * Count keys under a prefix using ONLY `KV.list` (no per-key `get`).
 *
 * The admin /health endpoint previously fetched every candidate / approved /
 * failure *body* just to call `.length` — dozens of KV reads to produce a
 * number. Listing keys is one operation per 1000 keys and reads zero values.
 *
 * Paginates via the list cursor with a hard page cap so a runaway namespace
 * can't spin the worker. Returned count is exact up to maxPages*1000 keys
 * (far beyond the few-dozen entries these namespaces ever hold).
 */
export async function countByPrefix(ns: KVNamespace, prefix: string, maxPages = 5): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await ns.list({ prefix, cursor });
    count += res.keys.length;
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return count;
}
