import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/k8s-cve
 *
 * Mirrors the Kubernetes Official CVE Feed
 * (https://kubernetes.io/docs/reference/issues-security/official-cve-feed/index.json,
 * JSON Feed v1). One upstream fetch of index.json per refresh, normalized to
 * snake_case, dual-cached (Cache-API L1 + KV last-good with debounced writes)
 * exactly like supply-chain-attacks.ts. Public, key-gated read (NOT admin-gated).
 *
 * Attribution: the feed is published under CC-BY-4.0; we attribute "Kubernetes"
 * and echo `source`, `source_url`, and `license` in every response so
 * attribution is structural, and the UI credits + links back to kubernetes.io.
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-record); KV
 * read only on miss; KV write debounced via shouldWriteLastGood in waitUntil;
 * NOT added to the /api/v1/snapshot composer. The `status` enum value set is
 * derived at ingest, never hardcoded. Every untrusted upstream field is treated
 * defensively (length-capped strings, coerced arrays).
 *
 * Upstream item shape (confirmed live 2026-06): each items[] entry carries
 *   { id (the CVE id), summary, content_text, date_published, external_url
 *     (cve.org record), url (GitHub issue), status, _kubernetes_io:{ issue_number,
 *     google_group_url } }.
 * Note the spec's `title`/`content_html` are absent in the live feed — we map
 * `title` from `summary` (fallback to the id) and read `content_text`. We never
 * trust a single field for the CVE id: cve_ids[] is extracted via regex from
 * id + summary + content_text.
 */

const UPSTREAM = 'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/index.json';
const SOURCE = 'Kubernetes';
const SOURCE_URL = 'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/';
const DEFAULT_LICENSE = 'CC-BY-4.0 — © The Kubernetes Authors. Attribution: Kubernetes.';

const CACHE_TTL_SECONDS = 1800; // 30 min — the official feed updates infrequently
const KV_LAST_GOOD_KEY = 'k8s-cve:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_ITEMS = 2000; // defensive cap on an untrusted upstream array
const MAX_LIMIT = 1000;

const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;

interface K8sCve {
  id: string;
  title: string;
  /** Primary link out — the cve.org record (external_url) when present, else the issue. */
  url: string;
  published: string;
  summary: string;
  cve_ids: string[];
  /** The upstream GitHub issue tracking the CVE (url field on the item). */
  issue_url: string;
  status: string;
}
interface Facets {
  statuses: Record<string, number>;
}
interface K8sCveResponse {
  source: string;
  source_url: string;
  license: string;
  generated_at: string;
  /** Number of items AFTER any query filter. */
  count: number;
  /** Total items in the feed BEFORE filtering. */
  total: number;
  /** Counts across the full feed (never filtered) so UI chips stay stable. */
  facets: Facets;
  items: K8sCve[];
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Extract every CVE-YYYY-NNNNN from a blob, upper-cased + de-duped, capped. */
function extractCves(...parts: string[]): string[] {
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const matches = part.match(CVE_RE);
    if (!matches) continue;
    for (const m of matches) {
      const up = m.toUpperCase();
      if (!seen.has(up)) seen.add(up);
      if (seen.size >= 20) break;
    }
    if (seen.size >= 20) break;
  }
  return [...seen];
}

function normalizeItem(raw: Record<string, unknown>): K8sCve {
  const id = asString(raw.id, 40);
  const summary = asString(raw.summary, 600);
  // content_text is the long CVSS/description body; we don't return it (compact
  // list page) but DO mine it for CVE ids the id/summary might miss.
  const contentText = asString(raw.content_text, 8000);
  const externalUrl = asString(raw.external_url, 600); // cve.org record
  const issueUrl = asString(raw.url, 600); // GitHub issue
  const cve_ids = extractCves(id, summary, contentText);

  return {
    id,
    // The live feed has no `title`; fall back to the summary, then the id.
    title: asString(raw.title, 400) || summary || id,
    // Prefer the canonical cve.org record as the link-out; fall back to the issue.
    url: externalUrl || issueUrl,
    published: asString(raw.date_published, 40),
    summary,
    cve_ids,
    issue_url: issueUrl,
    status: asString(raw.status, 40),
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(items: K8sCve[]): Facets {
  const facets: Facets = { statuses: {} };
  for (const it of items) bump(facets.statuses, it.status);
  return facets;
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(
  full: K8sCveResponse,
  q: { search?: string; status?: string; cve?: string; limit?: number }
): K8sCveResponse {
  let items = full.items;
  if (q.cve) {
    const c = q.cve.toUpperCase();
    items = items.filter((i) => i.id.toUpperCase() === c || i.cve_ids.includes(c));
  }
  if (q.status) {
    const s = q.status.toLowerCase();
    items = items.filter((i) => i.status.toLowerCase() === s);
  }
  if (q.search) {
    const needle = q.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.id.toLowerCase().includes(needle) ||
        i.title.toLowerCase().includes(needle) ||
        i.summary.toLowerCase().includes(needle)
    );
  }
  if (typeof q.limit === 'number') items = items.slice(0, q.limit);
  return { ...full, items, count: items.length };
}

export async function k8sCveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const search = c.req.query('q')?.trim();
  const status = c.req.query('status')?.trim();
  const cve = c.req.query('cve')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || MAX_LIMIT, MAX_LIMIT) : undefined;
  const filterQ = { search, status, cve, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://k8s-cve-cache.internal/v1?q=${search ?? ''}&s=${status ?? ''}&cve=${cve ?? ''}&l=${limit ?? ''}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: K8sCveResponse | null = null;
  let upstreamError = '';

  try {
    const res = await fetchResilient(
      UPSTREAM,
      {
        headers: { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      } as RequestInit,
      { attempts: 3, timeoutMs: 15_000 }
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: unknown };
      const rawItems = Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS) : [];
      const items = rawItems.map((r) => normalizeItem((r ?? {}) as Record<string, unknown>)).filter((i) => i.id);
      full = {
        source: SOURCE,
        source_url: SOURCE_URL,
        license: DEFAULT_LICENSE,
        generated_at: new Date().toISOString(),
        count: items.length,
        total: items.length,
        facets: buildFacets(items),
        items,
      };
    } else {
      upstreamError = `upstream ${res.status}`;
    }
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    upstreamError = err instanceof Error ? err.message : 'fetch failed';
  }

  // Upstream failed → serve KV last-good (full feed), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as K8sCveResponse;
          const out = applyFilters(staleFull, filterQ);
          return c.json({ ...out, stale: true, upstream_error: upstreamError }, 200, {
            'Cache-Control': 'public, max-age=300',
          });
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* stale read failed; fall through to error */
      }
    }
    return c.json(
      {
        error: 'Kubernetes CVE feed unavailable',
        message: upstreamError || 'no data',
        source: SOURCE,
        source_url: SOURCE_URL,
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  const body = applyFilters(full, filterQ);
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  // Refresh KV last-good with the FULL (unfiltered) feed so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('k8s-cve')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
