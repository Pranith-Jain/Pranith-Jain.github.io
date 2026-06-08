import type { Context } from 'hono';
import type { Env } from '../env';
import { listBriefings } from '../lib/briefing-builder';

/* ─── Cache keys (all warmed by hourly cron) ────────────────────────────── */

const GLOBAL_PULSE_CACHE = 'https://global-pulse-cache.internal/v21-cyber-tech-geo';
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
  cybercrime: 'https://cyber-crime-cache.internal/v2-500',
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

/* ─── Coordinate lookup ─────────────────────────────────────────────────── */

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
  IT: [41.87, 12.56],
  ES: [40.46, -3.75],
  PL: [51.92, 19.15],
  SE: [60.13, 18.64],
  NO: [60.47, 8.47],
  FI: [61.92, 25.75],
  DK: [56.26, 9.5],
  AT: [47.52, 14.55],
  CH: [46.82, 8.23],
  BE: [50.5, 4.47],
  CZ: [49.82, 15.47],
  RO: [45.94, 24.97],
  HU: [47.16, 19.5],
  GR: [39.07, 21.82],
  PT: [39.4, -8.22],
  IE: [53.14, -7.69],
  NZ: [-40.9, 174.89],
  AR: [-38.42, -63.62],
  CL: [-35.68, -71.54],
  CO: [4.57, -74.3],
  PE: [-9.19, -75.02],
  VE: [6.42, -66.59],
  MY: [4.21, 101.98],
  BD: [23.68, 90.36],
  LK: [7.87, 80.77],
  MM: [21.91, 95.96],
  KH: [12.57, 104.99],
  NP: [28.39, 84.12],
  QA: [25.35, 51.18],
  KW: [29.31, 47.48],
  BH: [26.07, 50.55],
  OM: [21.47, 55.98],
  JO: [30.59, 36.24],
  LB: [33.85, 35.86],
  IQ: [33.22, 43.68],
  SY: [34.8, 38.99],
  AF: [33.94, 67.71],
  KZ: [48.02, 66.92],
  UZ: [41.38, 64.59],
  GE: [42.32, 43.36],
  AM: [40.07, 45.04],
  AZ: [40.14, 47.58],
  BY: [53.71, 27.95],
  LT: [55.17, 23.88],
  LV: [56.88, 24.6],
  EE: [58.6, 25.01],
  BG: [42.73, 25.49],
  HR: [45.1, 15.2],
  RS: [44.02, 21.01],
  SK: [48.67, 19.7],
  SI: [46.15, 14.99],
  AL: [41.15, 20.17],
  BA: [43.92, 17.68],
  MK: [41.51, 21.75],
  ME: [42.71, 19.37],
  XK: [42.6, 20.9],
  MD: [47.41, 28.37],
  LU: [49.82, 6.13],
  IS: [64.96, -19.02],
  MT: [35.94, 14.38],
  CY: [35.13, 33.43],
};

/** Map common country names to ISO 2-letter codes */
function countryNameToCode(name?: string): string | null {
  if (!name) return null;
  const n = name.trim().toUpperCase();
  // Already a code
  if (n.length === 2 && COUNTRY_COORDS[n]) return n;
  const map: Record<string, string> = {
    'UNITED STATES': 'US',
    USA: 'US',
    'UNITED STATES OF AMERICA': 'US',
    RUSSIA: 'RU',
    'RUSSIAN FEDERATION': 'RU',
    CHINA: 'CN',
    'PEOPLES REPUBLIC OF CHINA': 'CN',
    IRAN: 'IR',
    'ISLAMIC REPUBLIC OF IRAN': 'IR',
    'NORTH KOREA': 'KP',
    'DEMOCRATIC PEOPLES REPUBLIC OF KOREA': 'KP',
    'SOUTH KOREA': 'KR',
    'REPUBLIC OF KOREA': 'KR',
    GERMANY: 'DE',
    'UNITED KINGDOM': 'GB',
    UK: 'GB',
    'GREAT BRITAIN': 'GB',
    FRANCE: 'FR',
    NETHERLANDS: 'NL',
    UKRAINE: 'UA',
    INDIA: 'IN',
    BRAZIL: 'BR',
    JAPAN: 'JP',
    AUSTRALIA: 'AU',
    CANADA: 'CA',
    SINGAPORE: 'SG',
    'HONG KONG': 'HK',
    TAIWAN: 'TW',
    ISRAEL: 'IL',
    TURKEY: 'TR',
    TÜRKIYE: 'TR',
    PAKISTAN: 'PK',
    VIETNAM: 'VN',
    THAILAND: 'TH',
    INDONESIA: 'ID',
    PHILIPPINES: 'PH',
    MEXICO: 'MX',
    'SAUDI ARABIA': 'SA',
    'UNITED ARAB EMIRATES': 'AE',
    UAE: 'AE',
    'SOUTH AFRICA': 'ZA',
    EGYPT: 'EG',
    NIGERIA: 'NG',
    ITALY: 'IT',
    SPAIN: 'ES',
    POLAND: 'PL',
    SWEDEN: 'SE',
    NORWAY: 'NO',
    FINLAND: 'FI',
    DENMARK: 'DK',
    AUSTRIA: 'AT',
    SWITZERLAND: 'CH',
    BELGIUM: 'BE',
    'CZECH REPUBLIC': 'CZ',
    CZECHIA: 'CZ',
    ROMANIA: 'RO',
    HUNGARY: 'HU',
    GREECE: 'GR',
    PORTUGAL: 'PT',
    IRELAND: 'IE',
    'NEW ZEALAND': 'NZ',
    ARGENTINA: 'AR',
    CHILE: 'CL',
    COLOMBIA: 'CO',
    PERU: 'PE',
    VENEZUELA: 'VE',
    MALAYSIA: 'MY',
    BANGLADESH: 'BD',
    'SRI LANKA': 'LK',
    MYANMAR: 'MM',
    BURMA: 'MM',
    CAMBODIA: 'KH',
    NEPAL: 'NP',
    QATAR: 'QA',
    KUWAIT: 'KW',
    BAHRAIN: 'BH',
    OMAN: 'OM',
    JORDAN: 'JO',
    LEBANON: 'LB',
    IRAQ: 'IQ',
    SYRIA: 'SY',
    AFGHANISTAN: 'AF',
    KAZAKHSTAN: 'KZ',
    UZBEKISTAN: 'UZ',
    GEORGIA: 'GE',
    ARMENIA: 'AM',
    AZERBAIJAN: 'AZ',
    BELARUS: 'BY',
    LITHUANIA: 'LT',
    LATVIA: 'LV',
    ESTONIA: 'EE',
    BULGARIA: 'BG',
    CROATIA: 'HR',
    SERBIA: 'RS',
    SLOVAKIA: 'SK',
    SLOVENIA: 'SI',
    ALBANIA: 'AL',
    BOSNIA: 'BA',
    'NORTH MACEDONIA': 'MK',
    MONTENEGRO: 'ME',
    MOLDOVA: 'MD',
    LUXEMBOURG: 'LU',
    ICELAND: 'IS',
    MALTA: 'MT',
    CYPRUS: 'CY',
  };
  return map[n] ?? null;
}

/* ─── Converters ────────────────────────────────────────────────────────── */

