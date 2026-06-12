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
  source:
    | 'urlhaus'
    | 'malwarebazaar'
    | 'threatfox'
    | 'openphish'
    | 'cisa-kev'
    | 'blocklist-de'
    | 'binary-defense'
    | 'ipsum'
    | 'phishing-army'
    | 'tweetfeed'
    | 'bitwire'
    | 'malwareworld'
    | 'phishing-database'
    | 'threatview-ip'
    | 'threatview-domains'
    | 'viriback-c2';
  source_name: string;
  fetched_at: string;
  count: number;
  total_in_feed?: number;
  entries: IocEntry[];
  cache_control_seconds: number;
}

const CAP = 100;
const CACHE_TTL = 1800;

/** Cap that effectively means "no cap" — used by briefing-builder which needs the full feed for date-window filtering. */
export const UNCAPPED = Number.MAX_SAFE_INTEGER;

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

export function parseUrlhaus(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 3) continue;
    const value = unquote(cols[2] ?? '');
    if (!value) continue;
    const threat = unquote(cols[5] ?? '');
    const tags = unquote(cols[6] ?? '');
    const context = [threat, tags].filter(Boolean).join(' | ') || undefined;
    const timestamp = unquote(cols[1] ?? '') || undefined;
    entries.push({ type: 'url', value, context, timestamp });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── MalwareBazaar ──────────────────────────────────────────────────────────
// Columns: first_seen_utc(0), sha256_hash(1), md5_hash(2), sha1_hash(3),
//          reporter(4), file_name(5), file_type_guess(6), mime_type(7),
//          signature(8), clamav(9), vtpercent(10), imphash(11), ssdeep(12), tlsh(13)
// Feed is newest-first → take first CAP rows.

export function parseMalwarebazaar(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 2) continue;
    const value = unquote(cols[1] ?? '');
    if (!value) continue;
    const signature = unquote(cols[8] ?? '');
    const fileType = unquote(cols[6] ?? '');
    const context = [signature, fileType].filter(Boolean).join(' | ') || undefined;
    const timestamp = unquote(cols[0] ?? '') || undefined;
    entries.push({ type: 'hash', value, context, timestamp });
    if (entries.length >= cap) break;
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

export function parseThreatfox(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 4) continue;
    const rawType = unquote(cols[3] ?? '');
    const type = threatfoxIocType(rawType);
    if (!type) continue;
    let value = unquote(cols[2] ?? '');
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
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── OpenPhish ───────────────────────────────────────────────────────────────
// Plain text, one URL per line.

export function parseOpenPhish(body: string, cap: number = CAP): IocEntry[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('http://') || l.startsWith('https://')))
    .slice(0, cap)
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
  const entries: IocEntry[] = [];
  for (const v of slice) {
    const value = v.cveID ?? '';
    if (!value) continue;
    const context = [v.vendorProject, v.product, v.vulnerabilityName].filter(Boolean).join(' | ') || undefined;
    const timestamp = v.dateAdded || undefined;
    entries.push({ type: 'cve', value, context, timestamp });
  }
  return { entries, total };
}

// ─── Plain-text IP / CIDR blocklists ────────────────────────────────────────
// Used by: blocklist.de, Binary Defense, bitwire, sslbl. One IP/CIDR per line,
// optional comment lines starting with #.

const IPV4_LINE_RE = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/;

