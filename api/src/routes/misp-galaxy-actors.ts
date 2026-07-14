import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/misp-galaxy-actors
 *
 * Mirrors the MISP Galaxy threat-actor cluster — a community alias index that
 * maps a canonical actor name to its known synonyms, suspected origin country,
 * suspected state sponsor, and reference links. ONE upstream fetch of the
 * (multi-MB) threat-actor.json per refresh, normalized to snake_case,
 * dual-cached (Cache-API L1 + KV last-good with debounced writes) exactly like
 * supply-chain-attacks.ts / malicious-packages.ts. Public, key-gated read
 * (NOT admin-gated).
 *
 * Attribution: MISP Galaxy is published under CC0-1.0 / BSD-2-Clause (zero
 * licensing risk). We still echo `source`, `source_url`, and `license` in every
 * response so attribution is structural, and the UI credits + links back to the
 * MISP Galaxy project. Neutral framing only (no endorsement, no attribution
 * claim of our own — the data carries MISP's own confidence fields).
 *
 * Footguns honored:
 *   - ONE upstream subrequest (never fan out per-record). The whole cluster is
 *     fetched once, normalized once, and the FULL normalized set is cached in
 *     KV last-good so any ?q=/?limit= combo degrades gracefully on outage.
 *   - The response is CAPPED: ?q= search + ?country= filter + ?limit= (default
 *     300, max 1000) so we never ship the multi-thousand-entry raw cluster.
 *   - KV read only on miss; KV write debounced via shouldWriteLastGood in
 *     waitUntil. NOT added to the /api/v1/snapshot composer.
 *   - Enum-like value sets (the country facet) are derived at INGEST, never
 *     hardcoded — MISP adds new origin codes over time.
 *   - Every upstream field is treated as untrusted: strings are length-capped,
 *     arrays are coerced + item-capped, `country` is upper-cased + bounded, and
 *     non-http(s) ref URLs are still passed through to the client (the PAGE
 *     applies safeHref before rendering an href).
 */

const UPSTREAM = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json';
const SOURCE = 'MISP Galaxy';
const SOURCE_URL = 'https://github.com/MISP/misp-galaxy';
const DEFAULT_LICENSE = 'CC0-1.0 / BSD-2-Clause — MISP Galaxy threat-actor cluster (free to reuse with attribution).';

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — the cluster changes slowly (PRs, not realtime)
const KV_LAST_GOOD_KEY = 'misp-galaxy-actors:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 14 * 24 * 60 * 60;

const MAX_ACTORS = 6000; // defensive cap on the untrusted upstream array (cluster is ~5k)
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

interface GalaxyActor {
  value: string;
  uuid: string;
  synonyms: string[];
  country: string;
  state_sponsor: string;
  description: string;
  refs: string[];
}
interface GalaxyResponse {
  source: string;
  source_url: string;
  license: string;
  generated_at: string;
  /** Number of actors AFTER any query filter (i.e. actors.length). */
  count: number;
  /** Total actors in the cluster BEFORE filtering. */
  total: number;
  /** Country facet across the FULL cluster (never filtered) so UI chips stay stable. */
  countries: Record<string, number>;
  actors: GalaxyActor[];
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

function normalizeActor(raw: Record<string, unknown>): GalaxyActor {
  const meta = (raw.meta ?? {}) as Record<string, unknown>;
  const country = asString(meta.country, 16).toUpperCase();
  return {
    value: asString(raw.value, 300),
    uuid: asString(raw.uuid, 64),
    synonyms: asStringArray(meta.synonyms, 200, 200),
    country,
    state_sponsor: asString(meta['cfr-suspected-state-sponsor'], 120),
    description: asString(raw.description, 4000),
    refs: asStringArray(meta.refs, 100, 600),
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildCountries(actors: GalaxyActor[]): Record<string, number> {
  const countries: Record<string, number> = {};
  for (const a of actors) bump(countries, a.country);
  return countries;
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(full: GalaxyResponse, q: { search?: string; country?: string; limit: number }): GalaxyResponse {
  let actors = full.actors;
  if (q.country) {
    const c = q.country.toUpperCase();
    actors = actors.filter((a) => a.country === c);
  }
  if (q.search) {
    const needle = q.search.toLowerCase();
    actors = actors.filter(
      (a) =>
        a.value.toLowerCase().includes(needle) ||
        a.country.toLowerCase().includes(needle) ||
        a.state_sponsor.toLowerCase().includes(needle) ||
        a.synonyms.some((s) => s.toLowerCase().includes(needle))
    );
  }
  actors = actors.slice(0, q.limit);
  return { ...full, actors, count: actors.length };
}

export async function mispGalaxyActorsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const search = c.req.query('q')?.trim();
  const country = c.req.query('country')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const filterQ = { search, country, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://misp-galaxy-actors-cache.internal/v1?q=${encodeURIComponent(search ?? '')}&c=${encodeURIComponent(
      country ?? ''
    )}&l=${limit}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: GalaxyResponse | null = null;
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
      const data = (await res.json()) as { source?: string; values?: unknown };
      const rawValues = Array.isArray(data.values) ? data.values.slice(0, MAX_ACTORS) : [];
      const actors = rawValues.map((r) => normalizeActor((r ?? {}) as Record<string, unknown>)).filter((a) => a.value);
      full = {
        source: SOURCE,
        source_url: SOURCE_URL,
        license: DEFAULT_LICENSE,
        generated_at: new Date().toISOString(),
        count: actors.length,
        total: actors.length,
        countries: buildCountries(actors),
        actors,
      };
    } else {
      upstreamError = `upstream ${res.status}`;
    }
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    upstreamError = err instanceof Error ? err.message : 'fetch failed';
  }

  // Upstream failed → serve KV last-good (full cluster), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as GalaxyResponse;
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
        error: 'MISP Galaxy unavailable',
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

  // Refresh KV last-good with the FULL (unfiltered) cluster so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('misp-galaxy-actors')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