function iocFromThreatMap(data: {
  countries: Array<{ countryCode: string; country: string; count: number; sources: Record<string, number> }>;
}): PulseEvent[] {
  return (data.countries ?? [])
    .filter((c) => c.count > 0)
    .map((c) => {
      const baseCoords = COUNTRY_COORDS[c.countryCode];
      // Add small jitter so stacked points spread out slightly
      const jitterLat = (Math.random() - 0.5) * 3;
      const jitterLng = (Math.random() - 0.5) * 5;
      return {
        id: `ioc-${c.countryCode}`,
        kind: 'ioc_activity' as const,
        title: `${c.country} — ${c.count} malicious IPs`,
        description: `Threat activity from ${Object.keys(c.sources).length} feed sources`,
        lat: (baseCoords?.[0] ?? 0) + jitterLat,
        lng: (baseCoords?.[1] ?? 0) + jitterLng,
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
      };
    });
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
  breaches?: Array<{
    name: string;
    title: string;
    pwn_count?: number;
    added_date?: string;
    breach_date?: string;
    domain?: string;
  }>;
}): PulseEvent[] {
  return (data.breaches ?? []).slice(0, 30).map((b) => ({
    id: `breach-${b.name}`,
    kind: 'breach' as const,
    title: b.title,
    description: `${(b.pwn_count ?? 0).toLocaleString()} accounts breached`,
    // Breaches are global — no specific geo
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
  return events;
}

function fromPhishing(data: { urls?: Array<{ url: string; source?: string; first_seen?: string }> }): PulseEvent[] {
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
  return (data.victims ?? []).slice(0, 30).map((v) => {
    // Look up coordinates from country name
    const cc = countryNameToCode(v.country);
    return {
      id: `ransom-${v.victim}-${v.group}`,
      kind: 'ransomware' as const,
      title: `${v.victim} — ${v.group}`,
      description: `${v.sector || 'Unknown'} sector · ${v.country || 'Unknown country'}`,
      lat: cc ? (COUNTRY_COORDS[cc]?.[0] ?? 0) : 0,
      lng: cc ? (COUNTRY_COORDS[cc]?.[1] ?? 0) : 0,
      timestamp: v.discovered || new Date().toISOString(),
      severity: 'critical' as const,
      source: v.group,
      url: v.source_url,
      country: v.country,
    };
  });
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

/* ─── USGS Earthquakes ──────────────────────────────────────────────────── */

async function fetchEarthquakes(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        properties: { mag: number; place: string; time: number; url: string; alert?: string };
        geometry: { coordinates: [number, number, number] };
      }>;
    };
    return (data.features ?? []).slice(0, 50).map((f, idx) => {
      const [lng, lat] = f.geometry.coordinates;
      const mag = f.properties.mag;
      return {
        id: `quake-${idx}-${f.properties.time}`,
        kind: 'earthquake' as const,
        title: `M${mag.toFixed(1)} — ${f.properties.place}`,
        description:
          `Magnitude ${mag.toFixed(1)} earthquake` + (f.properties.alert ? ` · Alert: ${f.properties.alert}` : ''),
        lat,
        lng,
        magnitude: mag,
        timestamp: new Date(f.properties.time).toISOString(),
        severity: mag >= 6 ? ('critical' as const) : mag >= 4.5 ? ('high' as const) : ('medium' as const),
        source: 'USGS',
        url: f.properties.url,
      };
    });
  } catch {
    return [];
  }
}

/* ─── NASA EONET (Natural Events — storms, volcanoes, floods, fires) ──── */

async function fetchNaturalEvents(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      events?: Array<{
        id: string;
        title: string;
        categories: Array<{ id: string; title: string }>;
        geometry: Array<{ date: string; coordinates: [number, number] }>;
        sources: Array<{ url: string }>;
      }>;
    };
    const events: PulseEvent[] = [];
    for (const evt of data.events ?? []) {
      const cat = evt.categories[0];
      if (!cat) continue;
      const latestGeo = evt.geometry[evt.geometry.length - 1];
      if (!latestGeo) continue;
      const [lng, lat] = latestGeo.coordinates;
      const isWildfire = cat.id === 'wildfires';
      const isVolcano = cat.id === 'volcanoes';
      const isStorm = cat.id === 'severeStorms';
      events.push({
        id: `eonet-${evt.id}`,
        kind: isWildfire ? 'war_room' : 'geopolitical',
        title: evt.title,
        description: cat.title,
        lat,
        lng,
        timestamp: latestGeo.date || new Date().toISOString(),
        severity: isVolcano || isStorm ? ('high' as const) : isWildfire ? ('medium' as const) : ('low' as const),
        source: 'NASA EONET',
        url: evt.sources[0]?.url,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/* ─── OpenSky Network (Live Flight Data — ADS-B) ─────────────────────── */

async function fetchFlights(): Promise<PulseEvent[]> {
  try {
    // OpenSky may block Cloudflare Workers - use timeout and fallback
    const res = await fetch('https://opensky-network.org/api/states/all?lamin=20&lomin=-130&lamax=70&lomax=50', {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return getStaticFlights();
    const data = (await res.json()) as {
      states?: Array<
        [
          string,
          string,
          number,
          number,
          number | null,
          number | null,
          number | null,
          boolean,
          number,
          number,
          number | null,
          number | null,
          string | null,
          number | null,
          string | null,
        ]
      >;
    };
    if (!data.states?.length) return getStaticFlights();
    const sampled = data.states.filter((_, i) => i % 30 === 0).slice(0, 25);
    return sampled
      .map((s, idx) => {
        const [icao24, callsign, , , , lon, lat, , , , , , originCountry] = s;
        return {
          id: `flight-${icao24}-${idx}`,
          kind: 'aircraft' as const,
          title: `${(callsign ?? '').trim() || icao24} — ${originCountry ?? 'Unknown'}`,
          description: `Aircraft from ${originCountry ?? 'Unknown origin'}`,
          lat: lat ?? 0,
          lng: lon ?? 0,
          timestamp: new Date().toISOString(),
          severity: 'low' as const,
          source: 'OpenSky',
        };
      })
      .filter((f) => f.lat !== 0 || f.lng !== 0);
  } catch {
    return getStaticFlights();
  }
}

/* ─── Static Flight Data (Fallback) ───────────────────────────────────── */

function getStaticFlights(): PulseEvent[] {
  // Major airports worldwide for fallback visualization
  const airports = [
    { code: 'JFK', lat: 40.64, lng: -73.78, city: 'New York' },
    { code: 'LAX', lat: 33.94, lng: -118.41, city: 'Los Angeles' },
    { code: 'LHR', lat: 51.47, lng: -0.46, city: 'London' },
    { code: 'CDG', lat: 49.01, lng: 2.55, city: 'Paris' },
    { code: 'FRA', lat: 50.03, lng: 8.57, city: 'Frankfurt' },
    { code: 'DXB', lat: 25.25, lng: 55.36, city: 'Dubai' },
    { code: 'HND', lat: 35.55, lng: 139.78, city: 'Tokyo' },
    { code: 'SIN', lat: 1.35, lng: 103.99, city: 'Singapore' },
    { code: 'SYD', lat: -33.95, lng: 151.18, city: 'Sydney' },
    { code: 'GRU', lat: -23.43, lng: -46.47, city: 'São Paulo' },
    { code: 'JNB', lat: -26.13, lng: 28.24, city: 'Johannesburg' },
    { code: 'PEK', lat: 40.08, lng: 116.58, city: 'Beijing' },
    { code: 'ICN', lat: 37.46, lng: 126.44, city: 'Seoul' },
    { code: 'BOM', lat: 19.09, lng: 72.87, city: 'Mumbai' },
    { code: 'ORD', lat: 41.97, lng: -87.91, city: 'Chicago' },
  ];
  return airports.map((a, idx) => ({
    id: `airport-${a.code}-${idx}`,
    kind: 'aircraft' as const,
    title: `${a.code} — ${a.city}`,
    description: `Major airport hub`,
    lat: a.lat,
    lng: a.lng,
    timestamp: new Date().toISOString(),
    severity: 'low' as const,
    source: 'Airport Data',
  }));
}

/* ─── GDACS (Global Disaster Alerts) ──────────────────────────────────── */

async function fetchGdacsAlerts(): Promise<PulseEvent[]> {
  try {
    const res = await fetch(
      'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?alertlevel=Orange;Red&eventtype=TC;EQ;FL;VO;DR;WF',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          eventid: string;
          eventtype: string;
          alertlevel: string;
          country: string;
          title: string;
          fromdate: string;
        };
        geometry: { coordinates: [number, number] };
      }>;
    };
    return (data.features ?? [])
      .filter((f) => f.properties.alertlevel !== 'Green')
      .slice(0, 30)
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const typeMap: Record<string, string> = {
          TC: 'Tropical Cyclone',
          EQ: 'Earthquake',
          FL: 'Flood',
          VO: 'Volcano',
          DR: 'Drought',
          WF: 'Wildfire',
        };
        return {
          id: `gdacs-${p.eventid}`,
          kind: 'geopolitical' as const,
          title: p.title || `${typeMap[p.eventtype] ?? p.eventtype} — ${p.country}`,
          description: `${typeMap[p.eventtype] ?? p.eventtype} · Alert: ${p.alertlevel} · ${p.country}`,
          lat,
          lng,
          timestamp: p.fromdate || new Date().toISOString(),
          severity: p.alertlevel === 'Red' ? ('critical' as const) : ('high' as const),
          source: 'GDACS',
        };
      });
  } catch {
    return [];
  }
}

/* ─── Feodo Tracker (Botnet C2 Infrastructure) ─────────────────────────── */

async function fetchBotnetC2(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      ip_address: string;
      port: number;
      status: string;
      hostname: string | null;
      as_number: number;
      as_name: string;
      country: string;
      first_seen: string;
      last_online: string;
      malware: string;
    }>;
    // Only show online C2 servers
    return data
      .filter((c) => c.status === 'online')
      .slice(0, 30)
      .map((c) => {
        const coords = COUNTRY_COORDS[c.country];
        return {
          id: `c2-${c.ip_address}-${c.port}`,
          kind: 'c2_tracker' as const,
          title: `${c.malware} C2 — ${c.ip_address}:${c.port}`,
          description: `${c.as_name} · ${c.country} · ${c.hostname || 'No hostname'}`,
          lat: coords ? coords[0] + (Math.random() - 0.5) * 2 : 0,
          lng: coords ? coords[1] + (Math.random() - 0.5) * 3 : 0,
          timestamp: c.last_online || c.first_seen || new Date().toISOString(),
          severity: 'critical' as const,
          source: 'Feodo Tracker',
          url: `https://feodotracker.abuse.ch/host/${c.ip_address}/`,
          country: c.country,
        };
      })
      .filter((e) => e.lat !== 0 || e.lng !== 0);
  } catch {
    return [];
  }
}

