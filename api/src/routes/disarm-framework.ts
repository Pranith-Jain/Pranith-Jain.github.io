import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/disarm-framework
 *
 * Mirrors the DISARM Foundation's published STIX 2.1 bundle — the open
 * framework for describing Foreign Information Manipulation & Interference
 * (FIMI) / disinformation incidents. The bundle carries the full DISARM
 * matrix as MITRE-ATT&CK-shaped objects: `attack-pattern` (techniques, e.g.
 * T0002 "Facilitate State Propaganda"), `x-mitre-tactic` (the 16 tactics,
 * e.g. TA01 "Plan Strategy"), plus relationships, an `x-mitre-matrix`, the
 * `identity` (DISARM Foundation) and a `marking-definition` carrying the
 * CC BY-SA 4.0 statement.
 *
 * We do ONE upstream fetch of the ~835 KB bundle per refresh, normalize the
 * disinformation TTP objects into a flat view, and dual-cache exactly like
 * cloud-threat-landscape.ts / supply-chain-attacks.ts (Cache-API L1 + KV
 * last-good with debounced writes). Public, key-gated read (NOT admin-gated).
 *
 * Attribution / license: the bundle is CC BY-SA 4.0 by the DISARM Foundation.
 * We echo `source`, `source_url`, and `license` (note ShareAlike) in every
 * response so attribution is structural, and the UI credits + links back.
 * Neutral framing only (no endorsement). The raw bundle is also echoed so the
 * page can hand it to <StixObjectTable bundle={…} /> verbatim.
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-object); the
 * bundle is big so we lean on the Cloudflare edge cache (cacheEverything) + the
 * Cache-API L1; KV read only on miss; KV write debounced via shouldWriteLastGood
 * in waitUntil; NOT added to the /api/v1/snapshot composer (already near the
 * 50-subrequest cap). The normalizable `type` allowlist includes intrusion-set /
 * course-of-action defensively (the spec asked for them), though the live DISARM
 * bundle currently only ships attack-pattern + x-mitre-tactic — the type enum +
 * counts are DERIVED at ingest, never hardcoded. Every untrusted upstream string
 * is length-capped and arrays coerced.
 */

const UPSTREAM =
  'https://raw.githubusercontent.com/DISARMFoundation/DISARMframeworks/main/generated_files/DISARM_STIX/DISARM.json';
const SOURCE = 'DISARM Foundation';
const SOURCE_URL = 'https://github.com/DISARMFoundation/DISARMframeworks';
const DEFAULT_LICENSE =
  'DISARM Frameworks © DISARM Foundation, licensed CC BY-SA 4.0 — free to display and reuse with attribution to the DISARM Foundation; derivatives must be shared alike (ShareAlike).';

const CACHE_TTL_SECONDS = 21_600; // 6h — the framework is versioned and changes very slowly
const KV_LAST_GOOD_KEY = 'disarm-framework:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_OBJECTS = 20_000; // defensive cap on an untrusted upstream array (bundle is ~698 objects)
const MAX_RAW_BUNDLE_OBJECTS = 2000; // cap on the raw bundle we echo for StixObjectTable
const MAX_LIMIT = 1000;

// Only these STIX object types become normalized "entries" in the flat view.
// `attack-pattern` = DISARM techniques, `x-mitre-tactic` = DISARM tactics.
// intrusion-set / course-of-action are kept defensively (spec'd) even though the
// current bundle doesn't ship them. Everything else (relationship, identity,
// marking-definition, x-mitre-matrix, …) is dropped from the flat view.
const ENTRY_TYPES = new Set(['attack-pattern', 'x-mitre-tactic', 'intrusion-set', 'course-of-action']);

interface ExternalRef {
  source_name: string;
  external_id: string;
  url: string;
}
interface DisarmEntry {
  id: string;
  type: string;
  name: string;
  description: string;
  /** Primary DISARM id (T0002 / TA01) lifted from external_references. */
  external_id: string;
  /** Kill-chain phase names (DISARM tactic shortnames) on techniques. */
  phases: string[];
  created: string;
  modified: string;
  refs: ExternalRef[];
}
interface Facets {
  /** Counts keyed by normalized STIX object type (attack-pattern / x-mitre-tactic / …). */
  types: Record<string, number>;
}
interface RawBundle {
  type: string;
  id: string;
  objects: Array<Record<string, unknown>>;
}
interface DisarmResponse {
  source: string;
  source_url: string;
  license: string;
  spec_version: string;
  bundle_id: string;
  generated_at: string;
  /** Number of entries AFTER any query filter. */
  count: number;
  /** Total entries in the bundle BEFORE filtering. */
  total: number;
  /** Counts across the full bundle (never filtered) so UI chips stay stable. */
  facets: Facets;
  entries: DisarmEntry[];
  /** Raw (capped) STIX bundle for <StixObjectTable bundle={…} />. */
  bundle: RawBundle;
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function normalizeRefs(raw: unknown): ExternalRef[] {
  const refsRaw = Array.isArray(raw) ? raw : [];
  return refsRaw
    .slice(0, 50)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        source_name: asString(o.source_name, 200),
        external_id: asString(o.external_id, 60),
        url: asString(o.url, 600),
      };
    })
    .filter((r) => r.url || r.source_name || r.external_id);
}

