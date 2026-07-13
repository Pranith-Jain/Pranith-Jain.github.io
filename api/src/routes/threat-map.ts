import type { Context } from 'hono';
import type { Env } from '../env';
import {
  parseUrlhaus,
  parseThreatfox,
  parseIpsum,
  parsePlainTextIps,
  parseMalwarebazaar,
} from '../lib/ioc-feed-parsers';
import { trackEvent, visitorCountry } from '../lib/analytics';

/**
 * Cyber Threat Map
 *
 * Aggregates current malicious infrastructure indicators across IOC types:
 *   - IPs from URLhaus, ThreatFox, Ipsum, CINS Army, Bitwire — each
 *     batch-geolocated via ip-api.com and aggregated by country for the map.
 *   - URLs from URLhaus + ThreatFox.
 *   - Domains from ThreatFox.
 *   - File hashes from MalwareBazaar + ThreatFox.
 *
 * Cached 1h in Cache API so each visitor doesn't re-trigger the geolocation.
 */

/** Exported so /api/v1/snapshot can read the same cached payload directly. */
// v5: bumped MAX_IPS 500→1000 + per-source slice caps so the map shows
// real volume per feed instead of every source converging on ~80 entries
// (which was a downstream effect of the conservative caps below).
export const THREAT_MAP_CACHE_KEY = 'https://threat-map-cache.internal/v5-1k';
const CACHE_KEY = THREAT_MAP_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
// ip-api.com batch is 100; we do up to 10 batches (still well under the
// 50-subrequest-per-invocation Workers cap).
const MAX_IPS = 1000;
const MAX_PER_TYPE = 60; // per non-IP IOC type (urls / domains / hashes)
const FETCH_TIMEOUT_MS = 12_000;

interface CountryAgg {
  countryCode: string;
  country: string;
  count: number;
  sources: Record<string, number>;
  sample_ips: string[];
}

interface IocSample {
  value: string;
  source: string;
  context?: string;
  timestamp?: string;
}

interface IocTypeBucket {
  type: 'url' | 'domain' | 'hash';
  count: number;
  source_counts: Record<string, number>;
  recent: IocSample[];
}

interface ThreatMapResponse {
  generated_at: string;
  total_ips: number;
  countries: CountryAgg[];
  samples: Array<{ ip: string; country: string; countryCode: string; sources: string[] }>;
  source_counts: Record<string, number>;
  // New in v3: non-IP IOC types from the same feeds
  iocs_by_type: IocTypeBucket[];
}