/* ─── SANS DShield Top Attackers ───────────────────────────────────────── */

async function fetchDShieldAttackers(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://isc.sans.edu/api/sources/attacks/20?json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      ip: string;
      attacks: number;
      count: number;
      firstseen: string;
      lastseen: string;
    }>;
    return data.slice(0, 20).map((a) => {
      // Use a deterministic "random" based on IP for consistent positioning
      const ipHash = a.ip.split('.').reduce((h, o) => (h * 11 + parseInt(o)) % 360, 0);
      const lat = 20 + (ipHash % 50);
      const lng = -180 + ((ipHash * 7) % 360);
      return {
        id: `dshield-${a.ip}`,
        kind: 'cyber_attack' as const,
        title: `Mass Scanner — ${a.ip}`,
        description: `${a.attacks.toLocaleString()} attacks · ${a.count.toLocaleString()} targets · Since ${a.firstseen}`,
        lat,
        lng,
        timestamp: a.lastseen || new Date().toISOString(),
        severity: a.attacks > 5000 ? ('critical' as const) : a.attacks > 1000 ? ('high' as const) : ('medium' as const),
        source: 'SANS DShield',
        url: `https://isc.sans.edu/ipinfo.html?ip=${a.ip}`,
      };
    });
  } catch {
    return [];
  }
}

/* ─── Emerging Threats Compromised IPs ─────────────────────────────────── */

async function fetchCompromisedIPs(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://rules.emergingthreats.net/blockrules/compromised-ips.txt', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const ips = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 30);
    return ips.map((ip, idx) => {
      const ipHash = ip.split('.').reduce((h, o) => (h * 11 + parseInt(o || '0')) % 360, 0);
      const lat = 20 + (ipHash % 50);
      const lng = -180 + ((ipHash * 7) % 360);
      return {
        id: `compromised-${ip}-${idx}`,
        kind: 'cyber_attack' as const,
        title: `Compromised Host — ${ip}`,
        description: 'Listed by Emerging Threats (Proofpoint) as compromised',
        lat,
        lng,
        timestamp: new Date().toISOString(),
        severity: 'high' as const,
        source: 'Emerging Threats',
      };
    });
  } catch {
    return [];
  }
}

/* ─── Blocklist.de Attackers ───────────────────────────────────────────── */

async function fetchBlocklistAttackers(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://lists.blocklist.de/lists/all.txt', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const ips = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 30);
    return ips.map((ip, idx) => {
      const ipHash = ip.split('.').reduce((h, o) => (h * 11 + parseInt(o || '0')) % 360, 0);
      const lat = 20 + (ipHash % 50);
      const lng = -180 + ((ipHash * 7) % 360);
      return {
        id: `blocklist-${ip}-${idx}`,
        kind: 'cyber_attack' as const,
        title: `Attacker — ${ip}`,
        description: 'Listed by Blocklist.de for malicious activity',
        lat,
        lng,
        timestamp: new Date().toISOString(),
        severity: 'high' as const,
        source: 'Blocklist.de',
      };
    });
  } catch {
    return [];
  }
}

/* ─── CISA Known Exploited Vulnerabilities ─────────────────────────────── */

async function fetchCisaKev(): Promise<PulseEvent[]> {
  try {
    const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      vulnerabilities?: Array<{
        cveID: string;
        vendorProject: string;
        product: string;
        vulnerabilityName: string;
        dateAdded: string;
        shortDescription: string;
        requiredAction: string;
        dueDate: string;
      }>;
    };
    // Get recently added KEVs (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    return (data.vulnerabilities ?? [])
      .filter((v) => v.dateAdded >= thirtyDaysAgo)
      .slice(0, 20)
      .map((v) => ({
        id: `kev-${v.cveID}`,
        kind: 'cisa_advisory' as const,
        title: `${v.cveID} — ${v.vendorProject} ${v.product}`,
        description: v.vulnerabilityName + '. ' + v.shortDescription.slice(0, 100),
        lat: 38.9, // Washington DC area (CISA)
        lng: -77.05,
        timestamp: v.dateAdded,
        severity: 'critical' as const,
        source: 'CISA KEV',
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      }));
  } catch {
    return [];
  }
}

/* ─── URLhaus Malware URLs ─────────────────────────────────────────────── */

async function fetchUrlhaus(): Promise<PulseEvent[]> {
  try {
    // URLhaus API may require auth or be rate-limited — fail gracefully
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/30/', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query_status?: string;
      urls?: Array<{
        id: number;
        url: string;
        url_status: string;
        date_added: string;
        threat: string;
        tags?: string[];
        report?: {
          country?: string;
        };
      }>;
    };
    if (data.query_status !== 'ok' || !data.urls?.length) return [];
    return data.urls
      .filter((u) => u.url_status === 'online')
      .slice(0, 20)
      .map((u) => {
        const cc = u.report?.country;
        const coords = cc ? COUNTRY_COORDS[cc] : null;
        return {
          id: `urlhaus-${u.id}`,
          kind: 'malware' as const,
          title: u.url.slice(0, 80),
          description: `Malware URL · ${u.threat} · Tags: ${(u.tags ?? []).join(', ') || 'none'}`,
          lat: coords ? coords[0] + (Math.random() - 0.5) * 2 : 0,
          lng: coords ? coords[1] + (Math.random() - 0.5) * 3 : 0,
          timestamp: u.date_added || new Date().toISOString(),
          severity: u.threat === 'malware_download' ? ('critical' as const) : ('high' as const),
          source: 'URLhaus',
          url: u.url,
          country: cc,
        };
      });
  } catch {
    return [];
  }
}

