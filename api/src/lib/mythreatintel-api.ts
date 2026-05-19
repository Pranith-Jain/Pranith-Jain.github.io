/**
 * Typed gateway for the official MyThreatIntel REST API
 * (https://mythreatintel.com/api/).
 *
 * One upstream endpoint, multiplexed by `?source=`:
 *
 *   GET https://mythreatintel.com/api/?source=<src>&q=<text>&limit=<n>
 *   Authorization: Bearer <MYTHREATINTEL_API_TOKEN>
 *
 * Envelope (all sources):
 *   { "status": "success",
 *     "metadata": { "total", "count", "limit", "offset" },
 *     "data": [ ... ] }
 *
 * This is the single auth + cache surface. The Bearer token is a Worker
 * secret and is injected here server-side — it never reaches the browser.
 * `fetchMtiSource` NEVER throws and NEVER returns a partial: on a missing
 * token, non-2xx, timeout, or parse failure it returns `{ ok: false }` so
 * in-process consumers (live-iocs, ransomware-recent) can fall back to the
 * existing t.me/s/mythreatintel scraper without special-casing errors.
 *
 * The per-source `data[]` shapes below mirror the documented examples. They
 * are intentionally permissive (every field optional) — the upstream is a
 * third party and the consumers render defensively.
 */

import type { Env } from '../env';

const API_BASE = 'https://mythreatintel.com/api/';
const FETCH_TIMEOUT_MS = 12_000;

/** Canonical `?source=` values. Matches the documented curl examples. */
export const MTI_SOURCES = [
  'cve',
  'malware',
  'iocs',
  'ransomware',
  'onions',
  'markets',
  'leaks',
  'groups',
  'events',
] as const;

export type MtiSource = (typeof MTI_SOURCES)[number];

export function isMtiSource(s: string): s is MtiSource {
  return (MTI_SOURCES as readonly string[]).includes(s);
}

/** Per-source edge-cache TTL (seconds). IOC/malware churn fastest. */
export const MTI_TTL: Record<MtiSource, number> = {
  iocs: 30 * 60,
  malware: 30 * 60,
  cve: 60 * 60,
  ransomware: 60 * 60,
  events: 60 * 60,
  leaks: 60 * 60,
  groups: 6 * 60 * 60,
  markets: 6 * 60 * 60,
  onions: 6 * 60 * 60,
};

// ─── Documented per-source record shapes (all fields optional) ─────────────

export interface MtiIoc {
  date?: string;
  sha256?: string;
  file_name?: string;
  /** Malware family / detection signature, when present. */
  signature?: string;
  tags?: string;
  type?: string;
  _source?: string;
  dataType?: string;
}

export interface MtiMalware {
  date?: string;
  sha256?: string;
  file_name?: string;
  signature?: string;
  tags?: string;
  type?: string;
  _source?: string;
  dataType?: string;
}

export interface MtiCveRecord {
  cve?: string;
  published?: string;
  severity?: string;
  score?: string;
  cvss_version?: string;
  description?: string;
  url?: string;
  type?: string;
  _source?: string;
}

export interface MtiLeak {
  name?: string;
  url?: string;
  size?: string;
  date?: string;
  type?: string;
  _source?: string;
}

export interface MtiGroup {
  actor?: string;
  origin?: string;
  motivation?: string;
  target_sectors?: string[];
  type?: string;
  _source?: string;
}

export interface MtiRansomwareOp {
  group?: string;
  onion?: string;
  status?: string;
  page_title?: string;
  last_visit?: string;
  _source?: string;
}

export interface MtiMarket {
  market?: string;
  onion?: string;
  status?: string;
  page_title?: string;
  last_visit?: string;
  type?: string;
  _source?: string;
}

export interface MtiOnion {
  onion?: string;
  status?: string;
  page_title?: string;
  last_visit?: string;
  type?: string;
  _source?: string;
}

export interface MtiEvent {
  date?: string;
  victim?: string;
  gang?: string;
  description?: string;
  type?: string;
  _source?: string;
}

/** Discriminated by call site — consumers cast `items` to the right shape. */
export type MtiRecord =
  | MtiIoc
  | MtiMalware
  | MtiCveRecord
  | MtiLeak
  | MtiGroup
  | MtiRansomwareOp
  | MtiMarket
  | MtiOnion
  | MtiEvent;

export interface MtiResult {
  /** False on missing token / upstream failure — callers then fall back. */
  ok: boolean;
  /** Records in this response (`metadata.count`). */
  count: number;
  /** Total matching records upstream (`metadata.total`). */
  total: number;
  items: MtiRecord[];
}

const EMPTY: MtiResult = { ok: false, count: 0, total: 0, items: [] };

interface MtiEnvelope {
  status?: string;
  metadata?: { total?: number; count?: number; limit?: number; offset?: number };
  data?: unknown;
}

/** Edge-cache key. Exported so feed-status can probe the exact cached body. */
export function mtiCacheKey(source: MtiSource, q: string, limit: number): string {
  return `https://mti-api-cache.internal/v1/${source}/${encodeURIComponent(q)}/${limit}`;
}

export interface MtiQuery {
  /** Free-text search across all fields (`?q=`). */
  q?: string;
  /** 1–500. Upstream default 100. */
  limit?: number;
}

/**
 * Fetch one MyThreatIntel source through the shared edge cache. Never
 * throws. Returns `ok:false` (and empty data) when the token is unset or
 * the upstream is unhealthy, so callers degrade by falling back rather than
 * by catching.
 */
export async function fetchMtiSource(env: Env, source: MtiSource, query: MtiQuery = {}): Promise<MtiResult> {
  const token = env.MYTHREATINTEL_API_TOKEN;
  if (!token) return EMPTY;

  const q = (query.q ?? '').trim();
  const limit = Math.min(500, Math.max(1, Math.trunc(query.limit ?? 100)));

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(mtiCacheKey(source, q, limit));
  const cached = await cache.match(cacheReq);
  if (cached) {
    try {
      return (await cached.json()) as MtiResult;
    } catch {
      /* fall through to a fresh fetch */
    }
  }

  const url = new URL(API_BASE);
  url.searchParams.set('source', source);
  if (q) url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));

  let env_envelope: MtiEnvelope;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (read-only)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return EMPTY;
    env_envelope = (await res.json()) as MtiEnvelope;
  } catch {
    return EMPTY;
  }

  const data = Array.isArray(env_envelope.data) ? (env_envelope.data as MtiRecord[]) : [];
  const result: MtiResult = {
    ok: true,
    count: typeof env_envelope.metadata?.count === 'number' ? env_envelope.metadata.count : data.length,
    total: typeof env_envelope.metadata?.total === 'number' ? env_envelope.metadata.total : data.length,
    items: data,
  };

  // Cache only non-empty successes so a transient empty isn't pinned.
  if (result.items.length > 0) {
    const toCache = new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${MTI_TTL[source]}`,
      },
    });
    await cache.put(cacheReq, toCache);
  }

  return result;
}
