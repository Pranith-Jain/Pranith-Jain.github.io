/**
 * Centralised body-input guard for POST handlers.
 *
 * Every POST handler that calls `await c.req.json()` directly is one body-
 * size limit away from being a worker OOM/CPU-timeout vector. This helper
 * makes it impossible to forget the size check, parses safely, and adds a
 * depth limit so a deeply-nested attacker-supplied JSON object can't blow
 * the stack on JSON.parse (cheap defence-in-depth — V8 is well-hardened,
 * but the cost of the check is microseconds).
 *
 * Usage:
 *
 *   const body = await safeJsonBody<{ slug: string; body: string }>(c, {
 *     maxBytes: 64 * 1024,   // 64 KB
 *     maxDepth: 8,
 *   });
 *   if ('error' in body) return body.error;   // 413 / 400 with safe message
 *   // body.value is the typed parsed object
 *
 * The handler decides the size cap — different endpoints have very different
 * legitimate payload shapes (a markdown post body vs. a 250-package list).
 */

import type { Context } from 'hono';

export interface SafeJsonOptions {
  maxBytes: number;
  /** Max nesting depth in the parsed JSON (default: 10). */
  maxDepth?: number;
}

export type SafeJsonResult<T> = { value: T } | { error: Response };

function jsonDepth(node: unknown, maxDepth: number, depth = 0): boolean {
  if (depth > maxDepth) return false;
  if (node === null || typeof node !== 'object') return true;
  // Arrays + plain objects share the same recursion path; cap each child.
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (!jsonDepth(v, maxDepth, depth + 1)) return false;
  }
  return true;
}

export async function safeJsonBody<T>(
  c: Context,
  { maxBytes, maxDepth = 10 }: SafeJsonOptions
): Promise<SafeJsonResult<T>> {
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return { error: c.json({ error: 'invalid request body' }, 400) };
  }
  // Byte length, not character length — UTF-8 can encode one code point as
  // multiple bytes (the worker's memory cost tracks bytes, not chars).
  const bytes = new Blob([raw]).size;
  if (bytes > maxBytes) {
    return {
      error: c.json({ error: 'body too large', limit_bytes: maxBytes }, 413, {
        'cache-control': 'no-store',
      }),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: c.json({ error: 'invalid JSON' }, 400) };
  }
  if (!jsonDepth(parsed, maxDepth)) {
    return { error: c.json({ error: 'JSON too deeply nested', max_depth: maxDepth }, 400) };
  }
  return { value: parsed as T };
}