/* ─── Tech Infrastructure (Static Data — Data Centers, IXPs, Cloud Regions) ── */

interface TechLocation {
  name: string;
  lat: number;
  lng: number;
  type: 'datacenter' | 'ixp' | 'cloud_region' | 'tech_hq' | 'startup_hub';
  operator?: string;
  country: string;
}

const TECH_LOCATIONS: TechLocation[] = [
  // Major Data Centers
  {
    name: 'Ashburn Data Center Alley',
    lat: 39.04,
    lng: -77.49,
    type: 'datacenter',
    operator: 'Equinix/Digital Realty',
    country: 'US',
  },
  { name: 'Northern Virginia', lat: 38.95, lng: -77.45, type: 'datacenter', operator: 'AWS/Azure/GCP', country: 'US' },
  { name: 'Dallas Data Center Hub', lat: 32.78, lng: -96.8, type: 'datacenter', operator: 'Equinix', country: 'US' },
  {
    name: 'Chicago Data Center',
    lat: 41.88,
    lng: -87.63,
    type: 'datacenter',
    operator: 'QTS/Digital Realty',
    country: 'US',
  },
  { name: 'Silicon Valley', lat: 37.39, lng: -122.08, type: 'datacenter', operator: 'Equinix/CoreSite', country: 'US' },
  { name: 'Portland Data Center', lat: 45.52, lng: -122.68, type: 'datacenter', operator: 'Infomart', country: 'US' },
  {
    name: 'London Data Center',
    lat: 51.51,
    lng: -0.13,
    type: 'datacenter',
    operator: 'Equinix/Digital Realty',
    country: 'GB',
  },
  { name: 'Amsterdam AMS-IX', lat: 52.37, lng: 4.9, type: 'datacenter', operator: 'Equinix/Nikhef', country: 'NL' },
  { name: 'Frankfurt DE-CIX', lat: 50.11, lng: 8.68, type: 'datacenter', operator: 'Equinix', country: 'DE' },
  { name: 'Paris Data Center', lat: 48.86, lng: 2.35, type: 'datacenter', operator: 'Equinix', country: 'FR' },
  { name: 'Tokyo Data Center', lat: 35.68, lng: 139.69, type: 'datacenter', operator: 'Equinix/NTT', country: 'JP' },
  { name: 'Singapore Data Center', lat: 1.35, lng: 103.82, type: 'datacenter', operator: 'Equinix', country: 'SG' },
  { name: 'Sydney Data Center', lat: -33.87, lng: 151.21, type: 'datacenter', operator: 'Equinix', country: 'AU' },
  { name: 'Mumbai Data Center', lat: 19.08, lng: 72.88, type: 'datacenter', operator: 'Equinix', country: 'IN' },
  { name: 'São Paulo Data Center', lat: -23.55, lng: -46.63, type: 'datacenter', operator: 'Equinix', country: 'BR' },
  // Major Internet Exchange Points
  { name: 'DE-CIX Frankfurt', lat: 50.11, lng: 8.68, type: 'ixp', operator: 'DE-CIX', country: 'DE' },
  { name: 'AMS-IX Amsterdam', lat: 52.37, lng: 4.9, type: 'ixp', operator: 'AMS-IX', country: 'NL' },
  { name: 'LINX London', lat: 51.51, lng: -0.13, type: 'ixp', operator: 'LINX', country: 'GB' },
  { name: 'IX.br São Paulo', lat: -23.55, lng: -46.63, type: 'ixp', operator: 'IX.br', country: 'BR' },
  { name: 'JPNAP Tokyo', lat: 35.68, lng: 139.69, type: 'ixp', operator: 'JPNAP', country: 'JP' },
  { name: 'Equinix Ashburn', lat: 39.04, lng: -77.49, type: 'ixp', operator: 'Equinix IX', country: 'US' },
  // Cloud Provider Regions
  { name: 'AWS us-east-1', lat: 39.04, lng: -77.49, type: 'cloud_region', operator: 'AWS', country: 'US' },
  { name: 'AWS eu-west-1', lat: 53.35, lng: -6.26, type: 'cloud_region', operator: 'AWS', country: 'IE' },
  { name: 'AWS ap-southeast-1', lat: 1.35, lng: 103.82, type: 'cloud_region', operator: 'AWS', country: 'SG' },
  { name: 'Azure East US', lat: 37.38, lng: -79.82, type: 'cloud_region', operator: 'Azure', country: 'US' },
  { name: 'Azure West Europe', lat: 52.37, lng: 4.9, type: 'cloud_region', operator: 'Azure', country: 'NL' },
  { name: 'GCP us-central1', lat: 41.26, lng: -95.86, type: 'cloud_region', operator: 'GCP', country: 'US' },
  { name: 'GCP europe-west1', lat: 50.45, lng: 3.82, type: 'cloud_region', operator: 'GCP', country: 'BE' },
  // Tech Company HQs
  { name: 'Apple Park', lat: 37.33, lng: -122.01, type: 'tech_hq', operator: 'Apple', country: 'US' },
  { name: 'Googleplex', lat: 37.42, lng: -122.08, type: 'tech_hq', operator: 'Google', country: 'US' },
  { name: 'Meta HQ', lat: 37.48, lng: -122.15, type: 'tech_hq', operator: 'Meta', country: 'US' },
  { name: 'Microsoft Redmond', lat: 47.64, lng: -122.14, type: 'tech_hq', operator: 'Microsoft', country: 'US' },
  { name: 'Amazon Seattle', lat: 47.62, lng: -122.34, type: 'tech_hq', operator: 'Amazon', country: 'US' },
  { name: 'NVIDIA HQ', lat: 37.37, lng: -121.97, type: 'tech_hq', operator: 'NVIDIA', country: 'US' },
  { name: 'Tesla HQ', lat: 30.22, lng: -97.62, type: 'tech_hq', operator: 'Tesla', country: 'US' },
  { name: 'Samsung HQ', lat: 37.51, lng: 127.06, type: 'tech_hq', operator: 'Samsung', country: 'KR' },
  { name: 'Huawei HQ', lat: 22.55, lng: 114.07, type: 'tech_hq', operator: 'Huawei', country: 'CN' },
  // Startup Hubs
  { name: 'Silicon Valley', lat: 37.39, lng: -122.08, type: 'startup_hub', operator: 'Y Combinator', country: 'US' },
  { name: 'San Francisco', lat: 37.77, lng: -122.42, type: 'startup_hub', operator: 'Tech Hub', country: 'US' },
  { name: 'New York', lat: 40.71, lng: -74.01, type: 'startup_hub', operator: 'Tech Hub', country: 'US' },
  { name: 'London', lat: 51.51, lng: -0.13, type: 'startup_hub', operator: 'Tech Hub', country: 'GB' },
  { name: 'Berlin', lat: 52.52, lng: 13.41, type: 'startup_hub', operator: 'Tech Hub', country: 'DE' },
  { name: 'Tel Aviv', lat: 32.09, lng: 34.78, type: 'startup_hub', operator: 'Tech Hub', country: 'IL' },
  { name: 'Bangalore', lat: 12.97, lng: 77.59, type: 'startup_hub', operator: 'Tech Hub', country: 'IN' },
  { name: 'Shenzhen', lat: 22.54, lng: 114.06, type: 'startup_hub', operator: 'Tech Hub', country: 'CN' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, type: 'startup_hub', operator: 'Tech Hub', country: 'SG' },
  { name: 'Seoul', lat: 37.57, lng: 126.98, type: 'startup_hub', operator: 'Tech Hub', country: 'KR' },
];

