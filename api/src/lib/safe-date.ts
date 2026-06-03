/**
 * Safe date coercion for untrusted upstream feed data.
 *
 * `new Date(raw).toISOString()` throws `RangeError: Invalid time value` when
 * `raw` is non-empty but unparseable (a junk `<pubDate>` from an RSS feed, an
 * unusual format V8 can't parse, etc.). A truthiness guard (`raw ? new Date(raw)…`)
 * does NOT prevent this. When that throw escapes a per-item parse loop it takes
 * down the ENTIRE feed/source, not just the one bad item. Use these helpers to
 * coerce loosely and never throw.
 */

/** Parse a loose date string to ISO-8601, or `undefined` if missing/unparseable. */
export function safeIso(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Like `safeIso` but returns `fallback` (default: now) instead of undefined. */
export function safeIsoOr(raw: string | null | undefined, fallback?: string): string {
  return safeIso(raw) ?? fallback ?? new Date().toISOString();
}
