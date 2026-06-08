import type { Context } from 'hono';
import type { Env } from '../env';
import { listBriefings } from '../lib/briefing-builder';

/* ─── Cache keys (all warmed by hourly cron) ────────────────────────────── */

const GLOBAL_PULSE_CACHE = 'https://global-pulse-cache.internal/v14-bugfix';
const CACHE_TTL = 300;

const CACHE_KEYS = {
  threatMap: 'https://threat-map-cache.internal/v5-1k',
  reddit: 'https://reddit-feed-cache.internal/v11-raw',
  telegram: 'https://telegram-feed-cache.internal/v10-7d-50pc',
  xFeed: 'https://x-feed-cache.internal/v7-25pc',
  cryptoScam: 'https://crypto-scam-feed-cache.internal/v1',
  breach: 'https://breach-cache.internal/v6-hibp-only',
  liveIocs: 'https://live-iocs-cache.internal/v13-freshness-filter',
  deepdarkcti: 'https://deepdarkcti-cache.internal/v1',
  onionWatch: 'https://onion-watch-cache.internal/v2',
  stealerForum: 'https://stealer-forum-intel-cache.internal/v13-no-debug',
  phishing: 'https://phishing-urls-cache.internal/v11-500',
  malware: 'https://malware-samples-cache.internal/v3-500',
  cveRecent: 'https://cve-recent-cache.internal/v10-750-paged',
  ransomware: 'https://ransomware-recent-cache.internal/v11-tz-abbrev-fix',
  detections: 'https://detections-cache.internal/v1',
  cybercrime: 'https://cybercrime-cache.internal/v2-500',
  writeups: 'https://writeups-cache.internal/v11-7d-window',
  usgs: 'https://usgs-earthquake-cache.internal/v1',
} as const;

/* ─── Types ─────────────────────────────────────────────────────────────── */

type PulseKind =
  | 'earthquake'
  | 'ioc_activity'
  | 'geopolitical'
  | 'tech_news'
  | 'reddit'
  | 'telegram'
  | 'x_feed'
  | 'scam'
  | 'breach'
  | 'briefing'
  | 'cyber_attack'
  | 'aircraft'
  | 'war_room'
  | 'c2_tracker'
  | 'cisa_advisory'
  | 'blocklist'
  | 'darkweb'
  | 'infostealer'
  | 'phishing'
  | 'malware'
  | 'ransomware'
  | 'detection'
  | 'cybercrime'
  | 'research'
  | 'cve';

interface PulseEvent {
  id: string;
  kind: PulseKind;
  title: string;
  description: string;
  lat: number;
  lng: number;
  magnitude?: number;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  url?: string;
  country?: string;
}

interface GlobalPulseResponse {
  generated_at: string;
  total_events: number;
  events: PulseEvent[];
  layers: Record<PulseKind, number>;
}

/* ─── Cache reader ──────────────────────────────────────────────────────── */

async function readCache<T>(cache: Cache, key: string): Promise<T | null> {
  try {
    const hit = await cache.match(new Request(key));
    if (!hit) return null;
    return (await hit.json()) as T;
  } catch {
    return null;
  }
}

async function readKvJson<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  try {
    if (!kv) return null;
    const val = await kv.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

/* ─── Coordinate lookup for IOC activity ────────────────────────────────── */

const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [37.09, -95.71],
  RU: [61.52, 105.32],
  CN: [35.86, 104.19],
  IR: [32.43, 53.68],
  KP: [40.34, 127.51],
  KR: [35.91, 127.77],
  DE: [51.17, 10.45],
  GB: [55.38, -3.44],
  FR: [46.6, 1.89],
  NL: [52.13, 5.29],
  UA: [48.38, 31.17],
  IN: [20.59, 78.96],
  BR: [-14.24, -51.93],
  JP: [36.2, 138.25],
  AU: [-25.27, 133.78],
  CA: [56.13, -106.35],
  SG: [1.35, 103.82],
  HK: [22.32, 114.17],
  TW: [23.7, 121.0],
  IL: [31.05, 34.85],
  TR: [38.96, 35.24],
  PK: [30.38, 69.35],
  VN: [14.06, 108.28],
  TH: [15.87, 100.99],
  ID: [-0.79, 113.92],
  PH: [12.88, 121.77],
  MX: [23.63, -102.55],
  SA: [23.89, 45.08],
  AE: [23.42, 53.85],
  ZA: [-30.56, 22.94],
  EG: [26.82, 30.8],
  NG: [9.08, 8.68],
};