const TECH_KIND_MAP: Record<string, PulseKind> = {
  datacenter: 'tech_news',
  ixp: 'tech_news',
  cloud_region: 'tech_news',
  tech_hq: 'tech_news',
  startup_hub: 'tech_news',
};

const TECH_SEVERITY_MAP: Record<string, PulseEvent['severity']> = {
  datacenter: 'low',
  ixp: 'medium',
  cloud_region: 'low',
  tech_hq: 'low',
  startup_hub: 'low',
};

function getTechInfrastructureEvents(): PulseEvent[] {
  return TECH_LOCATIONS.map((loc, idx) => ({
    id: `tech-${loc.type}-${idx}-${loc.name.replace(/\s+/g, '-').toLowerCase()}`,
    kind: TECH_KIND_MAP[loc.type] ?? 'tech_news',
    title: loc.name,
    description: `${loc.type.replace('_', ' ')} · ${loc.operator ?? loc.country}`,
    lat: loc.lat,
    lng: loc.lng,
    timestamp: new Date().toISOString(),
    severity: TECH_SEVERITY_MAP[loc.type] ?? 'low',
    source: 'Static Data',
    country: loc.country,
  }));
}

/* ─── Geopolitical Hotspots (Static Data — Conflicts, Sanctions, Military) ── */

interface GeopoliticalLocation {
  name: string;
  lat: number;
  lng: number;
  type: 'conflict_zone' | 'sanctioned_country' | 'military_base' | 'nuclear_site' | 'disputed_territory';
  description: string;
  country: string;
  severity: PulseEvent['severity'];
}

const GEOPOLITICAL_LOCATIONS: GeopoliticalLocation[] = [
  // Active Conflict Zones (2024-2026)
  {
    name: 'Ukraine-Russia Front Line',
    lat: 48.5,
    lng: 37.5,
    type: 'conflict_zone',
    description: 'Active military conflict zone',
    country: 'UA',
    severity: 'critical',
  },
  {
    name: 'Gaza Strip',
    lat: 31.5,
    lng: 34.47,
    type: 'conflict_zone',
    description: 'Active conflict zone',
    country: 'PS',
    severity: 'critical',
  },
  {
    name: 'Sudan Conflict Zone',
    lat: 15.5,
    lng: 32.5,
    type: 'conflict_zone',
    description: 'Civil war and humanitarian crisis',
    country: 'SD',
    severity: 'critical',
  },
  {
    name: 'Myanmar Conflict',
    lat: 20.0,
    lng: 96.0,
    type: 'conflict_zone',
    description: 'Ongoing civil conflict',
    country: 'MM',
    severity: 'high',
  },
  {
    name: 'Yemen Conflict',
    lat: 15.5,
    lng: 48.0,
    type: 'conflict_zone',
    description: 'Ongoing conflict and Houthi attacks',
    country: 'YE',
    severity: 'high',
  },
  {
    name: 'Ethiopia-Tigray',
    lat: 13.5,
    lng: 39.5,
    type: 'conflict_zone',
    description: 'Post-conflict instability',
    country: 'ET',
    severity: 'high',
  },
  {
    name: 'Somalia Al-Shabaab',
    lat: 2.0,
    lng: 45.3,
    type: 'conflict_zone',
    description: 'Insurgency and counter-terrorism',
    country: 'SO',
    severity: 'high',
  },
  {
    name: 'Sahel Region',
    lat: 15.0,
    lng: 0.0,
    type: 'conflict_zone',
    description: 'Mali, Burkina Faso, Niger instability',
    country: 'ML',
    severity: 'high',
  },
  {
    name: 'Haiti Gang Violence',
    lat: 18.5,
    lng: -72.3,
    type: 'conflict_zone',
    description: 'Gang violence and instability',
    country: 'HT',
    severity: 'high',
  },
  {
    name: 'Syria Northeast',
    lat: 36.5,
    lng: 40.0,
    type: 'conflict_zone',
    description: 'Ongoing instability',
    country: 'SY',
    severity: 'medium',
  },

  // Sanctioned Countries
  {
    name: 'Russia',
    lat: 61.52,
    lng: 105.32,
    type: 'sanctioned_country',
    description: 'Heavily sanctioned by US, EU, UK, others',
    country: 'RU',
    severity: 'high',
  },
  {
    name: 'Iran',
    lat: 32.43,
    lng: 53.68,
    type: 'sanctioned_country',
    description: 'Comprehensive sanctions',
    country: 'IR',
    severity: 'high',
  },
  {
    name: 'North Korea',
    lat: 40.34,
    lng: 127.51,
    type: 'sanctioned_country',
    description: 'Maximum pressure sanctions',
    country: 'KP',
    severity: 'critical',
  },
  {
    name: 'Syria',
    lat: 34.8,
    lng: 38.99,
    type: 'sanctioned_country',
    description: 'Caesar Act sanctions',
    country: 'SY',
    severity: 'high',
  },
  {
    name: 'Venezuela',
    lat: 6.42,
    lng: -66.59,
    type: 'sanctioned_country',
    description: 'Sectoral sanctions',
    country: 'VE',
    severity: 'medium',
  },
  {
    name: 'Cuba',
    lat: 21.52,
    lng: -80.0,
    type: 'sanctioned_country',
    description: 'US embargo',
    country: 'CU',
    severity: 'medium',
  },
  {
    name: 'Belarus',
    lat: 53.71,
    lng: 27.95,
    type: 'sanctioned_country',
    description: 'Sanctions for enabling Russia',
    country: 'BY',
    severity: 'medium',
  },
  {
    name: 'Myanmar',
    lat: 21.91,
    lng: 95.96,
    type: 'sanctioned_country',
    description: 'Sanctions post-coup',
    country: 'MM',
    severity: 'medium',
  },

  // Major Military Bases (key strategic locations)
  {
    name: 'Naval Station Norfolk',
    lat: 36.95,
    lng: -76.29,
    type: 'military_base',
    description: 'Largest naval base in the world',
    country: 'US',
    severity: 'low',
  },
  {
    name: 'Ramstein Air Base',
    lat: 49.44,
    lng: 7.6,
    type: 'military_base',
    description: 'US Air Force in Europe',
    country: 'DE',
    severity: 'low',
  },
  {
    name: 'Camp Humphreys',
    lat: 36.97,
    lng: 127.03,
    type: 'military_base',
    description: 'Largest US overseas base',
    country: 'KR',
    severity: 'low',
  },
  {
    name: 'Yokosuka Naval Base',
    lat: 35.33,
    lng: 139.67,
    type: 'military_base',
    description: 'US 7th Fleet headquarters',
    country: 'JP',
    severity: 'low',
  },
  {
    name: 'Diego Garcia',
    lat: -7.32,
    lng: 72.42,
    type: 'military_base',
    description: 'Strategic Indian Ocean base',
    country: 'IO',
    severity: 'low',
  },
  {
    name: 'Guantánamo Bay',
    lat: 19.93,
    lng: -75.15,
    type: 'military_base',
    description: 'US Naval Station',
    country: 'CU',
    severity: 'low',
  },
  {
    name: 'Incirlik Air Base',
    lat: 37.0,
    lng: 35.43,
    type: 'military_base',
    description: 'NATO base in Turkey',
    country: 'TR',
    severity: 'low',
  },
  {
    name: 'Pine Gap',
    lat: -23.8,
    lng: 133.74,
    type: 'military_base',
    description: 'Joint US-Australia facility',
    country: 'AU',
    severity: 'low',
  },

  // Nuclear Sites
  {
    name: 'Chernobyl Exclusion Zone',
    lat: 51.39,
    lng: 30.1,
    type: 'nuclear_site',
    description: 'Former nuclear plant',
    country: 'UA',
    severity: 'medium',
  },
  {
    name: 'Zaporizhzhia Nuclear Plant',
    lat: 47.51,
    lng: 35.59,
    type: 'nuclear_site',
    description: 'Largest nuclear plant in Europe (occupied)',
    country: 'UA',
    severity: 'critical',
  },
  {
    name: 'Fukushima Daiichi',
    lat: 37.42,
    lng: 141.03,
    type: 'nuclear_site',
    description: 'Decommissioning site',
    country: 'JP',
    severity: 'medium',
  },
  {
    name: 'Bushehr Nuclear Plant',
    lat: 28.83,
    lng: 50.88,
    type: 'nuclear_site',
    description: 'Iran nuclear facility',
    country: 'IR',
    severity: 'high',
  },
  {
    name: 'Natanz Enrichment',
    lat: 33.72,
    lng: 51.72,
    type: 'nuclear_site',
    description: 'Iran enrichment facility',
    country: 'IR',
    severity: 'high',
  },
  {
    name: 'Yongbyon Nuclear',
    lat: 39.8,
    lng: 125.76,
    type: 'nuclear_site',
    description: 'North Korea nuclear complex',
    country: 'KP',
    severity: 'critical',
  },
  {
    name: 'Dimona Nuclear',
    lat: 31.05,
    lng: 35.06,
    type: 'nuclear_site',
    description: 'Israel nuclear facility',
    country: 'IL',
    severity: 'medium',
  },
  {
    name: 'Sellafield',
    lat: 54.42,
    lng: -3.5,
    type: 'nuclear_site',
    description: 'UK nuclear reprocessing',
    country: 'GB',
    severity: 'low',
  },

  // Disputed Territories
  {
    name: 'Crimea',
    lat: 45.35,
    lng: 34.0,
    type: 'disputed_territory',
    description: 'Annexed by Russia, claimed by Ukraine',
    country: 'UA',
    severity: 'high',
  },
  {
    name: 'Taiwan Strait',
    lat: 24.0,
    lng: 119.0,
    type: 'disputed_territory',
    description: 'Cross-strait tensions',
    country: 'TW',
    severity: 'high',
  },
  {
    name: 'Kashmir',
    lat: 34.0,
    lng: 76.0,
    type: 'disputed_territory',
    description: 'India-Pakistan dispute',
    country: 'IN',
    severity: 'medium',
  },
  {
    name: 'South China Sea',
    lat: 15.0,
    lng: 115.0,
    type: 'disputed_territory',
    description: 'Territorial disputes',
    country: 'CN',
    severity: 'medium',
  },
  {
    name: 'Golan Heights',
    lat: 33.0,
    lng: 35.8,
    type: 'disputed_territory',
    description: 'Occupied by Israel',
    country: 'SY',
    severity: 'medium',
  },
  {
    name: 'Western Sahara',
    lat: 24.5,
    lng: -13.0,
    type: 'disputed_territory',
    description: 'Morocco-Polisario dispute',
    country: 'MA',
    severity: 'low',
  },
  {
    name: 'Transnistria',
    lat: 47.25,
    lng: 29.4,
    type: 'disputed_territory',
    description: 'Moldova breakaway region',
    country: 'MD',
    severity: 'medium',
  },
  {
    name: 'Nagorno-Karabakh',
    lat: 39.8,
    lng: 46.75,
    type: 'disputed_territory',
    description: 'Former conflict zone',
    country: 'AZ',
    severity: 'medium',
  },
];