export function parsePlainTextIps(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const match = trimmed.match(IPV4_LINE_RE);
    if (!match) continue;
    entries.push({ type: 'ipv4', value: match[0] });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── Ipsum (stamparm) ────────────────────────────────────────────────────────
// Plain text: "<ip>\t<score>" or just "<ip>". Score is the number of source
// blocklists that flagged it — higher means stronger consensus.

export function parseIpsum(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    const ip = parts[0];
    if (!ip || !IPV4_LINE_RE.test(ip)) continue;
    const score = parts[1];
    entries.push({ type: 'ipv4', value: ip, context: score ? `consensus: ${score} sources` : undefined });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── Phishing Army domain blocklist ─────────────────────────────────────────
// Format follows hosts(5) syntax: `0.0.0.0 evil.example.com` or just `evil.example.com`.

const DOMAIN_LINE_RE = /^(?:[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function parsePhishingArmy(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    // Strip leading "0.0.0.0 " or "127.0.0.1 " from hosts-format lines
    const candidate = trimmed.replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, '').trim();
    if (!DOMAIN_LINE_RE.test(candidate)) continue;
    entries.push({ type: 'domain', value: candidate });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── TweetFeed (0xDanielLopez) ──────────────────────────────────────────────
// Plain CSV without quotes: date,source,type,ioc,tags,info_url
// `type` is one of: domain, url, ip, sha256, md5, sha1
// Newest-last → reverse iterate to take newest first.

function tweetfeedType(raw: string): IocType | null {
  const t = raw.toLowerCase().trim();
  if (t === 'ip') return 'ipv4';
  if (t === 'domain') return 'domain';
  if (t === 'url') return 'url';
  if (t === 'sha256' || t === 'md5' || t === 'sha1') return 'hash';
  return null;
}

export function parseTweetFeed(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // Iterate newest-first
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 4) continue;
    const typeCol = cols[2];
    if (!typeCol) continue;
    const type = tweetfeedType(typeCol);
    if (!type) continue;
    const value = cols[3];
    if (!value) continue;
    // TweetFeed CSV is unquoted and untrusted. Reject malformed IP values so a
    // crafted field (spaces/quotes/newlines) can't poison the live-IOC set or,
    // via blocklist-builder, inject rules into the downloadable firewall lists.
    if (
      type === 'ipv4' &&
      !/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value)
    )
      continue;
    const tags = cols[4] || undefined;
    const reporter = cols[1] || undefined;
    const context = [reporter, tags].filter(Boolean).join(' | ') || undefined;
    const timestamp = cols[0] || undefined;
    entries.push({ type, value, context, timestamp });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── SANS ISC top attack sources ────────────────────────────────────────────
// JSON: [{ ip, attacks, count, firstseen, lastseen }, ...]
// Newest-touched first (ISC sorts by attack count desc, lastseen is recent).

interface SansIscEntry {
  ip?: string;
  attacks?: number;
  count?: number;
  lastseen?: string;
}

export function parseSansIsc(body: string, cap: number = CAP): IocEntry[] {
  let parsed: SansIscEntry[];
  try {
    parsed = JSON.parse(body) as SansIscEntry[];
  } catch {
    return [];
  }
  const entries: IocEntry[] = [];
  for (const e of parsed) {
    const ip = e.ip?.trim();
    if (!ip || !IPV4_LINE_RE.test(ip)) continue;
    const attacks = e.attacks ?? 0;
    const count = e.count ?? 0;
    entries.push({
      type: 'ipv4',
      value: ip,
      context: `attacks=${attacks} · sensors=${count}`,
      timestamp: e.lastseen,
    });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── C2IntelFeeds (drb-ra) — Cobalt Strike + similar C2 IPs ─────────────────
// CSV: header `#ip,ioc` then rows `<ip>,<context>`. Context is e.g.
// "Possible Cobaltstrike C2 IP", "Sliver C2 server" — usable as-is for
// downstream display.

export function parseC2IntelFeeds(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(',');
    const ip = idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
    const context = idx === -1 ? undefined : trimmed.slice(idx + 1).trim() || undefined;
    if (!IPV4_LINE_RE.test(ip)) continue;
    entries.push({ type: 'ipv4', value: ip, context });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── AlienVault OTX reputation ──────────────────────────────────────────────
// Plain text with comments. Data lines: `<ip> # <classification> <country>,,<lat>,<lon>`
// Classification examples: "Malicious Host", "Scanning Host", "Spamming".

export function parseAlienVaultReputation(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Split on '#' to separate IP from classification metadata.
    const hashIdx = trimmed.indexOf('#');
    const ip = (hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx)).trim();
    if (!IPV4_LINE_RE.test(ip)) continue;
    const meta = hashIdx === -1 ? '' : trimmed.slice(hashIdx + 1).trim();
    // Take the classification phrase up to first comma (drops lat/lon noise).
    const classification = meta.split(',')[0]?.trim() || undefined;
    entries.push({ type: 'ipv4', value: ip, context: classification });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── BlocklistProject hosts-format domain lists ──────────────────────────────
// Format: `0.0.0.0 <domain>` (hosts(5) style). Skips comments. Used for
// category-specific lists (ransomware, scam, malware, phishing).

const HOSTS_LINE_RE = /^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-z0-9.-]+)$/i;

export function parseHostsFormat(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const match = HOSTS_LINE_RE.exec(trimmed);
    if (!match) continue;
    const domain = match[1]!.toLowerCase();
    // Skip the localhost-style entries that some hosts files include.
    if (domain === 'localhost' || domain === 'localhost.localdomain') continue;
    entries.push({ type: 'domain', value: domain });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── SSLBL (abuse.ch) — SSL/TLS-fingerprinted botnet C2 IPs ──────────────────
// CSV: "Firstseen","DstIP","DstPort". Comment lines start with '#'.

export function parseSslblC2(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cols = trimmed.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const firstSeen = cols[0];
    const ip = cols[1];
    const port = cols[2];
    if (!ip || !IPV4_LINE_RE.test(ip)) continue;
    entries.push({
      type: 'ipv4',
      value: ip,
      context: port ? `SSL/TLS C2 :${port}` : 'SSL/TLS C2',
      timestamp: firstSeen && /^\d{4}-\d\d-\d\d/.test(firstSeen) ? firstSeen : undefined,
    });
    if (entries.length >= cap) break;
  }
  return entries;
}

// ─── Botvrij.eu — curated malicious domain list ─────────────────────────────
// One domain per line; comment lines start with '#'.

export function parseBotvrijDomains(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const candidate = trimmed.toLowerCase();
    if (!DOMAIN_LINE_RE.test(candidate)) continue;
    entries.push({ type: 'domain', value: candidate, context: 'botvrij curated' });
    if (entries.length >= cap) break;
  }
  return entries;
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
  'blocklist-de': {
    id: 'blocklist-de',
    name: 'Blocklist.de (last 48h)',
    url: 'https://lists.blocklist.de/lists/all.txt',
  },
  'binary-defense': {
    id: 'binary-defense',
    name: 'Binary Defense Banlist',
    url: 'https://www.binarydefense.com/banlist.txt',
  },
  ipsum: {
    id: 'ipsum',
    name: 'Ipsum (3+ source consensus)',
    url: 'https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt',
  },
  'phishing-army': {
    id: 'phishing-army',
    name: 'Phishing Army',
    url: 'https://phishing.army/download/phishing_army_blocklist.txt',
  },
  tweetfeed: {
    id: 'tweetfeed',
    name: 'TweetFeed (today)',
    url: 'https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/today.csv',
  },
  bitwire: {
    id: 'bitwire',
    name: 'Bitwire IP Blocklist (outbound)',
    url: 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/outbound.txt',
  },
  malwareworld: {
    id: 'malwareworld',
    name: 'MalwareWorld Bad Reputation',
    url: 'https://malwareworld.com/data/type_BadReputation_ips.txt',
  },
  'phishing-database': {
    id: 'phishing-database',
    name: 'Phishing.Database',
    url: 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/refs/heads/master/phishing-links-ACTIVE-NOW.txt',
  },
  'threatview-ip': {
    id: 'threatview-ip',
    name: 'Threatview.io IP Blocklist',
    url: 'https://threatview.io/Downloads/IP-High-Confidence-Feed.txt',
  },
  'threatview-domains': {
    id: 'threatview-domains',
    name: 'Threatview.io Domain Blocklist',
    url: 'https://threatview.io/Downloads/DOMAIN-High-Confidence-Feed.txt',
  },
  'viriback-c2': {
    id: 'viriback-c2',
    name: 'ViriBack C2 Tracker',
    url: 'https://tracker.viriback.com/dump.php',
  },
};

// ─── Plain URL list (one URL per line, http-prefixed) ────────────────────────
// Used by: Phishing.Database, VXVault, and similar URL-only feeds.

export function parseUrlList(body: string, cap: number = CAP): IocEntry[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('http'))
    .slice(0, cap)
    .map((value) => ({ type: 'url', value }));
}

// ─── ViriBack C2 Tracker ────────────────────────────────────────────────────
// CSV: Malware Family,URL,IP Address,First Seen

export function parseViriback(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const cols of csvLines(body)) {
    if (cols.length < 4) continue;
    const family = unquote(cols[0] ?? '');
    const url = unquote(cols[1] ?? '');
    const ip = unquote(cols[2] ?? '');
    const timestamp = unquote(cols[3] ?? '') || undefined;
    const context = `ViriBack C2: ${family || 'unknown'}`;
    if (ip) {
      entries.push({ type: 'ipv4', value: ip, context, timestamp });
      if (entries.length >= cap) break;
    }
    if (url && url.startsWith('http')) {
      entries.push({ type: 'url', value: url, context, timestamp });
      if (entries.length >= cap) break;
    }
  }
  return entries;
}

// ─── Threatview.io Domain Blocklist ─────────────────────────────────────────
// Plain text, one domain per line.

const BARE_DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function parseThreatviewDomains(body: string, cap: number = CAP): IocEntry[] {
  const entries: IocEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (!BARE_DOMAIN_RE.test(trimmed)) continue;
    entries.push({ type: 'domain', value: trimmed });
    if (entries.length >= cap) break;
  }
  return entries;
}