/* ─── Converters (cached data → PulseEvent[]) ───────────────────────────── */

function iocFromThreatMap(data: {
  countries: Array<{ countryCode: string; country: string; count: number; sources: Record<string, number> }>;
}): PulseEvent[] {
  return (data.countries ?? [])
    .filter((c) => c.count > 0)
    .map((c) => ({
      id: `ioc-${c.countryCode}`,
      kind: 'ioc_activity' as const,
      title: `${c.country} — ${c.count} malicious IPs`,
      description: `Threat activity from ${Object.keys(c.sources).length} feed sources`,
      lat: COUNTRY_COORDS[c.countryCode]?.[0] ?? 0,
      lng: COUNTRY_COORDS[c.countryCode]?.[1] ?? 0,
      timestamp: new Date().toISOString(),
      severity:
        c.count > 1000
          ? ('critical' as const)
          : c.count > 500
            ? ('high' as const)
            : c.count > 100
              ? ('medium' as const)
              : ('low' as const),
      source: 'threat-map',
      country: c.country,
    }));
}

function fromReddit(data: {
  items?: Array<{ title: string; sub: string; sub_topic: string; link: string; pub_date: string }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 40).map((i) => ({
    id: `reddit-${i.link.slice(-20)}`,
    kind: 'reddit' as const,
    title: i.title,
    description: `r/${i.sub} · ${i.sub_topic}`,
    lat: 0,
    lng: 0,
    timestamp: i.pub_date || new Date().toISOString(),
    severity: 'low' as const,
    source: `r/${i.sub}`,
    url: i.link,
  }));
}

function fromTelegram(data: {
  items?: Array<{ text: string; channel_name: string; channel_topic: string; permalink: string; datetime: string }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 40).map((i) => ({
    id: `tg-${i.permalink.slice(-20)}`,
    kind: 'telegram' as const,
    title: i.text.slice(0, 120) || `Message from ${i.channel_name}`,
    description: `${i.channel_name} · ${i.channel_topic}`,
    lat: 0,
    lng: 0,
    timestamp: i.datetime || new Date().toISOString(),
    severity: 'low' as const,
    source: `TG: ${i.channel_name}`,
    url: i.permalink,
  }));
}

function fromXFeed(data: {
  items?: Array<{
    text: string;
    handle_name: string;
    platform: string;
    handle_topic: string;
    link: string;
    pub_date: string;
  }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 40).map((i) => ({
    id: `x-${i.link.slice(-20)}`,
    kind: 'x_feed' as const,
    title: i.text.slice(0, 120) || `Post by ${i.handle_name}`,
    description: `${i.handle_name} · ${i.platform} · ${i.handle_topic}`,
    lat: 0,
    lng: 0,
    timestamp: i.pub_date || new Date().toISOString(),
    severity: 'low' as const,
    source: `${i.platform}: ${i.handle_name}`,
    url: i.link,
  }));
}

function fromScam(data: { items?: Array<{ domain: string; tld: string }>; generated_at?: string }): PulseEvent[] {
  return (data.items ?? []).slice(0, 30).map((i, idx) => ({
    id: `scam-${i.domain}-${idx}`,
    kind: 'scam' as const,
    title: i.domain,
    description: `Crypto scam/phishing domain · ${i.tld}`,
    lat: 0,
    lng: 0,
    timestamp: data.generated_at || new Date().toISOString(),
    severity: 'medium' as const,
    source: 'Crypto Scam Feed',
    url: `https://${i.domain}`,
  }));
}

function fromBreaches(data: {
  breaches?: Array<{ name: string; title: string; pwn_count?: number; added_date?: string; breach_date?: string }>;
}): PulseEvent[] {
  return (data.breaches ?? []).slice(0, 30).map((b) => ({
    id: `breach-${b.name}`,
    kind: 'breach' as const,
    title: b.title,
    description: `${(b.pwn_count ?? 0).toLocaleString()} accounts breached`,
    lat: 0,
    lng: 0,
    timestamp: b.added_date || b.breach_date || new Date().toISOString(),
    severity:
      (b.pwn_count ?? 0) > 10_000_000
        ? ('critical' as const)
        : (b.pwn_count ?? 0) > 1_000_000
          ? ('high' as const)
          : ('medium' as const),
    source: 'HIBP',
    url: `https://haveibeenpwned.com/api/v3/breach/${b.name}`,
  }));
}