const GEO_KIND_MAP: Record<string, PulseKind> = {
  conflict_zone: 'war_room',
  sanctioned_country: 'geopolitical',
  military_base: 'geopolitical',
  nuclear_site: 'geopolitical',
  disputed_territory: 'geopolitical',
};

function getGeopoliticalEvents(): PulseEvent[] {
  return GEOPOLITICAL_LOCATIONS.map((loc, idx) => ({
    id: `geo-${loc.type}-${idx}-${loc.name.replace(/\s+/g, '-').toLowerCase()}`,
    kind: GEO_KIND_MAP[loc.type] ?? 'geopolitical',
    title: loc.name,
    description: `${loc.type.replace('_', ' ')} · ${loc.description}`,
    lat: loc.lat + (Math.random() - 0.5) * 1.5,
    lng: loc.lng + (Math.random() - 0.5) * 2,
    timestamp: new Date().toISOString(),
    severity: loc.severity,
    source: 'Geopolitical Intel',
    country: loc.country,
  }));
}

/* ─── Undersea Cables (Major Landing Points) ──────────────────────────── */

const CABLE_LOCATIONS = [
  { name: 'TAT-14 Landing (NJ)', lat: 40.44, lng: -74.0, cable: 'TAT-14' },
  { name: 'MAREA Landing (VA)', lat: 36.85, lng: -76.0, cable: 'MAREA' },
  { name: 'AC-1 Landing (NY)', lat: 40.65, lng: -74.05, cable: 'AC-1' },
  { name: 'SEA-ME-WE 3 (Singapore)', lat: 1.26, lng: 103.84, cable: 'SEA-ME-WE 3' },
  { name: 'SEA-ME-WE 4 (Marseille)', lat: 43.3, lng: 5.37, cable: 'SEA-ME-WE 4' },
  { name: 'FLAG/REACH (Tokyo)', lat: 35.62, lng: 139.77, cable: 'FLAG' },
  { name: 'APCN-2 (Hong Kong)', lat: 22.28, lng: 114.16, cable: 'APCN-2' },
  { name: 'SAFE (South Africa)', lat: -33.9, lng: 18.42, cable: 'SAFE' },
  { name: 'SAT-3/WASC (Lisbon)', lat: 38.72, lng: -9.14, cable: 'SAT-3' },
  { name: 'WACS (London)', lat: 51.45, lng: 0.0, cable: 'WACS' },
  { name: 'EIG (Mumbai)', lat: 19.0, lng: 72.85, cable: 'EIG' },
  { name: 'Unity (LA)', lat: 33.74, lng: -118.29, cable: 'Unity' },
  { name: 'Pacific Crossing (OR)', lat: 46.15, lng: -123.9, cable: 'PC-1' },
  { name: 'AAG (Los Angeles)', lat: 33.75, lng: -118.3, cable: 'AAG' },
  { name: 'JUPITER (Tokyo)', lat: 35.3, lng: 139.78, cable: 'JUPITER' },
];

function getCableEvents(): PulseEvent[] {
  return CABLE_LOCATIONS.map((c, idx) => ({
    id: `cable-${idx}-${c.cable}`,
    kind: 'tech_news' as const,
    title: c.name,
    description: `Undersea cable landing · ${c.cable}`,
    lat: c.lat,
    lng: c.lng,
    timestamp: new Date().toISOString(),
    severity: 'low' as const,
    source: 'Submarine Cable Map',
  }));
}

/* ─── Stock Exchanges & Financial Centers ──────────────────────────────── */

