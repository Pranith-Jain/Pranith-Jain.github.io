import type { Context } from 'hono';
import type { Env } from '../env';
import { parseFeodo, parseUrlhaus, parseThreatfox, parseIpsum, parsePlainTextIps } from '../lib/ioc-feed-parsers';

/**
 * Cyber Threat Map
 *
 * Aggregates current malicious-IP indicators from Feodo Tracker, URLhaus, and
 * ThreatFox into a per-country count, then batch-geolocates via ip-api.com
 * (free, no key, 100 IPs / call, 15 calls / minute / IP).
 *
 * Cached 1h in Cache API so each visitor doesn't re-trigger the geolocation.
 */

const CACHE_KEY = 'https://threat-map-cache.internal/v2-6sources';
const CACHE_TTL_SECONDS = 3600;
const MAX_IPS = 200; // ip-api.com batch is 100; we'll do 2 batches max
const FETCH_TIMEOUT_MS = 12_000;

interface CountryAgg {
  countryCode: string;
  country: string;
  count: number;
  sources: Record<string, number>;
  sample_ips: string[];
}

interface ThreatMapResponse {
  generated_at: string;
  total_ips: number;
  countries: CountryAgg[];
  samples: Array<{ ip: string; country: string; countryCode: string; sources: string[] }>;
  source_counts: Record<string, number>;
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
    if (!res.ok) return null;
    return await res.text();
  } catch {
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
      if (!res.ok) continue;
      const data = (await res.json()) as IpApiBatchResult[];
      for (const row of data) {
        if (row.status === 'success' && row.query && row.countryCode && row.country) {
          out.set(row.query, { country: row.country, countryCode: row.countryCode });
        }
      }
    } catch {
      /* skip batch on failure */
    }
  }
  return out;
}

export async function threatMapHandler(c: Context<{ Bindings: Env }>) {
  // Try cache first
  const cache = caches.default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'x-cache': 'HIT',
      },
    });
  }

  // Fan out to all malicious-IP feeds we have access to, in parallel.
  const [feodoText, urlhausText, threatfoxText, ipsumText, cinsText, bitwireText] = await Promise.all([
    fetchText('https://feodotracker.abuse.ch/downloads/ipblocklist.csv'),
    fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/'),
    fetchText('https://threatfox.abuse.ch/export/csv/recent/'),
    fetchText('https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt'),
    fetchText('https://cinsscore.com/list/ci-badguys.txt'),
    fetchText('https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/outbound.txt'),
  ]);

  // Build a map of IP → set of sources, capped at MAX_IPS unique IPs.
  const ipSources = new Map<string, Set<string>>();
  const addIp = (ip: string, source: string) => {
    if (ipSources.size >= MAX_IPS && !ipSources.has(ip)) return;
    if (!ipSources.has(ip)) ipSources.set(ip, new Set());
    ipSources.get(ip)!.add(source);
  };

  if (feodoText) {
    for (const e of parseFeodo(feodoText, 80)) {
      if (e.type === 'ipv4') addIp(e.value, 'feodo');
    }
  }
  if (urlhausText) {
    // URLhaus entries are URLs; extract host and only add if it parses as IPv4.
    for (const e of parseUrlhaus(urlhausText, 200)) {
      if (e.type !== 'url') continue;
      try {
        const host = new URL(e.value).hostname;
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) addIp(host, 'urlhaus');
      } catch {
        /* skip malformed url */
      }
    }
  }
  if (threatfoxText) {
    for (const e of parseThreatfox(threatfoxText, 200)) {
      if (e.type === 'ipv4') addIp(e.value, 'threatfox');
    }
  }
  // Ipsum is consensus-scored, so the IPs here have hits from 3+ source lists.
  if (ipsumText) {
    for (const e of parseIpsum(ipsumText, 80)) addIp(e.value, 'ipsum');
  }
  if (cinsText) {
    for (const e of parsePlainTextIps(cinsText, 80)) addIp(e.value, 'cinsarmy');
  }
  if (bitwireText) {
    for (const e of parsePlainTextIps(bitwireText, 80)) addIp(e.value, 'bitwire');
  }

  const ips = Array.from(ipSources.keys());
  const geo = await geolocateBatch(ips);

  // Aggregate per country
  const byCountry = new Map<string, CountryAgg>();
  const samples: ThreatMapResponse['samples'] = [];
  const sourceCounts: Record<string, number> = {
    feodo: 0,
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

  const body: ThreatMapResponse = {
    generated_at: new Date().toISOString(),
    total_ips: ips.length,
    countries,
    samples,
    source_counts: sourceCounts,
  };

  const json = JSON.stringify(body);
  const response = new Response(json, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'x-cache': 'MISS',
    },
  });
  // Cache async; don't block the response on the put
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
