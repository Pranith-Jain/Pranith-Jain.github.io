/**
 * World Intel — live data feeds from free public APIs.
 *
 * Mirrors the domain coverage of world-intel-mcp (github.com/marc-shade/world-intel-mcp)
 * but runs natively in the Cloudflare Worker. All sources are free, unauthenticated
 * public APIs with Cache-API TTL caching.
 */

const TIMEOUT_MS = 20_000;

async function cachedJson<T = unknown>(
  url: string,
  cacheKey: string,
  ttl: number,
  params?: Record<string, string>,
): Promise<T | null> {
  const fullUrl = params
    ? `${url}?${new URLSearchParams(params).toString()}`
    : url;
  try {
    const res = await fetch(fullUrl, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-world-intel/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: ttl },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function cachedText(
  url: string,
  cacheKey: string,
  ttl: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml,text/xml', 'user-agent': 'pranithjain-world-intel/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: ttl },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Cyber Threats (CISA KEV + URLhaus + Feodo + SANS DShield) ─────────

interface FeodoEntry {
  ip_address?: string;
  malware?: string;
  port?: number;
  status?: string;
  hostname?: string;
  as_number?: number;
  as_name?: string;
  country?: string;
  first_seen?: string;
  last_online?: string;
}

interface CisaKevEntry {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
}

interface UrlhausEntry {
  url?: string;
  url_status?: string;
  threat?: string;
  tags?: string[];
  dateadded?: string;
  reporter?: string;
}

interface SansEntry {
  ip?: string;
  count?: number;
  attacks?: number;
  firstseen?: string;
  lastseen?: string;
  asname?: string;
  ascountry?: string;
}

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function fetchCyberThreats(limit = 50) {
  const [feodoData, cisaData, urlhausData, sansData] = await Promise.all([
    cachedJson<FeodoEntry[]>(
      'https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json',
      'cyber:feodo', 1800,
    ),
    cachedJson<{ vulnerabilities?: CisaKevEntry[] }>(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      'cyber:cisa-kev', 3600,
    ),
    cachedJson<{ urls?: UrlhausEntry[] }>(
      'https://urlhaus-api.abuse.ch/v1/urls/recent/limit/25/',
      'cyber:urlhaus', 900,
    ),
    cachedJson<SansEntry[]>(
      'https://isc.sans.edu/api/topips/records/20?json',
      'cyber:sans', 1800,
    ),
  ]);

  const cutoff30d = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const threats: Array<{
    type: string; indicator: string; threat: string; severity: string;
    source_feed: string; first_seen: string; details: Record<string, unknown>;
  }> = [];

  for (const e of feodoData ?? []) {
    const sev = (e.status ?? '').toLowerCase() === 'online' ? 'critical' : 'medium';
    threats.push({
      type: 'c2_ip', indicator: e.ip_address ?? '', threat: e.malware ?? 'unknown',
      severity: sev, source_feed: 'feodo-tracker', first_seen: e.first_seen ?? '',
      details: { port: e.port, status: e.status, hostname: e.hostname, as_name: e.as_name, country: e.country },
    });
  }

  for (const v of cisaData?.vulnerabilities ?? []) {
    if ((v.dateAdded ?? '') < cutoff30d) continue;
    const isRansom = (v.knownRansomwareCampaignUse ?? '').toLowerCase() === 'known';
    threats.push({
      type: 'vulnerability', indicator: v.cveID ?? '',
      threat: `${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`,
      severity: isRansom ? 'critical' : 'high', source_feed: 'cisa-kev',
      first_seen: v.dateAdded ?? '',
      details: { vendor: v.vendorProject, product: v.product, ransomware_use: v.knownRansomwareCampaignUse },
    });
  }

  for (const u of urlhausData?.urls ?? []) {
    const online = (u.url_status ?? '').toLowerCase() === 'online';
    threats.push({
      type: 'malware_url', indicator: u.url ?? '', threat: u.threat ?? 'unknown',
      severity: online ? 'high' : 'low', source_feed: 'urlhaus',
      first_seen: u.dateadded ?? '',
      details: { url_status: u.url_status, tags: u.tags },
    });
  }

  for (const s of sansData ?? []) {
    if (!s.ip) continue;
    threats.push({
      type: 'attack_ip', indicator: s.ip,
      threat: `DShield top attacker (${s.attacks ?? 0} attacks)`,
      severity: 'high', source_feed: 'sans-dshield', first_seen: s.firstseen ?? '',
      details: { attacks: s.attacks, as_name: s.asname, as_country: s.ascountry },
    });
  }

  threats.sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3));
  const limited = threats.slice(0, limit);
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const t of limited) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
    bySeverity[t.severity] = (bySeverity[t.severity] ?? 0) + 1;
  }
  return { threats: limited, count: limited.length, byType, bySeverity, source: 'cyber-feeds', timestamp: new Date().toISOString() };
}