function fromBriefings(items: Array<{ slug: string; metadata: Record<string, unknown> }>): PulseEvent[] {
  return items.slice(0, 10).map((b) => ({
    id: `briefing-${b.slug}`,
    kind: 'briefing' as const,
    title: (b.metadata.title as string) ?? b.slug,
    description: `${(b.metadata.type as string) ?? 'daily'} briefing · ${(b.metadata.findings as number) ?? 0} findings`,
    lat: 0,
    lng: 0,
    timestamp: (b.metadata.date as string) ?? new Date().toISOString(),
    severity: 'low' as const,
    source: 'Briefings',
    url: `/threatintel/briefings/${b.slug}`,
  }));
}

function fromLiveIocs(data: {
  items?: Array<{ value: string; kind: string; source: string; observed_at?: string }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 50).map((i, idx) => ({
    id: `liveioc-${idx}-${i.value.slice(-15)}`,
    kind: 'cyber_attack' as const,
    title: `${i.kind.toUpperCase()}: ${i.value.slice(0, 80)}`,
    description: `Live IOC from ${i.source}`,
    lat: 0,
    lng: 0,
    timestamp: i.observed_at || new Date().toISOString(),
    severity: 'high' as const,
    source: i.source,
    url: '/threatintel/live-iocs',
  }));
}

function fromDeepdarkcti(data: {
  entries?: Array<{ name?: string; title?: string; category: string; url?: string; date?: string }>;
}): PulseEvent[] {
  return (data.entries ?? [])
    .filter((e) => /dark|market|leak|forum|ransom/i.test(e.category))
    .slice(0, 30)
    .map((e, i) => {
      const title = e.name || e.title || 'Unknown';
      return {
        id: `ddc-${i}-${title.slice(-15)}`,
        kind: 'darkweb' as const,
        title: title.slice(0, 120),
        description: e.category,
        lat: 0,
        lng: 0,
        timestamp: e.date || new Date().toISOString(),
        severity: 'high' as const,
        source: 'DeepDarkCTI',
        url: e.url,
      };
    });
}

function fromOnionWatch(data: { items?: Array<{ title: string; url?: string; discovered?: string }> }): PulseEvent[] {
  return (data.items ?? []).slice(0, 20).map((i, idx) => ({
    id: `onion-${idx}-${i.title.slice(-15)}`,
    kind: 'darkweb' as const,
    title: i.title.slice(0, 120),
    description: 'Onion service',
    lat: 0,
    lng: 0,
    timestamp: i.discovered || new Date().toISOString(),
    severity: 'medium' as const,
    source: 'Onion Watch',
    url: i.url,
  }));
}

function fromStealerForum(data: {
  forums?: Array<{ category: string; entries?: Array<{ name: string; url?: string; status?: string }> }>;
  chatter?: Array<{ text?: string; source?: string; date?: string }>;
}): PulseEvent[] {
  const events: PulseEvent[] = [];
  // Extract entries from forums
  for (const forum of data.forums ?? []) {
    for (const entry of forum.entries ?? []) {
      if (events.length >= 30) break;
      events.push({
        id: `stealer-${events.length}-${entry.name.slice(-15)}`,
        kind: 'infostealer' as const,
        title: entry.name.slice(0, 120),
        description: `${forum.category} · ${entry.status || 'unknown'}`,
        lat: 0,
        lng: 0,
        timestamp: new Date().toISOString(),
        severity: 'high' as const,
        source: forum.category,
        url: entry.url,
      });
    }
  }
  // Also add chatter items
  for (const msg of data.chatter ?? []) {
    if (events.length >= 30) break;
    events.push({
      id: `stealer-chatter-${events.length}`,
      kind: 'infostealer' as const,
      title: (msg.text || 'Forum chatter').slice(0, 120),
      description: `Infostealer chatter from ${msg.source || 'unknown'}`,
      lat: 0,
      lng: 0,
      timestamp: msg.date || new Date().toISOString(),
      severity: 'medium' as const,
      source: msg.source || 'Stealer Forum',
    });
  }
  return events;
}

