import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/cloud-threat-landscape
 *
 * Mirrors the Wiz Cloud Threat Landscape STIX 2.1 bundle (cloud-focused
 * campaigns / intrusion-sets / threat-actors / reports curated by Wiz
 * Research). ONE upstream fetch of the ~900KB STIX bundle per refresh,
 * normalized into a flat incident view, dual-cached (Cache-API L1 + KV
 * last-good with debounced writes) exactly like supply-chain-attacks.ts.
 * Public, key-gated read (NOT admin-gated).
 *
 * Attribution: the feed is published by Wiz and is free to display + cite
 * with attribution to "Wiz Research". We echo `source`, `source_url`, and
 * `license` in every response so attribution is structural, and the UI
 * credits + links back. Neutral framing only (no endorsement).
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-object); the
 * bundle is big so we lean on Cloudflare edge cache (cacheEverything) + the
 * Cache-API L1; KV read only on miss; KV write debounced via
 * shouldWriteLastGood in waitUntil; NOT added to the /api/v1/snapshot composer
 * (already near the 50-subrequest cap). The object-`type` enum + label set are
 * derived at ingest, never hardcoded (the sample shows mostly `campaign` + one
 * `identity`, but the bundle may also carry intrusion-set / threat-actor /
 * report). Untrusted upstream strings are length-capped, arrays coerced.
 */

const UPSTREAM = 'https://www.wiz.io/feed/cloud-threats-landscape/stix.json';
const SOURCE = 'Wiz Research';
const SOURCE_URL = 'https://www.wiz.io/feed/cloud-threats-landscape';
const DEFAULT_LICENSE = 'Wiz Cloud Threat Landscape — free to display and cite with attribution to Wiz Research.';

const CACHE_TTL_SECONDS = 3600; // 1h — the bundle is large + changes slowly (campaigns added over days)
const KV_LAST_GOOD_KEY = 'cloud-threat-landscape:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_OBJECTS = 5000; // defensive cap on an untrusted upstream array
const MAX_LIMIT = 1000;

// Only these STIX object types become "incidents" in the flat view. Anything
// else in the bundle (identity, relationship, marking-definition, …) is dropped.
const INCIDENT_TYPES = new Set(['campaign', 'intrusion-set', 'report', 'threat-actor']);

interface ExternalRef {
  source_name: string;
  url: string;
}
interface CloudIncident {
  id: string;
  name: string;
  type: string;
  description: string;
  objective: string;
  created: string;
  modified: string;
  labels: string[];
  external_refs: ExternalRef[];
}
interface Facets {
  /** Counts keyed by STIX object type (campaign / intrusion-set / …). */
  types: Record<string, number>;
  /** Counts keyed by label (derived at ingest). */
  labels: Record<string, number>;
}
interface CloudResponse {
  source: string;
  source_url: string;
  license: string;
  spec_version: string;
  bundle_id: string;
  generated_at: string;
  /** Number of incidents AFTER any query filter. */
  count: number;
  /** Total incidents in the bundle BEFORE filtering. */
  total: number;
  /** Counts across the full bundle (never filtered) so UI chips stay stable. */
  facets: Facets;
  incidents: CloudIncident[];
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function asStringArray(v: unknown, maxItems = 100, itemMax = 200): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x) out.push(x.slice(0, itemMax));
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeIncident(raw: Record<string, unknown>): CloudIncident {
  const refsRaw = Array.isArray(raw.external_references) ? raw.external_references : [];
  const external_refs: ExternalRef[] = refsRaw
    .slice(0, 50)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { source_name: asString(o.source_name, 200), url: asString(o.url, 600) };
    })
    .filter((r) => r.url || r.source_name);

  // STIX objects use both `name` and (for reports) sometimes a missing name;
  // fall back gracefully. `objective` is a campaign-only field.
  return {
    id: asString(raw.id, 200),
    name: asString(raw.name, 400),
    type: asString(raw.type, 40),
    description: asString(raw.description, 6000),
    objective: asString(raw.objective, 600),
    created: asString(raw.created, 40),
    modified: asString(raw.modified, 40),
    labels: asStringArray(raw.labels, 30, 80),
    external_refs,
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(incidents: CloudIncident[]): Facets {
  const facets: Facets = { types: {}, labels: {} };
  for (const inc of incidents) {
    bump(facets.types, inc.type);
    for (const l of inc.labels) bump(facets.labels, l);
  }
  return facets;
}

/** Newest first by modified (fallback created). */
function byRecency(a: CloudIncident, b: CloudIncident): number {
  return (b.modified || b.created).localeCompare(a.modified || a.created);
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(full: CloudResponse, q: { type?: string; label?: string; limit?: number }): CloudResponse {
  let incidents = full.incidents;
  if (q.type) {
    const t = q.type.toLowerCase();
    incidents = incidents.filter((i) => i.type.toLowerCase() === t);
  }
  if (q.label) {
    const l = q.label.toLowerCase();
    incidents = incidents.filter((i) => i.labels.some((x) => x.toLowerCase() === l));
  }
  if (typeof q.limit === 'number') incidents = incidents.slice(0, q.limit);
  return { ...full, incidents, count: incidents.length };
}

export async function cloudThreatLandscapeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const type = c.req.query('type')?.trim();
  const label = c.req.query('label')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || MAX_LIMIT, MAX_LIMIT) : undefined;
  const filterQ = { type, label, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://cloud-threat-landscape-cache.internal/v1?t=${type ?? ''}&l=${label ?? ''}&lim=${limit ?? ''}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: CloudResponse | null = null;
  let upstreamError = '';

  try {
    const res = await fetchResilient(
      UPSTREAM,
      {
        headers: { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      } as RequestInit,
      { attempts: 3, timeoutMs: 20_000 }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        id?: string;
        spec_version?: string;
        objects?: unknown;
      };
      const rawObjects = Array.isArray(data.objects) ? data.objects.slice(0, MAX_OBJECTS) : [];
      const incidents = rawObjects
        .map((r) => (r ?? {}) as Record<string, unknown>)
        .filter((o) => INCIDENT_TYPES.has(asString(o.type, 40)))
        .map((o) => normalizeIncident(o))
        .filter((i) => i.id && (i.name || i.description))
        .sort(byRecency);
      full = {
        source: SOURCE,
        source_url: SOURCE_URL,
        license: DEFAULT_LICENSE,
        spec_version: asString(data.spec_version, 20),
        bundle_id: asString(data.id, 200),
        generated_at: new Date().toISOString(),
        count: incidents.length,
        total: incidents.length,
        facets: buildFacets(incidents),
        incidents,
      };
    } else {
      upstreamError = `upstream ${res.status}`;
    }
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    upstreamError = err instanceof Error ? err.message : 'fetch failed';
  }

  // Upstream failed → serve KV last-good (full bundle), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as CloudResponse;
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
        error: 'Wiz Cloud Threat Landscape unavailable',
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

  // Refresh KV last-good with the FULL (unfiltered) bundle so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('cloud-threat-landscape')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