// ─── Earthquakes (USGS) ────────────────────────────────────────────────

interface UsgsFeature {
  properties?: { mag?: number; place?: string; time?: number; type?: string; url?: string; felt?: number; tsunami?: number; status?: string };
  geometry?: { coordinates?: [number, number, number] };
}

export async function fetchEarthquakes(minMag = 4.5, limit = 50) {
  const data = await cachedJson<{ features?: UsgsFeature[] }>(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
    'world-intel:quakes', 300,
  );
  const features = (data?.features ?? [])
    .filter((f) => (f.properties?.mag ?? 0) >= minMag)
    .slice(0, limit)
    .map((f) => ({
      mag: f.properties?.mag,
      place: f.properties?.place,
      time: f.properties?.time,
      type: f.properties?.type,
      url: f.properties?.url,
      felt: f.properties?.felt,
      tsunami: f.properties?.tsunami,
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
      depth: f.geometry?.coordinates?.[2],
    }));
  return { earthquakes: features, count: features.length, source: 'usgs', timestamp: new Date().toISOString() };
}

// ─── Wildfires & Natural Disasters (NASA EONET) ────────────────────────

interface EonetGeometry {
  date?: string;
  type?: string;
  coordinates?: [number, number];
  magnitudeValue?: number;
  magnitudeUnit?: string;
}

