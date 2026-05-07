export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
const HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function refang(input: string): string {
  return input
    .replace(/hxxps?:\/\//gi, (m) => m.replace(/hxxp/i, 'http'))
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[at\]/gi, '@');
}

export function defang(input: string): string {
  return input.replace(/^https?:\/\//i, (m) => m.replace(/http/i, 'hxxp')).replace(/(?<!\[)\.(?!\])/g, '[.]');
}

export function detectType(rawInput: string): IndicatorType {
  const input = refang(rawInput.trim());
  if (!input) return 'unknown';
  if (URL_RE.test(input)) return 'url';
  if (EMAIL_RE.test(input)) return 'email';
  if (IPV4_RE.test(input)) {
    const parts = input.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return 'ipv4';
  }
  if (IPV6_RE.test(input) && input.includes(':')) return 'ipv6';
  if (HASH_RE.test(input)) return 'hash';
  if (DOMAIN_RE.test(input)) return 'domain';
  return 'unknown';
}

export interface ExtractedIndicator {
  type: IndicatorType;
  value: string;
}

const IPV4_FIND = /\b(?:\d{1,3}(?:\[?\.\]?|\.)){3}\d{1,3}\b/g;
const HASH_FIND = /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g;
const URL_FIND = /\bhxxps?:\/\/[^\s<>"')]+|\bhttps?:\/\/[^\s<>"')]+/gi;
const DOMAIN_FIND =
  /\b[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\[?\.\]?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?){1,}\[?\.\]?[a-zA-Z]{2,24}\b/g;

const PRIVATE_IP =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.|255\.255\.255\.255)/;
const COMMON_DEMO_IPS = new Set(['1.1.1.1', '8.8.8.8', '8.8.4.4', '0.0.0.0']);
const COMMON_DOMAIN_FALSE_POSITIVES = new Set([
  'example.com',
  'example.org',
  'example.net',
  'foo.com',
  'bar.com',
  'localhost',
  'test.com',
]);
const COMMON_NEWS_DOMAINS = new Set([
  // Strip news-source domains so the article's own homepage doesn't show as an IOC
  'cisa.gov',
  'us-cert.cisa.gov',
  'sans.edu',
  'isc.sans.edu',
  'nvd.nist.gov',
  'krebsonsecurity.com',
  'bleepingcomputer.com',
  'threatpost.com',
  'darkreading.com',
  'securityweek.com',
  'thehackernews.com',
  'feedburner.com',
  'feeds.feedburner.com',
  'abuse.ch',
  'urlhaus.abuse.ch',
  'threatfox.abuse.ch',
  'bazaar.abuse.ch',
  'dfir-lab.ch',
  'dfir-lab',
  'mitre.org',
  'attack.mitre.org',
  'twitter.com',
  'x.com',
  'youtube.com',
  'github.com',
  'medium.com',
]);

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return parts.every((p) => Number.isFinite(p) && p >= 0 && p <= 255);
}

/**
 * Find IOC-shaped substrings (IPs, domains, hashes, URLs) in arbitrary text.
 * Filters: private/loopback IPs, demo IPs, common false-positive domains,
 * news-source domains. Caps each type to keep UI noise low.
 */
export function extractIndicators(text: string, max = 6): ExtractedIndicator[] {
  if (!text) return [];
  const refanged = refang(text);
  const seen = new Set<string>();
  const out: ExtractedIndicator[] = [];

  // URLs first (highest confidence)
  for (const m of refanged.matchAll(URL_FIND)) {
    const url = m[0].replace(/[.,;)\]]+$/, ''); // trim trailing punctuation
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ type: 'url', value: url });
  }

  // Hashes (high confidence — long hex sequences are unlikely false positives)
  for (const m of refanged.matchAll(HASH_FIND)) {
    const v = m[0].toLowerCase();
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ type: 'hash', value: v });
  }

  // IPv4 (strict: skip private/reserved/demo)
  for (const m of refanged.matchAll(IPV4_FIND)) {
    const ip = m[0].replace(/\[/g, '').replace(/\]/g, '');
    if (seen.has(ip)) continue;
    if (!isValidIpv4(ip)) continue;
    if (PRIVATE_IP.test(ip)) continue;
    if (COMMON_DEMO_IPS.has(ip)) continue;
    seen.add(ip);
    out.push({ type: 'ipv4', value: ip });
  }

  // Domains — skip if already inside a captured URL, skip false positives + news domains
  const urlHosts = out
    .filter((i) => i.type === 'url')
    .map((i) => {
      try {
        return new URL(i.value).hostname.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  for (const m of refanged.matchAll(DOMAIN_FIND)) {
    const dRaw = m[0].toLowerCase().replace(/[.,;)\]]+$/, '');
    const d = dRaw.replace(/\[/g, '').replace(/\]/g, '');
    if (seen.has(d)) continue;
    if (COMMON_DOMAIN_FALSE_POSITIVES.has(d)) continue;
    if (COMMON_NEWS_DOMAINS.has(d)) continue;
    if (urlHosts.includes(d)) continue;
    if (isValidIpv4(d)) continue; // already captured as IP
    if (!/[a-z]/.test(d)) continue; // must contain a letter (not e.g. "1.2.3.4" pretending to be domain)
    if (d.split('.').length < 2) continue;
    // Skip very common TLDs without a meaningful subdomain
    seen.add(d);
    out.push({ type: 'domain', value: d });
  }

  return out.slice(0, max);
}