const FINANCIAL_LOCATIONS = [
  // Stock Exchanges
  { name: 'NYSE', lat: 40.71, lng: -74.01, type: 'exchange', country: 'US' },
  { name: 'NASDAQ', lat: 40.76, lng: -73.98, type: 'exchange', country: 'US' },
  { name: 'LSE', lat: 51.51, lng: -0.09, type: 'exchange', country: 'GB' },
  { name: 'Tokyo SE', lat: 35.68, lng: 139.77, type: 'exchange', country: 'JP' },
  { name: 'Shanghai SE', lat: 31.23, lng: 121.47, type: 'exchange', country: 'CN' },
  { name: 'Hong Kong EX', lat: 22.28, lng: 114.16, type: 'exchange', country: 'HK' },
  { name: 'Euronext', lat: 48.86, lng: 2.34, type: 'exchange', country: 'FR' },
  { name: 'Shenzhen SE', lat: 22.54, lng: 114.06, type: 'exchange', country: 'CN' },
  { name: 'Toronto SE', lat: 43.65, lng: -79.38, type: 'exchange', country: 'CA' },
  { name: 'BSE India', lat: 18.93, lng: 72.84, type: 'exchange', country: 'IN' },
  { name: 'Deutsche Börse', lat: 50.11, lng: 8.68, type: 'exchange', country: 'DE' },
  { name: 'KRX Seoul', lat: 37.57, lng: 126.98, type: 'exchange', country: 'KR' },
  { name: 'ASX Sydney', lat: -33.87, lng: 151.21, type: 'exchange', country: 'AU' },
  { name: 'B3 São Paulo', lat: -23.55, lng: -46.63, type: 'exchange', country: 'BR' },
  { name: 'Johannesburg SE', lat: -26.2, lng: 28.05, type: 'exchange', country: 'ZA' },
  // Financial Centers
  { name: 'Wall Street', lat: 40.71, lng: -74.01, type: 'financial', country: 'US' },
  { name: 'City of London', lat: 51.51, lng: -0.08, type: 'financial', country: 'GB' },
  { name: 'Singapore CBD', lat: 1.28, lng: 103.85, type: 'financial', country: 'SG' },
  { name: 'Hong Kong Central', lat: 22.28, lng: 114.16, type: 'financial', country: 'HK' },
  { name: 'Zurich Banking', lat: 47.37, lng: 8.54, type: 'financial', country: 'CH' },
  { name: 'Dubai DIFC', lat: 25.22, lng: 55.28, type: 'financial', country: 'AE' },
  { name: 'Frankfurt Banking', lat: 50.11, lng: 8.68, type: 'financial', country: 'DE' },
  { name: 'Tokyo Marunouchi', lat: 35.68, lng: 139.77, type: 'financial', country: 'JP' },
];