/**
 * Build a normalized IocFeedSummary from raw upstream text + source id.
 */
/**
 * Parse a feed body into IOC entries.
 *
 * @param sourceId — abuse.ch / OpenPhish / KEV source identifier
 * @param rawBody — raw CSV / TXT / JSON body
 * @param cap — max entries to return; defaults to CAP (100). Pass UNCAPPED to
 *   get the full feed, used by briefing-builder which needs to date-filter
 *   across the full window before display-capping.
 */
export function buildSummary(sourceId: SourceId, rawBody: string, cap: number = CAP): IocFeedSummary {
  const meta = FEED_SOURCES[sourceId];
  const fetchedAt = new Date().toISOString();

  let entries: IocEntry[];
  let totalInFeed: number | undefined;

  switch (sourceId) {
    case 'urlhaus':
      entries = parseUrlhaus(rawBody, cap);
      break;
    case 'malwarebazaar':
      entries = parseMalwarebazaar(rawBody, cap);
      break;
    case 'threatfox':
      entries = parseThreatfox(rawBody, cap);
      break;
    case 'openphish':
      entries = parseOpenPhish(rawBody, cap);
      break;
    case 'cisa-kev': {
      const r = parseCisaKev(rawBody);
      entries = r.entries;
      totalInFeed = r.total;
      break;
    }
    case 'blocklist-de':
    case 'binary-defense':
    case 'bitwire':
    case 'malwareworld':
      entries = parsePlainTextIps(rawBody, cap);
      break;
    case 'ipsum':
      entries = parseIpsum(rawBody, cap);
      break;
    case 'phishing-army':
      entries = parsePhishingArmy(rawBody, cap);
      break;
    case 'tweetfeed':
      entries = parseTweetFeed(rawBody, cap);
      break;
    case 'phishing-database':
      entries = parseUrlList(rawBody, cap);
      break;
    case 'threatview-ip':
      entries = parsePlainTextIps(rawBody, cap);
      break;
    case 'threatview-domains':
      entries = parseThreatviewDomains(rawBody, cap);
      break;
    case 'viriback-c2':
      entries = parseViriback(rawBody, cap);
      break;
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
