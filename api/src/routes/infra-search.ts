import type { Context } from 'hono';
import type { Env } from '../env';
import { parseInfraQuery, buildOverpassQuery, nominatimGeocode, quickBbox } from '../lib/infra-parser';

/**
 * Infrastructure search — OSINT for physical-world assets via OpenStreetMap.
 *
 *   POST /api/v1/infra-search   { query: string }
 *   GET  /api/v1/infra-search?q=<query>
 *
 * Inspired by ni5arga/sightline (481 stars, MIT). Uses Overpass API (free, no auth)
 * + Nominatim geocoding (free, 1 req/s). Queries OSM for 200+ infrastructure types.
 */

const CACHE_TTL_SECONDS = 15 * 60;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 200;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface InfraResult {
  id: string;
  type: 'node' | 'way' | 'relation';
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  category: string;
}

interface InfraSearchResponse {
  query: string;
  parsed: {
    types: string[];
    region: string;
    country: string;
    near: string;
    radiusKm: number;
  };
  bbox: [number, number, number, number] | null;
  total: number;
  results: InfraResult[];
  generated_at: string;
  cached: boolean;
}

async function parseBody(c: Context<{ Bindings: Env }>): Promise<string> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('json')) {
    const body = (await c.req.json()) as { query?: string };
    return body.query ?? '';
  }
  return c.req.query('q') ?? '';
}

export async function infraSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (await parseBody(c)).trim();
  if (!query) return c.json({ error: 'missing query' }, 400);
  if (query.length > 300) return c.json({ error: 'query too long (max 300 chars)' }, 400);

  // Edge cache
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://infra-search.internal/v1?q=${encodeURIComponent(query.toLowerCase())}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  // Parse query
  const parsed = parseInfraQuery(query);
  if (parsed.types.length === 0) {
    return c.json({ error: 'could not identify infrastructure type from query', query, parsed }, 400);
  }

  // Resolve bbox — try quick lookup first, then Nominatim
  let bbox = quickBbox(parsed.region, parsed.country);
  if (!bbox && parsed.near) {
    bbox = await nominatimGeocode(parsed.near);
  }
  if (!bbox && parsed.region) {
    bbox = await nominatimGeocode(parsed.region);
  }
  if (!bbox && parsed.country) {
    bbox = await nominatimGeocode(parsed.country);
  }
  if (!bbox) {
    return c.json(
      {
        error: 'could not resolve location — try adding a country or region (e.g. "power plants in india")',
        query,
        parsed,
      },
      400
    );
  }
  parsed.bbox = bbox;

  // Build and execute Overpass query
  const overpassQl = buildOverpassQuery(parsed);
  if (!overpassQl) {
    return c.json({ error: 'failed to build Overpass query' }, 500);
  }

  let overpassData: { elements?: OverpassElement[] } = {};
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQl)}`,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Overpass API ${r.status}`);
    overpassData = await r.json();
  } catch (err) {
    return c.json({ error: `Overpass API error: ${err instanceof Error ? err.message : 'unknown'}` }, 502);
  }

  // Transform results
  const results: InfraResult[] = (overpassData.elements ?? []).slice(0, MAX_RESULTS).map((el) => {
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lon = el.lon ?? el.center?.lon ?? 0;
    const name = el.tags?.name ?? el.tags?.['name:en'] ?? `${parsed.types[0]?.label ?? 'Unknown'}`;
    return {
      id: `${el.type}/${el.id}`,
      type: el.type as InfraResult['type'],
      name,
      lat,
      lon,
      tags: el.tags ?? {},
      category: parsed.types[0]?.category ?? 'Unknown',
    };
  });

  const body: InfraSearchResponse = {
    query,
    parsed: {
      types: parsed.types.map((t) => t.key),
      region: parsed.region,
      country: parsed.country,
      near: parsed.near,
      radiusKm: parsed.radiusKm,
    },
    bbox,
    total: results.length,
    results,
    generated_at: new Date().toISOString(),
    cached: false,
  };

  // Cache
  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}