function getFinancialEvents(): PulseEvent[] {
  return FINANCIAL_LOCATIONS.map((f, idx) => ({
    id: `fin-${f.type}-${idx}-${f.name.replace(/\s+/g, '-').toLowerCase()}`,
    kind: 'geopolitical' as const,
    title: f.name,
    description: `${f.type === 'exchange' ? 'Stock Exchange' : 'Financial Center'} · ${f.country}`,
    lat: f.lat,
    lng: f.lng,
    timestamp: new Date().toISOString(),
    severity: 'low' as const,
    source: 'Financial Data',
    country: f.country,
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

    const kv = c.env.KV_CACHE;

    // Telegram cache key may have a bump suffix
    let telegramCacheKey: string = CACHE_KEYS.telegram;
    try {
      const bump = kv ? await kv.get('tg:custom-channels:bump').catch(() => null) : null;
      if (bump) telegramCacheKey = `${CACHE_KEYS.telegram}-${bump}`;
    } catch {
      /* use base key */
    }

    // ── Read per-route caches + KV fallback in parallel ────────────────
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

    // KV fallback for cache misses
    const [
      tmKv,
      tgKv,
      ransomKv,
      ddcKv,
      stealerKv,
      cveKv,
      iocKv,
      redditKv,
      xKv,
      scamKv,
      breachKv,
      phishingKv,
      malwareKv,
      detectionsKv,
      cybercrimeKv,
      writeupsKv,
      onionKv,
    ] = await Promise.all([
      tmData ? null : readKvJson(kv, 'gp:threat-map'),
      tgData ? null : readKvJson(kv, 'gp:telegram-feed'),
      ransomwareData ? null : readKvJson(kv, 'gp:ransomware-recent'),
      ddcData ? null : readKvJson(kv, 'gp:deepdarkcti'),
      stealerData ? null : readKvJson(kv, 'gp:stealer-forum-intel'),
      cveData ? null : readKvJson(kv, 'gp:cve-recent'),
      liveIocsData ? null : readKvJson(kv, 'gp:live-iocs'),
      redditData ? null : readKvJson(kv, 'gp:reddit-feed'),
      xData ? null : readKvJson(kv, 'gp:x-feed'),
      scamData ? null : readKvJson(kv, 'gp:crypto-scam-feed'),
      breachData ? null : readKvJson(kv, 'gp:breach-disclosures'),
      phishingData ? null : readKvJson(kv, 'gp:phishing-urls'),
      malwareData ? null : readKvJson(kv, 'gp:malware-samples'),
      detectionsData ? null : readKvJson(kv, 'gp:detections'),
      cybercrimeData ? null : readKvJson(kv, 'gp:cyber-crime'),
      writeupsData ? null : readKvJson(kv, 'gp:writeups'),
      onionData ? null : readKvJson(kv, 'gp:onion-watch'),
    ]);

    // Merge cache + KV
    const finalTm = tmData ?? tmKv;
    const finalTg = tgData ?? tgKv;
    const finalRansom = ransomwareData ?? ransomKv;
    const finalDdc = ddcData ?? ddcKv;
    const finalStealer = stealerData ?? stealerKv;
    const finalCve = cveData ?? cveKv;
    const finalIoc = liveIocsData ?? iocKv;
    const finalReddit = redditData ?? redditKv;
    const finalX = xData ?? xKv;
    const finalScam = scamData ?? scamKv;
    const finalBreach = breachData ?? breachKv;
    const finalPhishing = phishingData ?? phishingKv;
    const finalMalware = malwareData ?? malwareKv;
    const finalDetections = detectionsData ?? detectionsKv;
    const finalCybercrime = cybercrimeData ?? cybercrimeKv;
    const finalWriteups = writeupsData ?? writeupsKv;
    const finalOnion = onionData ?? onionKv;

    // ── Direct endpoint fallback for still-missing layers ─────────────
    // Fetch ALL missing endpoints directly (Workers allow up to 50 subrequests).
    // This is critical for the globe to have data when cache is cold.
    const fetchDirect = async (path: string): Promise<unknown | null> => {
      try {
        const res = await fetch(`https://pranithjain.qzz.io${path}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    // Build list of all missing endpoints — fetch them all in parallel
    const missing: Array<[string, string]> = [];
    if (!finalTm) missing.push(['/api/v1/threat-map', 'tm']);
    if (!finalReddit) missing.push(['/api/v1/reddit-feed', 'reddit']);
    if (!finalX) missing.push(['/api/v1/x-feed', 'x']);
    if (!finalCve) missing.push(['/api/v1/cve-recent?days=7', 'cve']);
    if (!finalRansom) missing.push(['/api/v1/ransomware-recent?days=7', 'ransom']);
    if (!finalBreach) missing.push(['/api/v1/breach-disclosures', 'breach']);
    if (!finalIoc) missing.push(['/api/v1/live-iocs', 'ioc']);
    if (!finalPhishing) missing.push(['/api/v1/phishing-urls', 'phishing']);
    if (!finalMalware) missing.push(['/api/v1/malware-samples', 'malware']);
    if (!finalScam) missing.push(['/api/v1/crypto-scam-feed', 'scam']);

    // Fetch all missing in parallel (Workers subrequest limit is 50)
    const directResults = await Promise.all(missing.map(([path]) => fetchDirect(path)));

    // Apply direct results to fill in all gaps
    const direct: Record<string, unknown> = {};
    for (let i = 0; i < missing.length; i++) {
      const [, key] = missing[i];
      const data = directResults[i];
      if (data) direct[key] = data;
    }

    // Final merged data — cache/KV takes priority, direct is fallback
    const mergedTm = finalTm ?? (direct.tm as typeof finalTm);
    const mergedReddit = finalReddit ?? (direct.reddit as typeof finalReddit);
    const mergedX = finalX ?? (direct.x as typeof finalX);
    const mergedCve = finalCve ?? (direct.cve as typeof finalCve);
    const mergedRansom = finalRansom ?? (direct.ransom as typeof finalRansom);
    const mergedBreach = finalBreach ?? (direct.breach as typeof finalBreach);
    const mergedIoc = finalIoc ?? (direct.ioc as typeof finalIoc);
    const mergedPhishing = finalPhishing ?? (direct.phishing as typeof finalPhishing);
    const mergedMalware = finalMalware ?? (direct.malware as typeof finalMalware);
    const mergedScam = finalScam ?? (direct.scam as typeof finalScam);

    // ── Convert → events ───────────────────────────────────────────────
    const safe = <T>(fn: () => T): T => {
      try {
        return fn();
      } catch {
        return [] as unknown as T;
      }
    };
    const iocEvents = safe(() =>
      mergedTm ? iocFromThreatMap(mergedTm as Parameters<typeof iocFromThreatMap>[0]) : []
    );

    // Fetch threat map directly if cache is empty
    let finalIocEvents = iocEvents;
    if (finalIocEvents.length === 0) {
      try {
        const tmRes = await fetch('https://pranithjain.qzz.io/api/v1/threat-map', {
          signal: AbortSignal.timeout(10000),
        });
        if (tmRes.ok) {
          const tmData = (await tmRes.json()) as Parameters<typeof iocFromThreatMap>[0];
          finalIocEvents = safe(() => iocFromThreatMap(tmData));
        }
      } catch {
        /* degraded */
      }
    }
    const redditEvents = safe(() => (mergedReddit ? fromReddit(mergedReddit as Parameters<typeof fromReddit>[0]) : []));
    const telegramEvents = safe(() => (finalTg ? fromTelegram(finalTg) : []));
    const xEvents = safe(() => (mergedX ? fromXFeed(mergedX) : []));
    const scamEvents = safe(() => (mergedScam ? fromScam(mergedScam) : []));
    const breachEvents = safe(() => (mergedBreach ? fromBreaches(mergedBreach) : []));
    const liveIocEvents = safe(() => (mergedIoc ? fromLiveIocs(mergedIoc) : []));
    const darkwebEvents = safe(() => [
      ...(finalDdc ? fromDeepdarkcti(finalDdc) : []),
      ...(finalOnion ? fromOnionWatch(finalOnion) : []),
    ]);
    const infostealerEvents = safe(() => (finalStealer ? fromStealerForum(finalStealer) : []));
    const phishingEvents = safe(() => (mergedPhishing ? fromPhishing(mergedPhishing) : []));
    const malwareEvents = safe(() => (mergedMalware ? fromMalware(mergedMalware) : []));
    const ransomwareEvents = safe(() => (mergedRansom ? fromRansomware(mergedRansom) : []));
    const detectionEvents = safe(() => (finalDetections ? fromDetections(finalDetections) : []));
    const cybercrimeEvents = safe(() => (finalCybercrime ? fromCybercrime(finalCybercrime) : []));
    const researchEvents = safe(() => (finalWriteups ? fromWriteups(finalWriteups) : []));
    const cveEvents = safe(() => (mergedCve ? fromCveRecent(mergedCve) : []));

    // Fetch earthquakes directly from USGS (cache was never populated)
    const earthquakes = await fetchEarthquakes();

    // Fetch CVE data directly if cache is empty
    let finalCveEvents = cveEvents;
    if (finalCveEvents.length === 0) {
      try {
        const cveRes = await fetch('https://pranithjain.qzz.io/api/v1/cve-recent?days=7', {
          signal: AbortSignal.timeout(10000),
        });
        if (cveRes.ok) {
          const cveData = (await cveRes.json()) as Parameters<typeof fromCveRecent>[0];
          finalCveEvents = safe(() => fromCveRecent(cveData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch additional geo-located data from free public APIs (inspired by World Monitor)
    const [
      naturalEvents,
      flights,
      gdacsAlerts,
      botnetC2,
      dshieldAttackers,
      compromisedIPs,
      blocklistAttackers,
      cisaKev,
      urlhausMalware,
    ] = await Promise.all([
      fetchNaturalEvents(),
      fetchFlights(),
      fetchGdacsAlerts(),
      fetchBotnetC2(),
      fetchDShieldAttackers(),
      fetchCompromisedIPs(),
      fetchBlocklistAttackers(),
      fetchCisaKev(),
      fetchUrlhaus(),
    ]);

    // Tech infrastructure (static data — no network needed)
    const techInfra = getTechInfrastructureEvents();

    // Geopolitical hotspots (static data — conflicts, sanctions, military, nuclear)
    const geopoliticalEvents = getGeopoliticalEvents();

    // Additional static data layers (cables, financial centers)
    const cableEvents = getCableEvents();
    const financialEvents = getFinancialEvents();

    // Briefings (D1)
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

    // ── Merge + sort ───────────────────────────────────────────────────
    const allEvents = [
      ...earthquakes,
      ...naturalEvents,
      ...gdacsAlerts,
      ...flights,
      ...botnetC2,
      ...dshieldAttackers,
      ...compromisedIPs,
      ...blocklistAttackers,
      ...cisaKev,
      ...urlhausMalware,
      ...techInfra,
      ...geopoliticalEvents,
      ...cableEvents,
      ...financialEvents,
      ...finalIocEvents,
      ...liveIocEvents,
      ...ransomwareEvents,
      ...darkwebEvents,
      ...infostealerEvents,
      ...phishingEvents,
      ...malwareEvents,
      ...finalCveEvents,
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
        ioc_activity: finalIocEvents.length,
        geopolitical:
          naturalEvents.length +
          gdacsAlerts.length +
          geopoliticalEvents.filter((e) => e.kind === 'geopolitical').length +
          financialEvents.length,
        tech_news: techInfra.length + cableEvents.length,
        war_room:
          naturalEvents.filter((e) => e.kind === 'war_room').length +
          geopoliticalEvents.filter((e) => e.kind === 'war_room').length,
        aircraft: flights.length,
        c2_tracker: botnetC2.length,
        cisa_advisory: cisaKev.length,
        blocklist: blocklistAttackers.length + compromisedIPs.length,
        cyber_attack: liveIocEvents.length + dshieldAttackers.length,
        reddit: redditEvents.length,
        telegram: telegramEvents.length,
        x_feed: xEvents.length,
        scam: scamEvents.length,
        breach: breachEvents.length,
        briefing: briefingEvents.length,
        darkweb: darkwebEvents.length,
        infostealer: infostealerEvents.length,
        phishing: phishingEvents.length,
        malware: malwareEvents.length + urlhausMalware.length,
        ransomware: ransomwareEvents.length,
        detection: detectionEvents.length,
        cybercrime: cybercrimeEvents.length,
        research: researchEvents.length,
        cve: finalCveEvents.length,
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

    // Write source data to KV in background (globally replicated fallback)
    // This ensures other colos can read data even if their local cache is cold.
    if (kv) {
      const kvWrites: Array<Promise<void>> = [];
      const kvMap: Array<[string, unknown]> = [
        ['gp:threat-map', tmData],
        ['gp:telegram-feed', tgData],
        ['gp:x-feed', xData],
        ['gp:reddit-feed', redditData],
        ['gp:cve-recent', cveData],
        ['gp:ransomware-recent', ransomwareData],
        ['gp:breach-disclosures', breachData],
        ['gp:deepdarkcti', ddcData],
        ['gp:live-iocs', liveIocsData],
        ['gp:crypto-scam-feed', scamData],
        ['gp:phishing-urls', phishingData],
        ['gp:malware-samples', malwareData],
        ['gp:detections', detectionsData],
        ['gp:cyber-crime', cybercrimeData],
        ['gp:writeups', writeupsData],
        ['gp:onion-watch', onionData],
        ['gp:stealer-forum-intel', stealerData],
      ];
      for (const [key, val] of kvMap) {
        if (val) {
          kvWrites.push(kv.put(key, JSON.stringify(val), { expirationTtl: 3600 }).catch(() => {}));
        }
      }
      c.executionCtx.waitUntil(Promise.all(kvWrites));
    }

    return response;
  } catch (e) {
    console.error('global-pulse error:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'internal_error', message: e instanceof Error ? e.message : 'unknown' }, 500);
  }
}
