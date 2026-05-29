import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * IOC Bloom Filter — fast membership testing for known IOCs.
 *
 * Bloom filters are probabilistic data structures that can quickly tell
 * if an element is NOT in a set (with zero false negatives) or MIGHT be
 * in a set (with tunable false positive rate).
 *
 * Use cases:
 *   - Quick "is this IP known bad?" checks without hitting D1
 *   - Client-side filtering of large IOC lists
 *   - Pre-filtering before expensive provider lookups
 *
 * GET  /api/v1/bloom/:type      → Get bloom filter for IOC type
 * POST /api/v1/bloom/check      → Check if IOC is in filter
 * GET  /api/v1/bloom/stats      → Filter statistics
 *
 * Implementation: Simple bit-array bloom filter stored in KV.
 * Refreshed hourly via cron.
 */

const FILTER_SIZES: Record<string, { bits: number; hashes: number }> = {
  ipv4: { bits: 100000, hashes: 3 },
  domain: { bits: 200000, hashes: 3 },
  url: { bits: 100000, hashes: 3 },
  hash: { bits: 300000, hashes: 4 },
};

const KV_PREFIX = 'bloom:';

/** Simple bloom filter implementation */
class BloomFilter {
  private bits: Uint8Array;
  private numHashes: number;
  private size: number;

  constructor(size: number, numHashes: number) {
    this.size = size;
    this.numHashes = numHashes;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  /** Hash function using FNV-1a-like approach */
  private hash(value: string, seed: number): number {
    let hash = 2166136261 ^ seed;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash % this.size;
  }

  /** Add an element to the filter */
  add(value: string): void {
    for (let i = 0; i < this.numHashes; i++) {
      const idx = this.hash(value, i);
      const byteIdx = idx >> 3;
      if (byteIdx < this.bits.length) {
        this.bits[byteIdx] = (this.bits[byteIdx] ?? 0) | (1 << (idx & 7));
      }
    }
  }

  /** Check if an element might be in the set */
  mightContain(value: string): boolean {
    for (let i = 0; i < this.numHashes; i++) {
      const idx = this.hash(value, i);
      const byteIdx = idx >> 3;
      const byte = this.bits[byteIdx];
      if (byte === undefined || byteIdx >= this.bits.length || !(byte & (1 << (idx & 7)))) {
        return false; // Definitely not in set
      }
    }
    return true; // Might be in set
  }

  /** Serialize to base64 for storage */
  toBase64(): string {
    let binary = '';
    for (let i = 0; i < this.bits.length; i++) {
      binary += String.fromCharCode(this.bits[i] ?? 0);
    }
    return btoa(binary);
  }

  /** Deserialize from base64 */
  static fromBase64(data: string, size: number, numHashes: number): BloomFilter {
    const filter = new BloomFilter(size, numHashes);
    const binary = atob(data);
    for (let i = 0; i < binary.length; i++) {
      filter.bits[i] = binary.charCodeAt(i);
    }
    return filter;
  }
}

/** Build a bloom filter from recent IOCs in the lifecycle table */
async function buildFilter(
  db: D1Database,
  type: string,
  config: { bits: number; hashes: number }
): Promise<{ filter: BloomFilter; count: number }> {
  const filter = new BloomFilter(config.bits, config.hashes);

  // Get recent IOCs (last 30 days)
  const rows = await db
    .prepare(
      `SELECT indicator FROM ioc_lifecycle
       WHERE indicator_type = ?
       AND last_seen > datetime('now', '-30 days')
       LIMIT 100000`
    )
    .bind(type)
    .all<{ indicator: string }>();

  for (const row of rows.results ?? []) {
    filter.add(row.indicator.toLowerCase());
  }

  return { filter, count: rows.results?.length ?? 0 };
}

/** GET /api/v1/bloom/:type — Get bloom filter */
export async function bloomFilterHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const type = c.req.param('type') ?? '';
  const config = FILTER_SIZES[type as keyof typeof FILTER_SIZES];

  if (!config) {
    return c.json(
      {
        error: 'Invalid type',
        valid_types: Object.keys(FILTER_SIZES),
      },
      400
    );
  }

  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const cacheKey = `${KV_PREFIX}${type}`;

  // Try cached filter
  const cached = await kv.get(cacheKey, 'json');
  if (cached && typeof cached === 'object' && 'data' in cached) {
    return c.json(
      {
        type,
        ...cached,
        cached: true,
      },
      200,
      {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'application/json',
      }
    );
  }

  // Build fresh filter
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not available' }, 503);

  const { filter, count } = await buildFilter(db, type, config);
  const data = filter.toBase64();

  // Cache in KV
  const entry = {
    data,
    count,
    config,
    built_at: new Date().toISOString(),
  };
  await kv.put(cacheKey, JSON.stringify(entry), { expirationTtl: 3600 });

  return c.json(
    {
      type,
      ...entry,
      cached: false,
    },
    200,
    {
      'Cache-Control': 'public, max-age=300',
    }
  );
}

/** POST /api/v1/bloom/check — Check if IOC is in filter */
export async function bloomCheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<{ indicator: string; type?: string }>();

  if (!body.indicator) {
    return c.json({ error: 'indicator is required' }, 400);
  }

  const indicator = body.indicator.toLowerCase().trim();

  // Auto-detect type if not provided
  let detectedType: string = body.type ?? 'domain';
  if (!body.type) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(indicator)) detectedType = 'ipv4';
    else if (/^[a-f0-9]{32,64}$/.test(indicator)) detectedType = 'hash';
    else if (/^https?:\/\//.test(indicator)) detectedType = 'url';
    else detectedType = 'domain';
  }

  const type = detectedType;
  const config = FILTER_SIZES[type as keyof typeof FILTER_SIZES];
  if (!config) {
    return c.json({ error: 'Invalid type' }, 400);
  }

  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const cacheKey = `${KV_PREFIX}${type}`;
  const cached = await kv.get(cacheKey, 'json');

  if (!cached || typeof cached !== 'object' || !('data' in cached)) {
    return c.json({
      indicator,
      type,
      found: null,
      message: 'Bloom filter not built yet. Call /api/v1/bloom/:type first.',
    });
  }

  const entry = cached as { data: string; config: { bits: number; hashes: number } };
  const filter = BloomFilter.fromBase64(entry.data, entry.config.bits, entry.config.hashes);
  const found = filter.mightContain(indicator);

  return c.json({
    indicator,
    type,
    found,
    confidence: found ? 'possible' : 'definite',
    message: found
      ? 'Indicator might be in the set (false positive possible)'
      : 'Indicator is definitely NOT in the set',
  });
}

/** GET /api/v1/bloom/stats — Filter statistics */
export async function bloomStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const stats: Record<string, unknown> = {};

  for (const type of Object.keys(FILTER_SIZES)) {
    const cacheKey = `${KV_PREFIX}${type}`;
    const cached = await kv.get(cacheKey, 'json');

    if (cached && typeof cached === 'object' && 'count' in cached) {
      const entry = cached as { count: number; built_at: string; config: { bits: number; hashes: number } };
      stats[type] = {
        ioc_count: entry.count,
        filter_size_bits: entry.config.bits,
        num_hashes: entry.config.hashes,
        built_at: entry.built_at,
        false_positive_rate: (1 - Math.exp((-entry.config.hashes * entry.count) / entry.config.bits)).toFixed(6),
      };
    } else {
      stats[type] = { status: 'not_built' };
    }
  }

  return c.json(
    {
      filters: stats,
      generated_at: new Date().toISOString(),
    },
    200,
    {
      'Cache-Control': 'public, max-age=60',
    }
  );
}