function fromPhishing(data: {
  urls?: Array<{ url: string; source?: string; first_seen?: string; verified?: boolean }>;
}): PulseEvent[] {
  return (data.urls ?? []).slice(0, 30).map((i, idx) => ({
    id: `phish-${idx}-${i.url.slice(-20)}`,
    kind: 'phishing' as const,
    title: i.url.slice(0, 100),
    description: `Phishing URL from ${i.source || 'unknown'}`,
    lat: 0,
    lng: 0,
    timestamp: i.first_seen || new Date().toISOString(),
    severity: 'high' as const,
    source: i.source || 'Phishing Feed',
    url: i.url,
  }));
}

function fromMalware(data: {
  samples?: Array<{ sha256: string; reporter?: string; first_seen?: string; file_type?: string; signature?: string }>;
}): PulseEvent[] {
  return (data.samples ?? []).slice(0, 20).map((i, idx) => ({
    id: `malware-${idx}-${i.sha256.slice(-12)}`,
    kind: 'malware' as const,
    title: `Sample: ${i.sha256.slice(0, 16)}…`,
    description: `${i.file_type || 'binary'} · ${i.signature || 'no signature'}`,
    lat: 0,
    lng: 0,
    timestamp: i.first_seen || new Date().toISOString(),
    severity: 'high' as const,
    source: i.reporter || 'MalwareBazaar',
  }));
}

function fromRansomware(data: {
  victims?: Array<{
    victim: string;
    group: string;
    discovered: string;
    country?: string;
    sector?: string;
    source_url?: string;
  }>;
}): PulseEvent[] {
  return (data.victims ?? []).slice(0, 30).map((v) => ({
    id: `ransom-${v.victim}-${v.group}`,
    kind: 'ransomware' as const,
    title: `${v.victim} — ${v.group}`,
    description: `${v.sector || 'Unknown'} sector · ${v.country || 'Unknown country'}`,
    lat: 0,
    lng: 0,
    timestamp: v.discovered || new Date().toISOString(),
    severity: 'critical' as const,
    source: v.group,
    url: v.source_url,
  }));
}

function fromDetections(data: {
  detections?: Array<{
    rule_name: string;
    severity?: string;
    description?: string;
    match_count?: number;
    first_observed?: string;
  }>;
}): PulseEvent[] {
  return (data.detections ?? []).slice(0, 20).map((i, idx) => ({
    id: `detect-${idx}-${i.rule_name.slice(-15)}`,
    kind: 'detection' as const,
    title: i.rule_name.slice(0, 120),
    description: `${i.description || 'Detection rule'} · ${i.match_count ?? 0} matches`,
    lat: 0,
    lng: 0,
    timestamp: i.first_observed || new Date().toISOString(),
    severity: (i.severity as PulseEvent['severity']) || ('medium' as const),
    source: 'Detections',
  }));
}

function fromCybercrime(data: {
  items?: Array<{ title: string; source?: string; url?: string; date?: string }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 20).map((i, idx) => ({
    id: `crime-${idx}-${i.title.slice(-15)}`,
    kind: 'cybercrime' as const,
    title: i.title.slice(0, 120),
    description: `Cybercrime intel from ${i.source || 'unknown'}`,
    lat: 0,
    lng: 0,
    timestamp: i.date || new Date().toISOString(),
    severity: 'medium' as const,
    source: i.source || 'Cybercrime',
    url: i.url,
  }));
}

function fromWriteups(data: {
  items?: Array<{ title: string; source?: string; url?: string; published?: string }>;
}): PulseEvent[] {
  return (data.items ?? []).slice(0, 15).map((i, idx) => ({
    id: `writeup-${idx}-${i.title.slice(-15)}`,
    kind: 'research' as const,
    title: i.title.slice(0, 120),
    description: `Research from ${i.source || 'unknown'}`,
    lat: 0,
    lng: 0,
    timestamp: i.published || new Date().toISOString(),
    severity: 'low' as const,
    source: i.source || 'Research',
    url: i.url,
  }));
}