interface EonetEvent {
  id?: string;
  title?: string;
  description?: string | null;
  link?: string;
  closed?: string | null;
  categories?: Array<{ id?: string; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: EonetGeometry[];
}

interface EonetResponse {
  title?: string;
  events?: EonetEvent[];
}

async function fetchEonet(category: string, limit: number): Promise<EonetEvent[]> {
  const data = await cachedJson<EonetResponse>(
    `https://eonet.gsfc.nasa.gov/api/v3/events?category=${category}&limit=${limit}&status=open`,
    `world-intel:eonet:${category}`, 600,
  );
  return data?.events ?? [];
}

export async function fetchWildfires(limit = 100) {
  const [wildfires, severeStorms, volcanoes, seaLakeIce] = await Promise.all([
    fetchEonet('wildfires', limit),
    fetchEonet('severeStorms', Math.min(limit, 30)),
    fetchEonet('volcanoes', Math.min(limit, 20)),
    fetchEonet('seaLakeIce', Math.min(limit, 20)),
  ]);

  const mapEvent = (e: EonetEvent) => {
    const latestGeo = e.geometry?.[e.geometry.length - 1];
    return {
      id: e.id,
      title: e.title,
      category: e.categories?.[0]?.title ?? 'unknown',
      lat: latestGeo?.coordinates?.[1],
      lon: latestGeo?.coordinates?.[0],
      date: latestGeo?.date,
      magnitude: latestGeo?.magnitudeValue,
      magnitudeUnit: latestGeo?.magnitudeUnit,
      source_url: e.sources?.[0]?.url,
      closed: e.closed,
    };
  };

  const all = [
    ...wildfires.map(mapEvent),
    ...severeStorms.map(mapEvent),
    ...volcanoes.map(mapEvent),
    ...seaLakeIce.map(mapEvent),
  ];

  return {
    events: all,
    count: all.length,
    breakdown: {
      wildfires: wildfires.length,
      severeStorms: severeStorms.length,
      volcanoes: volcanoes.length,
      seaLakeIce: seaLakeIce.length,
    },
    source: 'nasa-eonet',
    timestamp: new Date().toISOString(),
  };
}

// ─── Internet Outages (IODA) ────────────────────────────────────────────

interface IodaEntity {
  entity?: { code?: string; name?: string };
  events?: Array<{ id?: string; from?: string; until?: string; summary?: string; level?: string }>;
}

export async function fetchInternetOutages() {
  const since = Math.floor((Date.now() - 7 * 86400_000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const data = await cachedJson<IodaEntity[] | { data?: IodaEntity[] }>(
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/overall?from=${since}&until=${until}&limit=20`,
    'world-intel:outages', 300,
  );
  const items = Array.isArray(data) ? data : (data?.data ?? []);
  let ongoing = 0;
  const outages: Array<{
    id?: string; start?: string; end?: string; description: string;
    scope: string; countries: string[]; is_ongoing: boolean;
  }> = [];
  for (const item of items) {
    const entity = item.entity ?? {};
    const events = item.events ?? [];
    for (const ev of events) {
      const isOngoing = !ev.until;
      if (isOngoing) ongoing++;
      outages.push({
        id: ev.id ?? entity.code,
        start: ev.from,
        end: ev.until,
        description: ev.summary ?? entity.name ?? '',
        scope: ev.level ?? 'unknown',
        countries: entity.code ? [entity.code] : [],
        is_ongoing: isOngoing,
      });
    }
  }
  return { outages, ongoing_count: ongoing, total_7d: outages.length, source: 'ioda', timestamp: new Date().toISOString() };
}

// ─── Disease Outbreaks (WHO DON) ────────────────────────────────────────

export async function fetchDiseaseOutbreaks(limit = 30) {
  // WHO DON RSS moved; use the general news feed as fallback
  const xml = await cachedText(
    'https://www.who.int/rss-feeds/news-english.xml',
    'world-intel:who-don', 3600,
  );
  if (!xml) return { outbreaks: [], count: 0, source: 'who-don', timestamp: new Date().toISOString() };

  const items: Array<{ title: string; link: string; published: string; summary: string }> = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    const block = m[1] ?? '';
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>(.*?)<\/description>/)?.[1] ?? '';
    items.push({ title: title.trim(), link: link.trim(), published: pub.trim(), summary: desc.replace(/<[^>]+>/g, '').trim().slice(0, 200) });
    if (items.length >= limit) break;
  }
  return { outbreaks: items, count: items.length, source: 'who-don', timestamp: new Date().toISOString() };
}

// ─── Space Weather (NOAA SWPC) ──────────────────────────────────────────

export async function fetchSpaceWeather() {
  const [kpData, alertsData] = await Promise.all([
    cachedJson<Array<{ kp?: number; time_tag?: string }>>(
      'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
      'world-intel:kp', 600,
    ),
    cachedJson<Array<{ product?: string; issue_datetime?: string; summary?: string }>>(
      'https://services.swpc.noaa.gov/products/noaa-space-weather-alerts.json',
      'world-intel:alerts', 600,
    ),
  ]);

  const kp = kpData?.[0]?.kp ?? null;
  const kpTimestamp = kpData?.[0]?.time_tag ?? null;
  const kpLevel = kp === null ? 'unknown'
    : kp >= 8 ? 'G5-extreme'
    : kp >= 7 ? 'G4-severe'
    : kp >= 6 ? 'G3-strong'
    : kp >= 5 ? 'G2-moderate'
    : kp >= 4 ? 'G1-minor'
    : 'quiet';

  const alerts = (alertsData ?? []).slice(0, 10).map((a) => ({
    product: a.product, issued: a.issue_datetime, summary: a.summary,
  }));

  return {
    kp_index: kp, kp_level: kpLevel, kp_timestamp: kpTimestamp,
    alerts, source: 'noaa-swpc', timestamp: new Date().toISOString(),
  };
}

// ─── GDELT News Search ─────────────────────────────────────────────────

export async function fetchGdeltSearch(query: string, limit = 30) {
  // GDELT rate-limits aggressively (429). Retry once after a short delay.
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await cachedJson<{ articles?: Array<{
      title?: string; url?: string; seendate?: string;
      socialimage?: string; domain?: string; language?: string; sourcecountry?: string;
    }> }>(
      'https://api.gdeltproject.org/api/v2/doc/doc',
      'world-intel:gdelt', 600,
      { query, mode: 'artlist', maxrecords: String(limit), format: 'json' },
    );
    if (data?.articles && data.articles.length > 0) {
      const articles = data.articles.map((a) => ({
        title: a.title, url: a.url, date: a.seendate,
        image: a.socialimage, domain: a.domain,
        language: a.language, country: a.sourcecountry,
      }));
      return { articles, count: articles.length, query, source: 'gdelt', timestamp: new Date().toISOString() };
    }
    // GDELT returned empty or rate-limited — wait before retry
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
  }
  return { articles: [], count: 0, query, source: 'gdelt', timestamp: new Date().toISOString(), note: 'GDELT rate-limited or no results' };
}

// ─── Maritime Warnings (NGA MSI) ────────────────────────────────────────

interface NgaWarning {
  msgYear?: number;
  msgNumber?: string;
  navArea?: string;
  subregion?: string;
  status?: string;
  text?: string;
  issueDate?: string;
}

export async function fetchMaritimeWarnings(limit = 50) {
  const data = await cachedJson<NgaWarning[] | { 'broadcast-warn'?: NgaWarning[] }>(
    'https://msi.nga.mil/api/publications/broadcast-warn?output=json',
    'world-intel:maritime', 300,
  );
  const warnings = (Array.isArray(data) ? data : (data?.['broadcast-warn'] ?? [])).slice(0, limit).map((w) => ({
    msgYear: w.msgYear, msgNumber: w.msgNumber, navArea: w.navArea,
    subregion: w.subregion, status: w.status, issueDate: w.issueDate,
    text: (w.text ?? '').slice(0, 300),
  }));
  return { warnings, count: warnings.length, source: 'nga-msi', timestamp: new Date().toISOString() };
}

// ─── Military Flights (adsb.lol) ────────────────────────────────────────

interface AdsblolAc {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
  squawk?: string;
  t?: string;
  r?: string;
}

export async function fetchMilitaryFlights(limit = 100) {
  const data = await cachedJson<{ ac?: AdsblolAc[] }>(
    'https://api.adsb.lol/v2/mil',
    'world-intel:mil-flights', 300,
  );
  const aircraft = (data?.ac ?? [])
    .filter((a) => a.lat != null && a.lon != null)
    .slice(0, limit)
    .map((a) => ({
      icao24: a.hex, callsign: (a.flight ?? '').trim() || null,
      lat: a.lat, lon: a.lon, altitude: a.alt_baro,
      speed: a.gs, heading: a.track, squawk: a.squawk,
      type: a.t, registration: a.r,
    }));
  return { aircraft, count: aircraft.length, source: 'adsb.lol', timestamp: new Date().toISOString() };
}

// ─── Strategic Infrastructure (static config) ──────────────────────────

export const MILITARY_BASES = [
  { name: 'Ramstein', operator: 'USA', country: 'Germany', lat: 49.4369, lon: 7.6003, type: 'air_base', branch: 'USAF' },
  { name: 'Guantanamo Bay', operator: 'USA', country: 'Cuba', lat: 19.9048, lon: -75.1449, type: 'naval_base', branch: 'US Navy' },
  { name: 'Diego Garcia', operator: 'USA', country: 'British Indian Ocean Territory', lat: -7.3195, lon: 72.4229, type: 'naval_base', branch: 'US Navy' },
  { name: 'Yokosuka', operator: 'USA', country: 'Japan', lat: 35.2810, lon: 139.6686, type: 'naval_base', branch: 'US Navy' },
  { name: 'Kadena', operator: 'USA', country: 'Japan', lat: 26.3517, lon: 127.7689, type: 'air_base', branch: 'USAF' },
  { name: 'Camp Humphreys', operator: 'USA', country: 'South Korea', lat: 36.9630, lon: 126.9874, type: 'army_base', branch: 'US Army' },
  { name: 'Aviano', operator: 'USA', country: 'Italy', lat: 46.0322, lon: 12.5995, type: 'air_base', branch: 'USAF' },
  { name: 'Rota', operator: 'USA', country: 'Spain', lat: 36.6453, lon: -6.3494, type: 'naval_base', branch: 'US Navy' },
  { name: 'Souda Bay', operator: 'USA', country: 'Greece', lat: 35.4865, lon: 24.1190, type: 'naval_base', branch: 'US Navy' },
  { name: 'Incirlik', operator: 'USA', country: 'Turkey', lat: 37.0021, lon: 35.4259, type: 'air_base', branch: 'USAF' },
  { name: 'Al Udeid', operator: 'USA', country: 'Qatar', lat: 25.1175, lon: 51.5644, type: 'air_base', branch: 'USAF' },
  { name: 'Bagram', operator: 'USA', country: 'Afghanistan', lat: 34.9464, lon: 69.2650, type: 'air_base', branch: 'USAF' },
  { name: 'Misawa', operator: 'USA', country: 'Japan', lat: 40.7032, lon: 141.3679, type: 'air_base', branch: 'USAF' },
  { name: 'Lakenheath', operator: 'USA', country: 'United Kingdom', lat: 52.4094, lon: 0.5608, type: 'air_base', branch: 'USAF' },
  { name: 'Spangdahlem', operator: 'USA', country: 'Germany', lat: 49.9778, lon: 6.6925, type: 'air_base', branch: 'USAF' },
  { name: 'Yokota', operator: 'USA', country: 'Japan', lat: 35.7486, lon: 139.3478, type: 'air_base', branch: 'USAF' },
  { name: 'Camp Lemonnier', operator: 'USA', country: 'Djibouti', lat: 11.5474, lon: 43.1447, type: 'naval_base', branch: 'US Navy' },
  { name: 'Naval Station Norfolk', operator: 'USA', country: 'USA', lat: 36.9467, lon: -76.3308, type: 'naval_base', branch: 'US Navy' },
  { name: 'Joint Base Pearl Harbor', operator: 'USA', country: 'USA', lat: 21.3599, lon: -157.9750, type: 'naval_base', branch: 'US Navy' },
  { name: 'Khe Sanh', operator: 'VNM', country: 'Vietnam', lat: 16.6975, lon: 106.0983, type: 'army_base', branch: 'VPA' },
  { name: 'Severomorsk', operator: 'RUS', country: 'Russia', lat: 69.0729, lon: 33.4150, type: 'naval_base', branch: 'VMF' },
  { name: 'Vladivostok', operator: 'RUS', country: 'Russia', lat: 43.1056, lon: 131.8735, type: 'naval_base', branch: 'VMF' },
  { name: 'Kaliningrad', operator: 'RUS', country: 'Russia', lat: 54.7104, lon: 20.4522, type: 'naval_base', branch: 'VMF' },
  { name: 'Yamato', operator: 'JPN', country: 'Japan', lat: 34.2500, lon: 135.6000, type: 'air_base', branch: 'JASDF' },
  { name: 'Hainan (Yulin)', operator: 'CHN', country: 'China', lat: 18.2000, lon: 109.5833, type: 'naval_base', branch: 'PLAN' },
];

export const STRATEGIC_PORTS = [
  { name: 'Strait of Malacca', lat: 2.5, lon: 101.5, type: 'chokepoint', oil_flow_mbd: 16 },
  { name: 'Strait of Hormuz', lat: 26.5, lon: 56.3, type: 'chokepoint', oil_flow_mbd: 21 },
  { name: 'Suez Canal', lat: 30.5, lon: 32.3, type: 'canal', oil_flow_mbd: 5.5 },
  { name: 'Panama Canal', lat: 9.1, lon: -79.7, type: 'canal', oil_flow_mbd: 1 },
  { name: 'Bab el-Mandeb', lat: 12.6, lon: 43.3, type: 'chokepoint', oil_flow_mbd: 6.2 },
  { name: 'Cape of Good Hope', lat: -34.4, lon: 18.5, type: 'route', oil_flow_mbd: 3 },
  { name: 'Turkish Straits (Bosphorus)', lat: 41.1, lon: 29.1, type: 'chokepoint', oil_flow_mbd: 3.5 },
  { name: 'Danish Straits (Oresund)', lat: 55.9, lon: 12.7, type: 'chokepoint', oil_flow_mbd: 0 },
  { name: 'Tsugaru Strait', lat: 41.5, lon: 140.5, type: 'chokepoint', oil_flow_mbd: 0 },
  { name: 'Lombok Strait', lat: -8.5, lon: 115.8, type: 'chokepoint', oil_flow_mbd: 0 },
];

export const TRADE_ROUTES = STRATEGIC_PORTS;

export function queryBases(filters: { operator?: string; country?: string; type?: string }) {
  let bases = MILITARY_BASES;
  if (filters.operator) bases = bases.filter((b) => b.operator === filters.operator!.toUpperCase());
  if (filters.country) bases = bases.filter((b) => b.country.toLowerCase().includes(filters.country!.toLowerCase()));
  if (filters.type) bases = bases.filter((b) => b.type === filters.type);
  return bases;
}

export function queryPorts(filters: { type?: string; country?: string }) {
  let ports = STRATEGIC_PORTS;
  if (filters.type) ports = ports.filter((p) => p.type === filters.type);
  return ports;
}
