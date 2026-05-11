import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Recent phishing URLs for /threatintel/phishing-urls.
 *
 * Source: OpenPhish public feed (https://openphish.com/feed.txt) — one URL
 * per line, refreshed every ~12h. Free tier exposes only the URL list, not
 * the brand classification (paid tier has it).
 *
 * We pair it with PhishTank's URL_FEED_NAME from their public CSV at
 * https://data.phishtank.com/data/online-valid.csv (free, no key) to get
 * verification status + brand context for the entries we can match.
 *
 * Cached 1h server-side — these feeds update on the order of hours.
 */

/** Exported so /api/v1/feed-status can read the same cached payload directly. */
export const PHISHING_URLS_CACHE_KEY = 'https://phishing-urls-cache.internal/v1';
const CACHE_KEY = PHISHING_URLS_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS = 100;

const OPENPHISH_URL = 'https://openphish.com/feed.txt';
const PHISHTANK_URL = 'https://data.phishtank.com/data/online-valid.csv';

export interface PhishingUrl {
  url: string;
  source: 'openphish' | 'phishtank';
  /** ISO 8601 timestamp when this URL was first seen by the source. */
  first_seen?: string;
  /** PhishTank-only: target brand (e.g. "Microsoft", "Coinbase"). */
  target?: string;
  /** PhishTank-only: verified by their reviewer pool. */
  verified?: boolean;
}

export interface PhishingUrlsResponse {
  generated_at: string;
  sources: { id: string; ok: boolean; count: number }[];
  total: number;
  urls: PhishingUrl[];
}

async function fetchText(url: string, fetchOpts?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain, text/csv' },
      cf: { cacheTtl: 1800, cacheEverything: true },
      ...fetchOpts,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse the PhishTank CSV — schema:
 *   phish_id, url, phish_detail_url, submission_time, verified,
 *   verification_time, online, target
 * We only keep `online == yes` AND `verified == yes`.
 */
function parsePhishtank(csv: string, max: number): PhishingUrl[] {
  const lines = csv.split('\n');
  const out: PhishingUrl[] = [];
  // Skip header row (lines[0]); CSV uses commas with no embedded quotes for our cols.
  for (let i = 1; i < lines.length && out.length < max; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 8) continue;
    const url = cols[1];
    const submission_time = cols[3];
    const verified = cols[4] === 'yes';
    const online = cols[6] === 'yes';
    const target = cols[7]?.trim();
    if (!url || !online || !verified) continue;
    out.push({
      url,
      source: 'phishtank',
      first_seen: submission_time,
      target: target && target !== 'Other' ? target : undefined,
      verified: true,
    });
  }
  return out;
}

function parseOpenphish(text: string, max: number): PhishingUrl[] {
  const out: PhishingUrl[] = [];
  for (const line of text.split('\n')) {
    const url = line.trim();
    if (!url || !url.startsWith('http')) continue;
    out.push({ url, source: 'openphish' });
    if (out.length >= max) break;
  }
  return out;
}

export async function fetchPhishingUrls(): Promise<PhishingUrlsResponse> {
  const [opText, ptText] = await Promise.all([fetchText(OPENPHISH_URL), fetchText(PHISHTANK_URL)]);

  const ptUrls = ptText ? parsePhishtank(ptText, MAX_ITEMS) : [];
  const opUrls = opText ? parseOpenphish(opText, MAX_ITEMS) : [];

  // Dedup: PhishTank entries (which have richer metadata) win over OpenPhish.
  const seen = new Set(ptUrls.map((u) => u.url));
  const merged: PhishingUrl[] = [...ptUrls];
  for (const u of opUrls) {
    if (seen.has(u.url)) continue;
    merged.push(u);
    seen.add(u.url);
  }

  return {
    generated_at: new Date().toISOString(),
    sources: [
      { id: 'phishtank', ok: ptText !== null, count: ptUrls.length },
      { id: 'openphish', ok: opText !== null, count: opUrls.length },
    ],
    total: merged.length,
    urls: merged.slice(0, MAX_ITEMS),
  };
}

export async function phishingUrlsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await fetchPhishingUrls();
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