interface IpApiBatchResult {
  query?: string;
  status?: string;
  country?: string;
  countryCode?: string;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (res.status === 429) {
      // Aggregator — partial degradation is acceptable; just surface to ops.
      console.warn(`threat-map: 429 from ${new URL(url).host}`);
      return null;
    }
    if (!res.ok) return null;
    return await res.text();
  } catch (_catchErr) {
    console.error('fetchText failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

async function geolocateBatch(ips: string[]): Promise<Map<string, { country: string; countryCode: string }>> {
  const out = new Map<string, { country: string; countryCode: string }>();
  for (let i = 0; i < ips.length; i += 100) {
    const batch = ips.slice(i, i + 100);
    try {
      const res = await fetch('http://ip-api.com/batch?fields=query,status,country,countryCode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch.map((q) => ({ query: q }))),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 429) {
        // ip-api.com free tier is 45 req/min from a single IP; the
        // Worker shares one egress IP per POP so we can hit this
        // bursting on /api/v1/threat-map. Skip the remaining batches
        // — partial coverage is better than blocking forever.
        console.warn(`threat-map: ip-api.com 429 — skipping remaining geo batches`);
        break;
      }
      if (!res.ok) continue;
      const data = (await res.json()) as IpApiBatchResult[];
      for (const row of data) {
        if (row.status === 'success' && row.query && row.countryCode && row.country) {
          out.set(row.query, { country: row.country, countryCode: row.countryCode });
        }
      }
    } catch (_catchErr) {
      console.error('geolocateBatch failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* skip batch on failure */
    }
  }
  return out;
}

/**
 * Pure-data fetcher exposed for /api/v1/snapshot. Same body the HTTP handler
 * returns, just without the Response/cache wrapping so the snapshot endpoint
 * can compose it without a worker-internal HTTP call.
 */
export async function fetchThreatMap(): Promise<ThreatMapResponse> {
  // Fan out to all IOC feeds we have access to, in parallel.
  const [urlhausText, threatfoxText, ipsumText, cinsText, bitwireText, malwarebazaarText] = await Promise.all([
    fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/'),
    fetchText('https://threatfox.abuse.ch/export/csv/recent/'),
    fetchText('https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt'),
    fetchText('https://cinsscore.com/list/ci-badguys.txt'),
    fetchText('https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/outbound.txt'),
    fetchText('https://bazaar.abuse.ch/export/csv/recent/'),
  ]);

  // Build a map of IP → set of sources, capped at MAX_IPS unique IPs.
  const ipSources = new Map<string, Set<string>>();
  const addIp = (ip: string, source: string) => {
    if (ipSources.size >= MAX_IPS && !ipSources.has(ip)) return;
    if (!ipSources.has(ip)) ipSources.set(ip, new Set());
    ipSources.get(ip)!.add(source);
  };

  if (urlhausText) {
    // URLhaus entries are URLs; extract host and only add if it parses as IPv4.
    for (const e of parseUrlhaus(urlhausText, 600)) {
      if (e.type !== 'url') continue;
      try {
        const host = new URL(e.value).hostname;
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) addIp(host, 'urlhaus');
      } catch (_catchErr) {
        console.error('fetchThreatMap failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* skip malformed url */
      }
    }
  }
  if (threatfoxText) {
    for (const e of parseThreatfox(threatfoxText, 600)) {
      if (e.type === 'ipv4') addIp(e.value, 'threatfox');
    }
  }
  // Ipsum is consensus-scored, so the IPs here have hits from 3+ source lists.
  if (ipsumText) {
    for (const e of parseIpsum(ipsumText, 250)) addIp(e.value, 'ipsum');
  }
  if (cinsText) {
    for (const e of parsePlainTextIps(cinsText, 250)) addIp(e.value, 'cinsarmy');
  }
  if (bitwireText) {
    for (const e of parsePlainTextIps(bitwireText, 250)) addIp(e.value, 'bitwire');
  }

  const ips = Array.from(ipSources.keys());
  const geo = await geolocateBatch(ips);

  // Aggregate per country
  const byCountry = new Map<string, CountryAgg>();
  const samples: ThreatMapResponse['samples'] = [];
  const sourceCounts: Record<string, number> = {
    urlhaus: 0,
    threatfox: 0,
    ipsum: 0,
    cinsarmy: 0,
    bitwire: 0,
  };

  for (const ip of ips) {
    const sourcesArr = Array.from(ipSources.get(ip) ?? []);
    for (const s of sourcesArr) sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    const g = geo.get(ip);
    if (!g) continue;
    if (!byCountry.has(g.countryCode)) {
      byCountry.set(g.countryCode, {
        countryCode: g.countryCode,
        country: g.country,
        count: 0,
        sources: {},
        sample_ips: [],
      });
    }
    const agg = byCountry.get(g.countryCode)!;
    agg.count += 1;
    for (const s of sourcesArr) agg.sources[s] = (agg.sources[s] ?? 0) + 1;
    if (agg.sample_ips.length < 5) agg.sample_ips.push(ip);
    if (samples.length < 60) samples.push({ ip, country: g.country, countryCode: g.countryCode, sources: sourcesArr });
  }

  const countries = Array.from(byCountry.values()).sort((a, b) => b.count - a.count);

  // ─── Non-IP IOC types ──────────────────────────────────────────────────────
  // Same upstream feeds, but extract URLs / domains / hashes so the map page
  // shows a complete current-threat picture, not just IPs.
  const urlBucket: IocTypeBucket = { type: 'url', count: 0, source_counts: {}, recent: [] };
  const domainBucket: IocTypeBucket = { type: 'domain', count: 0, source_counts: {}, recent: [] };
  const hashBucket: IocTypeBucket = { type: 'hash', count: 0, source_counts: {}, recent: [] };

  const seen = { url: new Set<string>(), domain: new Set<string>(), hash: new Set<string>() };
  const pushSample = (bucket: IocTypeBucket, sample: IocSample) => {
    const set = seen[bucket.type];
    if (set.has(sample.value)) return;
    set.add(sample.value);
    bucket.count += 1;
    bucket.source_counts[sample.source] = (bucket.source_counts[sample.source] ?? 0) + 1;
    if (bucket.recent.length < MAX_PER_TYPE) bucket.recent.push(sample);
  };

  if (urlhausText) {
    for (const e of parseUrlhaus(urlhausText, MAX_PER_TYPE * 2)) {
      if (e.type !== 'url') continue;
      pushSample(urlBucket, { value: e.value, source: 'urlhaus', context: e.context, timestamp: e.timestamp });
    }
  }
  if (threatfoxText) {
    for (const e of parseThreatfox(threatfoxText, MAX_PER_TYPE * 4)) {
      if (e.type === 'url') {
        pushSample(urlBucket, { value: e.value, source: 'threatfox', context: e.context, timestamp: e.timestamp });
      } else if (e.type === 'domain') {
        pushSample(domainBucket, { value: e.value, source: 'threatfox', context: e.context, timestamp: e.timestamp });
      } else if (e.type === 'hash') {
        pushSample(hashBucket, { value: e.value, source: 'threatfox', context: e.context, timestamp: e.timestamp });
      }
    }
  }
  if (malwarebazaarText) {
    for (const e of parseMalwarebazaar(malwarebazaarText, MAX_PER_TYPE * 2)) {
      if (e.type === 'hash') {
        pushSample(hashBucket, { value: e.value, source: 'malwarebazaar', context: e.context, timestamp: e.timestamp });
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    total_ips: ips.length,
    countries,
    samples,
    source_counts: sourceCounts,
    iocs_by_type: [urlBucket, domainBucket, hashBucket].filter((b) => b.count > 0),
  };
}

export async function threatMapHandler(c: Context<{ Bindings: Env }>) {
  const cache = caches.default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) {
    trackEvent(c.env, 'threat_map_fetch', {
      blobs: ['hit'],
      indexes: [visitorCountry(c.req.raw)],
    });
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 4}`,
        'x-cache': 'HIT',
      },
    });
  }

  const body = await fetchThreatMap();
  const json = JSON.stringify(body);
  const response = new Response(json, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 4}`,
      'x-cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  trackEvent(c.env, 'threat_map_fetch', {
    blobs: ['miss'],
    doubles: [body.total_ips, body.countries.length],
    indexes: [visitorCountry(c.req.raw)],
  });
  return response;
}
