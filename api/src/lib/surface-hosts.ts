/**
 * Tools-surface host mapping — the single source of truth for which
 * hostname owns which path prefix.
 *
 * One repo, one Worker, one build, several front doors:
 *
 *   portfolio   pranithjain.qzz.io            portfolio nav + Home
 *   crucible    crucible.pranithjain.qzz.io    owns /dfir
 *   panopticon  panopticon.pranithjain.qzz.io  owns /threatintel
 *   scout       scout.pranithjain.qzz.io       owns /radar
 *
 * Every host serves the SAME route table (both hosts answer `/dfir/*`), so a
 * mapping only picks chrome, the `/` landing page, and the canonical origin —
 * never whether a path exists.
 *
 * Configured as one comma-separated var because wrangler.jsonc vars must be
 * strings and a flat list stays readable in review:
 *
 *   TOOLS_HOSTS="/dfir=crucible.pranithjain.qzz.io,/threatintel=panopticon.pranithjain.qzz.io,/radar=scout.pranithjain.qzz.io"
 *
 * FAIL-SAFE RULE: an unset/empty var collapses everything onto the apex —
 * portfolio surface, apex canonical, no extra allowed origins. That is
 * exactly the pre-split behaviour, so a misconfigured deploy degrades to
 * today's site instead of a broken one. Only map a prefix here once that
 * hostname actually resolves; a canonical pointing at a host with no DNS
 * record is worse than the duplicate content it would fix.
 */

export interface ToolHostEntry {
  /** Path prefix, always starting with `/`. Case kept as configured. */
  prefix: string;
  /** Hostname only (no scheme), lowercased. */
  host: string;
}

/**
 * Parse `TOOLS_HOSTS` into prefix→host entries.
 *
 * Malformed entries (no `=`, empty side, prefix without a leading `/`) are
 * skipped rather than throwing — a typo in one entry must not take down
 * surface resolution for the rest. Duplicate prefixes keep the first
 * occurrence. The result is sorted longest-prefix-first so `/threatintel/x`
 * style lookups prefer the most specific rule.
 */
export function parseToolHosts(raw?: string | null): ToolHostEntry[] {
  const src = (raw ?? '').trim();
  if (!src) return [];
  const out: ToolHostEntry[] = [];
  const seen = new Set<string>();
  for (const part of src.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const prefix = part.slice(0, eq).trim();
    const host = part.slice(eq + 1).trim().toLowerCase();
    if (!prefix || !host) continue;
    if (!prefix.startsWith('/')) continue;
    if (host.includes('://')) continue;
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    out.push({ prefix, host });
  }
  out.sort((a, b) => b.prefix.length - a.prefix.length);
  return out;
}

/**
 * The hostname that owns `pathname`, or `null` when the apex owns it.
 *
 * Segment-aware: `/dfir` matches `/dfir` and `/dfir/anything` but not
 * `/dfir-extra`. Paths are matched case-sensitively because route paths are;
 * prefixes are lowercased at parse time for config tolerance.
 */
export function toolHostForPath(pathname?: string | null, raw?: string | null): string | null {
  const path = pathname || '/';
  for (const { prefix, host } of parseToolHosts(raw)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return host;
  }
  return null;
}

/** Unique configured hostnames, for origin allow-lists (CORS / WebSocket). */
export function toolHostList(raw?: string | null): string[] {
  return [...new Set(parseToolHosts(raw).map((e) => e.host))];
}