function fromCveRecent(data: {
  cves?: Array<{
    id: string;
    severity: string;
    score: number | null;
    kev: boolean;
    published: string;
    description?: string;
  }>;
}): PulseEvent[] {
  return (data.cves ?? []).slice(0, 20).map((c) => ({
    id: `cve-${c.id}`,
    kind: 'cve' as const,
    title: c.id,
    description: c.description?.slice(0, 120) || `CVSS ${c.score ?? 'N/A'} · ${c.kev ? 'KEV' : 'NVD'}`,
    lat: 0,
    lng: 0,
    timestamp: c.published || new Date().toISOString(),
    severity:
      c.severity === 'CRITICAL'
        ? ('critical' as const)
        : c.severity === 'HIGH'
          ? ('high' as const)
          : ('medium' as const),
    source: c.kev ? 'CISA KEV' : 'NVD',
    url: `https://nvd.nist.gov/vuln/detail/${c.id}`,
  }));
}

/* ─── Handler ───────────────────────────────────────────────────────────── */

export async function globalPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = caches.default;
    const cacheReq = new Request(GLOBAL_PULSE_CACHE);
    const cached = await cache.match(cacheReq);
    if (cached) return new Response(cached.body, cached);

    // Telegram cache key may have a bump suffix — read from KV
    let telegramCacheKey = CACHE_KEYS.telegram;
    try {
      const bump = c.env.KV_CACHE ? await c.env.KV_CACHE.get('tg:custom-channels:bump').catch(() => null) : null;
      if (bump) telegramCacheKey = `${CACHE_KEYS.telegram}-${bump}`;
    } catch {
      /* use base key */
    }

    const kv = c.env.KV_CACHE;

    // ── Read per-route caches in parallel, with KV fallback ─────────────
    const [
      tmData,
      redditData,
      tgData,
      xData,
      scamData,
      breachData,
      liveIocsData,
      ddcData,
      onionData,
      stealerData,
      phishingData,
      malwareData,
      ransomwareData,
      detectionsData,
      cybercrimeData,
      writeupsData,
      cveData,
      usgsData,
    ] = await Promise.all([
      readCache(cache, CACHE_KEYS.threatMap),
      readCache(cache, CACHE_KEYS.reddit),
      readCache(cache, telegramCacheKey),
      readCache(cache, CACHE_KEYS.xFeed),
      readCache(cache, CACHE_KEYS.cryptoScam),
      readCache(cache, CACHE_KEYS.breach),
      readCache(cache, CACHE_KEYS.liveIocs),
      readCache(cache, CACHE_KEYS.deepdarkcti),
      readCache(cache, CACHE_KEYS.onionWatch),
      readCache(cache, CACHE_KEYS.stealerForum),
      readCache(cache, CACHE_KEYS.phishing),
      readCache(cache, CACHE_KEYS.malware),
      readCache(cache, CACHE_KEYS.ransomware),
      readCache(cache, CACHE_KEYS.detections),
      readCache(cache, CACHE_KEYS.cybercrime),
      readCache(cache, CACHE_KEYS.writeups),
      readCache(cache, CACHE_KEYS.cveRecent),
      readCache(cache, CACHE_KEYS.usgs),
    ]);

    // KV fallback for layers that had cache misses (Cache API is per-colo)
    const kvResults = await Promise.all([
      tmData ? null : readKvJson(kv, 'gp:threat-map'),
      tgData ? null : readKvJson(kv, 'gp:telegram-feed'),
      ransomwareData ? null : readKvJson(kv, 'gp:ransomware-recent'),
      ddcData ? null : readKvJson(kv, 'gp:deepdarkcti'),
      stealerData ? null : readKvJson(kv, 'gp:stealer-forum-intel'),
      cveData ? null : readKvJson(kv, 'gp:cve-recent'),
      liveIocsData ? null : readKvJson(kv, 'gp:live-iocs'),
      usgsData ? null : readKvJson(kv, 'gp:usgs-earthquakes'),
    ]);

    // Use KV data if cache was empty
    const finalTm = tmData ?? kvResults[0];
    const finalTg = tgData ?? kvResults[1];
    const finalRansom = ransomwareData ?? kvResults[2];
    const finalDdc = ddcData ?? kvResults[3];
    const finalStealer = stealerData ?? kvResults[4];
    const finalCve = cveData ?? kvResults[5];
    const finalIoc = liveIocsData ?? kvResults[6];
    const finalUsgs = usgsData ?? kvResults[7];

    // ── Convert cached data → events (each wrapped in try/catch) ────────
    const safe = <T>(fn: () => T): T => {
      try {
        return fn();
      } catch {
        return [] as unknown as T;
      }
    };
    const iocEvents = safe(() => (finalTm ? iocFromThreatMap(finalTm) : []));
    const redditEvents = safe(() => (redditData ? fromReddit(redditData) : []));
    const telegramEvents = safe(() => (finalTg ? fromTelegram(finalTg) : []));
    const xEvents = safe(() => (xData ? fromXFeed(xData) : []));
    const scamEvents = safe(() => (scamData ? fromScam(scamData) : []));
    const breachEvents = safe(() => (breachData ? fromBreaches(breachData) : []));
    const liveIocEvents = safe(() => (finalIoc ? fromLiveIocs(finalIoc) : []));
    const darkwebEvents = safe(() => [
      ...(finalDdc ? fromDeepdarkcti(finalDdc) : []),
      ...(onionData ? fromOnionWatch(onionData) : []),
    ]);
    const infostealerEvents = safe(() => (finalStealer ? fromStealerForum(finalStealer) : []));
    const phishingEvents = safe(() => (phishingData ? fromPhishing(phishingData) : []));
    const malwareEvents = safe(() => (malwareData ? fromMalware(malwareData) : []));
    const ransomwareEvents = safe(() => (finalRansom ? fromRansomware(finalRansom) : []));
    const detectionEvents = safe(() => (detectionsData ? fromDetections(detectionsData) : []));
    const cybercrimeEvents = safe(() => (cybercrimeData ? fromCybercrime(cybercrimeData) : []));
    const researchEvents = safe(() => (writeupsData ? fromWriteups(writeupsData) : []));
    const cveEvents = safe(() => (finalCve ? fromCveRecent(finalCve) : []));
    const earthquakes: PulseEvent[] = safe(() => (finalUsgs ? (finalUsgs as unknown as PulseEvent[]) : []));

    // ── Briefings (D1 read — cheap) ──────────────────────────────────────
    let briefingEvents: PulseEvent[] = [];
    try {
      const db = c.env.BRIEFINGS_DB;
      if (db) {
        const { items } = await listBriefings(db, { limit: 5 });
        briefingEvents = fromBriefings(items);
      }
    } catch {
      /* degraded */
    }

    // ── Merge + sort ─────────────────────────────────────────────────────
    const allEvents = [
      ...earthquakes,
      ...iocEvents,
      ...liveIocEvents,
      ...ransomwareEvents,
      ...darkwebEvents,
      ...infostealerEvents,
      ...phishingEvents,
      ...malwareEvents,
      ...cveEvents,
      ...detectionEvents,
      ...cybercrimeEvents,
      ...breachEvents,
      ...researchEvents,
      ...briefingEvents,
      ...redditEvents,
      ...telegramEvents,
      ...xEvents,
      ...scamEvents,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const result: GlobalPulseResponse = {
      generated_at: new Date().toISOString(),
      total_events: allEvents.length,
      events: allEvents,
      layers: {
        earthquake: earthquakes.length,
        ioc_activity: iocEvents.length,
        geopolitical: 0,
        tech_news: 0,
        war_room: 0,
        aircraft: 0,
        c2_tracker: 0,
        cisa_advisory: 0,
        blocklist: 0,
        cyber_attack: liveIocEvents.length,
        reddit: redditEvents.length,
        telegram: telegramEvents.length,
        x_feed: xEvents.length,
        scam: scamEvents.length,
        breach: breachEvents.length,
        briefing: briefingEvents.length,
        darkweb: darkwebEvents.length,
        infostealer: infostealerEvents.length,
        phishing: phishingEvents.length,
        malware: malwareEvents.length,
        ransomware: ransomwareEvents.length,
        detection: detectionEvents.length,
        cybercrime: cybercrimeEvents.length,
        research: researchEvents.length,
        cve: cveEvents.length,
      },
    };

    const json = JSON.stringify(result);
    const response = new Response(json, {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL}`,
        'access-control-allow-origin': '*',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    console.error('global-pulse error:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'internal_error', message: e instanceof Error ? e.message : 'unknown' }, 500);
  }
}