function normalizePhases(raw: unknown): string[] {
  const phasesRaw = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const p of phasesRaw.slice(0, 30)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const name = asString(o.phase_name, 80);
    if (name) out.push(name);
  }
  return out;
}

function normalizeEntry(raw: Record<string, unknown>): DisarmEntry {
  const refs = normalizeRefs(raw.external_references);
  // DISARM ids (T0002 / TA01) live on external_references[].external_id; prefer the
  // first ref that carries one.
  const external_id = refs.find((r) => r.external_id)?.external_id ?? '';
  return {
    id: asString(raw.id, 200),
    type: asString(raw.type, 40),
    name: asString(raw.name, 400),
    description: asString(raw.description, 8000),
    external_id,
    phases: normalizePhases(raw.kill_chain_phases),
    created: asString(raw.created, 40),
    modified: asString(raw.modified, 40),
    refs,
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(entries: DisarmEntry[]): Facets {
  const facets: Facets = { types: {} };
  for (const e of entries) bump(facets.types, e.type);
  return facets;
}

/**
 * Sort: tactics (x-mitre-tactic) first, then techniques; within a type, by the
 * DISARM external_id so TA01..TA16 / T0001.. read in framework order.
 */
function byFrameworkOrder(a: DisarmEntry, b: DisarmEntry): number {
  const rank = (t: string) => (t === 'x-mitre-tactic' ? 0 : 1);
  const r = rank(a.type) - rank(b.type);
  if (r !== 0) return r;
  return a.external_id.localeCompare(b.external_id, undefined, { numeric: true });
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(
  full: DisarmResponse,
  q: { type?: string; q?: string; limit?: number }
): DisarmResponse {
  let entries = full.entries;
  if (q.type) {
    const t = q.type.toLowerCase();
    entries = entries.filter((e) => e.type.toLowerCase() === t);
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(needle) ||
        e.description.toLowerCase().includes(needle) ||
        e.external_id.toLowerCase().includes(needle)
    );
  }
  if (typeof q.limit === 'number') entries = entries.slice(0, q.limit);
  return { ...full, entries, count: entries.length };
}

export async function disarmFrameworkHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const type = c.req.query('type')?.trim();
  const q = c.req.query('q')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || MAX_LIMIT, MAX_LIMIT) : undefined;
  const filterQ = { type, q, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://disarm-framework-cache.internal/v1?t=${type ?? ''}&q=${q ?? ''}&lim=${limit ?? ''}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: DisarmResponse | null = null;
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
      const objs = rawObjects.map((r) => (r ?? {}) as Record<string, unknown>);

      const entries = objs
        .filter((o) => ENTRY_TYPES.has(asString(o.type, 40)))
        .map((o) => normalizeEntry(o))
        .filter((e) => e.id && (e.name || e.description))
        .sort(byFrameworkOrder);

      // The DISARM bundle has no TOP-LEVEL spec_version; STIX 2.1 stamps it on
      // each object. Derive a representative spec_version from the objects.
      const objSpec = objs.map((o) => asString(o.spec_version, 20)).find((s) => s) ?? '';

      const rawBundle: RawBundle = {
        type: 'bundle',
        id: asString(data.id, 200),
        objects: objs.slice(0, MAX_RAW_BUNDLE_OBJECTS),
      };

      full = {
        source: SOURCE,
        source_url: SOURCE_URL,
        license: DEFAULT_LICENSE,
        spec_version: asString(data.spec_version, 20) || objSpec,
        bundle_id: asString(data.id, 200),
        generated_at: new Date().toISOString(),
        count: entries.length,
        total: entries.length,
        facets: buildFacets(entries),
        entries,
        bundle: rawBundle,
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
          const staleFull = JSON.parse(staleRaw) as DisarmResponse;
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
      { error: 'DISARM Frameworks unavailable', message: upstreamError || 'no data', source: SOURCE, source_url: SOURCE_URL },
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
        if (await shouldWriteLastGood('disarm-framework')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
