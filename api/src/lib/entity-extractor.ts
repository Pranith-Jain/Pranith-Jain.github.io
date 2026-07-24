/**
 * Extract CTI entities from unstructured text — CVEs, IPs, domains, hashes,
 * threat actor names, ransomware families, emails, URLs.
 *
 * Used by the pivot-recommendation engine to find entities in investigation
 * responses that the analyst might want to pivot on.
 */

export interface ExtractedEntities {
  cves: string[];
  ips: string[];
  domains: string[];
  hashes: string[];
  emails: string[];
  urls: string[];
  /** Candidate entity names that look like threat actors / malware / groups */
  namedEntities: string[];
}

const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/g;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|onion|dev|app|gov|edu|info|biz)\b/gi;
const HASH_RE = /\b(?:[a-fA-F0-9]{64}|[a-fA-F0-9]{40}|[a-fA-F0-9]{32})\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+(?:\?[^\s<>"']*)?/gi;

const SKIP_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'github.com', 'mitre.org', 'nvd.nist.gov',
  'cloudflare.com', 'microsoft.com', 'google.com',
  'wikipedia.org', 'youtube.com', 'linkedin.com',
  'twitter.com', 'x.com',
]);

/** Common known threat actor / ransomware / malware names to detect in text. */
const KNOWN_THREAT_NAMES = [
  'lockbit', 'blackcat', 'alphv', 'clop', 'blackbasta',
  'ransomhouse', 'blythe', 'play', 'noescape', 'akira',
  'bianlian', 'medusa', 'royal', 'blackbyte', 'lv',
  'hive', 'conti', 'revil', 'darkside', 'blackmatter',
  'apt29', 'apt28', 'apt33', 'apt41', 'apt1',
  'fancy bear', 'cozy bear', 'lazarus', 'kimsuky',
  'scattered spider', 'midnight blizzard', 'unc3944',
  'volt typhoon', 'salt typhoon', 'mustang panda',
  'cobalt group', 'silk typhoon', 'flax typhoon',
  'wizard spider', 'fin7', 'carbanak', 'cobalt group',
  'ta551', 'ta544', 'ta505', 'ta410',
  'oilrig', 'muddywater', 'apt-c-36',
  'emotet', 'trickbot', 'qakbot', 'iceid',
  'cobalt strike', 'brute ratel', 'havoc', 'sliver',
  'beacon', 'silver', 'pikabot', 'darkgate',
  'agent tesla', 'formbook', 'xworm', 'njrat',
  'asyncrat', 'nanocore', 'remcos',
];

const MIN_WORD_LENGTH = 3;

export function extractEntities(text: string): ExtractedEntities {
  const cves = [...new Set((text.match(CVE_RE) ?? []).map((c) => c.toUpperCase()))];
  const ips = [...new Set(text.match(IP_RE) ?? [])].filter((ip) => {
    const first = Number(ip.split('.')[0]);
    return first !== 0 && first !== 127 && first < 224;
  });
  const domains = [...new Set((text.match(DOMAIN_RE) ?? []).map((d) => d.toLowerCase()))].filter(
    (d) => !SKIP_DOMAINS.has(d) && !ips.includes(d)
  );
  const hashes = [...new Set(text.match(HASH_RE) ?? [])].filter(
    (h) => !cves.some((c) => c.includes(h)) && !ips.includes(h) && !domains.includes(h)
  );
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];
  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')))];

  const namedEntities = extractThreatNames(text);

  return { cves, ips, domains, hashes, emails, urls, namedEntities };
}

function extractThreatNames(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const name of KNOWN_THREAT_NAMES) {
    if (lower.includes(name)) {
      found.add(name.replace(/\b\w/g, (c) => c.toUpperCase()));
      continue;
    }
  }
  return [...found];
}

export function deduplicateEntities(a: ExtractedEntities): ExtractedEntities {
  return {
    cves: [...new Set(a.cves)],
    ips: [...new Set(a.ips)],
    domains: [...new Set(a.domains)],
    hashes: [...new Set(a.hashes)],
    emails: [...new Set(a.emails)],
    urls: [...new Set(a.urls)],
    namedEntities: [...new Set(a.namedEntities)],
  };
}
