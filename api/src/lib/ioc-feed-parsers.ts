/**
 * ioc-feed-parsers.ts
 * Pure parsing functions for each IOC feed format.
 * No network calls — takes raw text/object, returns normalized entries.
 */

export type IocType = 'url' | 'domain' | 'ipv4' | 'hash' | 'cve';

export interface IocEntry {
  type: IocType;
  value: string;
  context?: string;
  timestamp?: string;
}

export interface IocFeedSummary {
  source: 'urlhaus' | 'malwarebazaar' | 'threatfox' | 'feodo' | 'openphish' | 'cisa-kev';
  source_name: string;
  fetched_at: string;
  count: number;
  total_in_feed?: number;
  entries: IocEntry[];
  cache_control_seconds: number;
}

const CAP = 100;
const CACHE_TTL = 1800;

/** Strip surrounding double-quotes from a CSV field value */
function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

/**
 * Split a CSV line respecting double-quoted fields (basic RFC 4180).
 * Does NOT handle newlines inside quoted fields (feeds don't use them).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Parse non-empty, non-comment lines from a CSV body */
function csvLines(body: string): string[][] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map(splitCsvLine);
}

// ─── URLhaus ────────────────────────────────────────────────────────────────
// Columns: id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
// Feed is newest-first → take first CAP rows.

export function parseUrlhaus(body: string): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 3) continue;
    const value = unquote(cols[2]);
    if (!value) continue;
    const threat = unquote(cols[5] ?? '');
    const tags = unquote(cols[6] ?? '');
    const context = [threat, tags].filter(Boolean).join(' | ') || undefined;
    const timestamp = unquote(cols[1] ?? '') || undefined;
    entries.push({ type: 'url', value, context, timestamp });
    if (entries.length >= CAP) break;
  }
  return entries;
}

// ─── MalwareBazaar ──────────────────────────────────────────────────────────
// Columns: first_seen_utc(0), sha256_hash(1), md5_hash(2), sha1_hash(3),
//          reporter(4), file_name(5), file_type_guess(6), mime_type(7),
//          signature(8), clamav(9), vtpercent(10), imphash(11), ssdeep(12), tlsh(13)
// Feed is newest-first → take first CAP rows.

export function parseMalwarebazaar(body: string): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 2) continue;
    const value = unquote(cols[1]);
    if (!value) continue;
    const signature = unquote(cols[8] ?? '');
    const fileType = unquote(cols[6] ?? '');
    const context = [signature, fileType].filter(Boolean).join(' | ') || undefined;
    const timestamp = unquote(cols[0] ?? '') || undefined;
    entries.push({ type: 'hash', value, context, timestamp });
    if (entries.length >= CAP) break;
  }
  return entries;
}

// ─── ThreatFox ───────────────────────────────────────────────────────────────
// Columns: first_seen(0), ioc_id(1), ioc_value(2), ioc_type(3),
//          threat_type(4), fk_malware(5), malware_alias(6), malware_printable(7),
//          last_seen(8), confidence_level(9), reference(10), tags(11),
//          anonymous(12), reporter(13)
// ioc_type → our type mapping:
//   ip:port → ipv4 (strip port)
//   domain → domain
//   url → url
//   md5_hash / sha1_hash / sha256_hash → hash

function threatfoxIocType(raw: string): IocType | null {
  const t = raw.toLowerCase().trim();
  if (t.startsWith('ip:port')) return 'ipv4';
  if (t === 'domain') return 'domain';
  if (t === 'url') return 'url';
  if (t.includes('hash')) return 'hash';
  return null;
}

export function parseThreatfox(body: string): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 4) continue;
    const rawType = unquote(cols[3]);
    const type = threatfoxIocType(rawType);
    if (!type) continue;
    let value = unquote(cols[2]);
    if (!value) continue;
    // For ip:port, strip the port part
    if (type === 'ipv4') {
      const colon = value.lastIndexOf(':');
      if (colon !== -1 && colon > value.indexOf(':')) {
        // IPv6-style or ip:port — strip port if it's ip:port
        value = value.substring(0, colon);
      } else if (colon !== -1) {
        value = value.substring(0, colon);
      }
    }
    const context = unquote(cols[7] ?? '') || undefined;
    const timestamp = unquote(cols[0] ?? '') || undefined;
    entries.push({ type, value, context, timestamp });
    if (entries.length >= CAP) break;
  }
  return entries;
}

// ─── Feodo ───────────────────────────────────────────────────────────────────
// Columns: first_seen(0), ip(1), port(2), malware(3), last_online(4)
// Feed is newest-first → take first CAP rows.

