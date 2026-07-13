import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/supply-chain-attacks
 *
 * Mirrors the supplychainattack.org incident catalog (software supply-chain
 * compromises across npm / PyPI / container registries / AI agents). One
 * upstream fetch of incidents.json per refresh, normalized to snake_case,
 * dual-cached (Cache-API L1 + KV last-good with debounced writes) exactly like
 * malicious-packages.ts. Public, key-gated read (NOT admin-gated).
 *
 * Attribution: the upstream license field reads "Catalog data is free to cite
 * with attribution to supplychainattack.org." We echo `source`, `source_url`,
 * and `license` in every response so attribution is structural, and the UI
 * credits + links back to the source. Neutral framing only (no endorsement).
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-incident); KV
 * read only on miss; KV write debounced via shouldWriteLastGood in waitUntil;
 * NOT added to the /api/v1/snapshot composer (already near the 50-subrequest
 * cap). Enum value sets (status/severity/ecosystem/attackVector) are derived at
 * ingest, never hardcoded (the JSON sample only shows npm/critical, but the
 * catalog spans pypi/container-registry/ai-agents). `iocs` is treated as an
 * open map (only `packages` observed, but urls/hashes/cves may appear).
 */

const UPSTREAM = 'https://supplychainattack.org/incidents.json';
const SOURCE = 'supplychainattack.org';
const SOURCE_URL = 'https://supplychainattack.org';
const DEFAULT_LICENSE = 'Catalog data is free to cite with attribution to supplychainattack.org.';

const CACHE_TTL_SECONDS = 900; // 15 min — upstream `revised`/lastBuildDate is GMT-midnight granularity
const KV_LAST_GOOD_KEY = 'supplychain:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_INCIDENTS = 1000; // defensive cap on an untrusted upstream array (catalog is ~217)
const MAX_LIMIT = 500;

interface AffectedEntity {
  name: string;
  note?: string;
}
interface IncidentSource {
  url: string;
  title: string;
  publisher: string;
}
interface ScIncident {
  id: string;
  url: string;
  title: string;
  status: string;
  severity: string;
  ecosystems: string[];
  attack_vectors: string[];
  disclosed_date: string;
  last_updated: string;
  blast_radius: string;
  affected_entities: AffectedEntity[];
  summary: string;
  iocs: Record<string, string[]>;
  remediation: string[];
  sources: IncidentSource[];
}
interface Facets {
  ecosystems: Record<string, number>;
  statuses: Record<string, number>;
  severities: Record<string, number>;
  attack_vectors: Record<string, number>;
}
interface ScResponse {
  source: string;
  source_url: string;
  license: string;
  revised: string;
  generated_at: string;
  /** Number of incidents AFTER any query filter (i.e. incidents.length). */
  count: number;
  /** Total incidents in the catalog BEFORE filtering. */
  total: number;
  /** Counts across the full catalog (never filtered) so UI chips stay stable. */
  facets: Facets;
  incidents: ScIncident[];
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function asStringArray(v: unknown, maxItems = 100, itemMax = 300): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x) out.push(x.slice(0, itemMax));
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeIncident(raw: Record<string, unknown>): ScIncident {
  const entitiesRaw = Array.isArray(raw.affectedEntities) ? raw.affectedEntities : [];
  const affected_entities: AffectedEntity[] = entitiesRaw
    .slice(0, 200)
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const name = asString(o.name, 300);
      const note = asString(o.note, 300);
      return note ? { name, note } : { name };
    })
    .filter((e) => e.name);

  const sourcesRaw = Array.isArray(raw.sources) ? raw.sources : [];
  const sources: IncidentSource[] = sourcesRaw
    .slice(0, 50)
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { url: asString(o.url, 600), title: asString(o.title, 300), publisher: asString(o.publisher, 200) };
    })
    .filter((s) => s.url || s.title);

  // iocs is an OPEN map keyed by IOC type (packages observed; urls/hashes/cves
  // may appear in other records). Coerce every value to a string[].
  const iocs: Record<string, string[]> = {};
  const iocsRaw = (raw.iocs ?? {}) as Record<string, unknown>;
  if (iocsRaw && typeof iocsRaw === 'object') {
    for (const [k, v] of Object.entries(iocsRaw)) {
      const arr = asStringArray(v, 500, 400);
      if (arr.length) iocs[k.slice(0, 40)] = arr;
    }
  }

  return {
    id: asString(raw.id, 200),
    url: asString(raw.url, 600),
    title: asString(raw.title, 400),
    status: asString(raw.status, 40),
    severity: asString(raw.severity, 40),
    ecosystems: asStringArray(raw.ecosystems, 20, 60),
    attack_vectors: asStringArray(raw.attackVectors, 20, 60),
    disclosed_date: asString(raw.disclosedDate, 40),
    last_updated: asString(raw.lastUpdated, 40),
    blast_radius: asString(raw.blastRadius, 600),
    affected_entities,
    summary: asString(raw.summary, 4000),
    iocs,
    remediation: asStringArray(raw.remediation, 50, 600),
    sources,
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(incidents: ScIncident[]): Facets {
  const facets: Facets = { ecosystems: {}, statuses: {}, severities: {}, attack_vectors: {} };
  for (const inc of incidents) {
    bump(facets.statuses, inc.status);
    bump(facets.severities, inc.severity);
    for (const e of inc.ecosystems) bump(facets.ecosystems, e);
    for (const v of inc.attack_vectors) bump(facets.attack_vectors, v);
  }
  return facets;
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(
  full: ScResponse,
  q: { ecosystem?: string; status?: string; severity?: string; limit?: number }
): ScResponse {
  let incidents = full.incidents;
  if (q.ecosystem) {
    const e = q.ecosystem.toLowerCase();
    incidents = incidents.filter((i) => i.ecosystems.some((x) => x.toLowerCase() === e));
  }
  if (q.status) {
    const s = q.status.toLowerCase();
    incidents = incidents.filter((i) => i.status.toLowerCase() === s);
  }
  if (q.severity) {
    const s = q.severity.toLowerCase();
    incidents = incidents.filter((i) => i.severity.toLowerCase() === s);
  }
  if (typeof q.limit === 'number') incidents = incidents.slice(0, q.limit);
  return { ...full, incidents, count: incidents.length };
}

export async function supplyChainAttacksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ecosystem = c.req.query('ecosystem')?.trim();
  const status = c.req.query('status')?.trim();
  const severity = c.req.query('severity')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || MAX_LIMIT, MAX_LIMIT) : undefined;
  const filterQ = { ecosystem, status, severity, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://supply-chain-attacks-cache.internal/v1?e=${ecosystem ?? ''}&s=${status ?? ''}&sev=${severity ?? ''}&l=${limit ?? ''}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: ScResponse | null = null;
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
      const data = (await res.json()) as {
        license?: string;
        revised?: string;
        incidents?: unknown;
      };
      const rawIncidents = Array.isArray(data.incidents) ? data.incidents.slice(0, MAX_INCIDENTS) : [];
      const incidents = rawIncidents.map((r) => normalizeIncident((r ?? {}) as Record<string, unknown>));
      full = {
        source: SOURCE,
        source_url: SOURCE_URL,
        license: asString(data.license, 400) || DEFAULT_LICENSE,
        revised: asString(data.revised, 40),
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

  // Upstream failed → serve KV last-good (full catalog), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as ScResponse;
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
      { error: 'supplychainattack.org unavailable', message: upstreamError || 'no data', source: SOURCE, source_url: SOURCE_URL },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  const body = applyFilters(full, filterQ);
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  // Refresh KV last-good with the FULL (unfiltered) catalog so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('supply-chain-attacks')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