export function parseFeodo(body: string): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 2) continue;
    const value = unquote(cols[1]);
    if (!value) continue;
    const context = unquote(cols[3] ?? '') || undefined;
    const timestamp = unquote(cols[0] ?? '') || undefined;
    entries.push({ type: 'ipv4', value, context, timestamp });
    if (entries.length >= CAP) break;
  }
  return entries;
}

// ─── OpenPhish ───────────────────────────────────────────────────────────────
// Plain text, one URL per line.

export function parseOpenPhish(body: string): IocEntry[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('http://') || l.startsWith('https://')))
    .slice(0, CAP)
    .map((value) => ({ type: 'url' as IocType, value }));
}

// ─── CISA KEV ────────────────────────────────────────────────────────────────
// JSON: { vulnerabilities: Array<{ cveID, vendorProject, product, vulnerabilityName, dateAdded, ... }> }
// Sorted oldest-first in the feed → take last CAP rows (newest).

interface CisaVuln {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
}

interface CisaKevJson {
  vulnerabilities?: CisaVuln[];
  total?: number;
}

export function parseCisaKev(body: string): { entries: IocEntry[]; total: number } {
  let parsed: CisaKevJson;
  try {
    parsed = JSON.parse(body) as CisaKevJson;
  } catch {
    return { entries: [], total: 0 };
  }
  const vulns = parsed.vulnerabilities ?? [];
  const total = parsed.total ?? vulns.length;
  // Sort by dateAdded DESC so newest entries come first, then take CAP
  const sorted = [...vulns].sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''));
  const slice = sorted.slice(0, CAP);
  const entries: IocEntry[] = slice
    .map((v) => {
      const value = v.cveID ?? '';
      if (!value) return null;
      const context = [v.vendorProject, v.product, v.vulnerabilityName].filter(Boolean).join(' | ') || undefined;
      const timestamp = v.dateAdded || undefined;
      return { type: 'cve' as IocType, value, context, timestamp };
    })
    .filter((e): e is IocEntry => e !== null);
  return { entries, total };
}

// ─── Source metadata ─────────────────────────────────────────────────────────

export type SourceId = IocFeedSummary['source'];

export interface FeedSource {
  id: SourceId;
  name: string;
  url: string;
}

export const FEED_SOURCES: Record<SourceId, FeedSource> = {
  urlhaus: {
    id: 'urlhaus',
    name: 'Abuse.ch URLhaus',
    url: 'https://urlhaus.abuse.ch/downloads/csv_recent/',
  },
  malwarebazaar: {
    id: 'malwarebazaar',
    name: 'Abuse.ch MalwareBazaar',
    url: 'https://bazaar.abuse.ch/export/csv/recent/',
  },
  threatfox: {
    id: 'threatfox',
    name: 'Abuse.ch ThreatFox',
    url: 'https://threatfox.abuse.ch/export/csv/recent/',
  },
  feodo: {
    id: 'feodo',
    name: 'Abuse.ch Feodo Tracker',
    url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.csv',
  },
  openphish: {
    id: 'openphish',
    name: 'OpenPhish',
    url: 'https://openphish.com/feed.txt',
  },
  'cisa-kev': {
    id: 'cisa-kev',
    name: 'CISA KEV',
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  },
};

/**
 * Build a normalized IocFeedSummary from raw upstream text + source id.
 */
export function buildSummary(sourceId: SourceId, rawBody: string): IocFeedSummary {
  const meta = FEED_SOURCES[sourceId];
  const fetchedAt = new Date().toISOString();

  let entries: IocEntry[];
  let totalInFeed: number | undefined;

  switch (sourceId) {
    case 'urlhaus':
      entries = parseUrlhaus(rawBody);
      break;
    case 'malwarebazaar':
      entries = parseMalwarebazaar(rawBody);
      break;
    case 'threatfox':
      entries = parseThreatfox(rawBody);
      break;
    case 'feodo':
      entries = parseFeodo(rawBody);
      break;
    case 'openphish':
      entries = parseOpenPhish(rawBody);
      break;
    case 'cisa-kev': {
      const r = parseCisaKev(rawBody);
      entries = r.entries;
      totalInFeed = r.total;
      break;
    }
  }

  return {
    source: sourceId,
    source_name: meta.name,
    fetched_at: fetchedAt,
    count: entries.length,
    ...(totalInFeed !== undefined ? { total_in_feed: totalInFeed } : {}),
    entries,
    cache_control_seconds: CACHE_TTL,
  };
}
