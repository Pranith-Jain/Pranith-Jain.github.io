/**
 * Query entity extraction — pulls structured indicators (IPs, hashes, CVEs,
 * domains, URLs, threat actors) out of a free-text investigation query.
 *
 * Pure and unit-tested. Drives cross-investigation memory lookup (find prior
 * investigations that touched the same indicators) and can enrich routing.
 */

export interface QueryEntities {
  ips: string[];
  /** MD5 (32), SHA-1 (40), or SHA-256 (64) hex hashes. */
  hashes: string[];
  cves: string[];
  domains: string[];
  urls: string[];
  actors: string[];
}

function isValidIp(ip: string): boolean {
  return ip.split('.').every((oct) => {
    const n = Number(oct);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

const ACTOR_PATTERN =
  /\b(?:APT\d+|Lazarus|Sandworm|Kimsuky|Fancy\s*Bear|Cozy\s*Bear|Turla|Equation\s*Group|LockBit|BlackBasta|Black\s*Basta|Qilin|Akira|Play|Rhysida|Medusa|NoEscape|8Base|DragonForce|NightSpire|Interlock|Wazawaka|Hunters\s*International|Bian\s*Lian|Royal|Akira|Clop|Cl0p|BlackCat|ALPHV|Conti|Ryuk|Hive|Vice\s*Society|Scattered\s*Spider|Lapsus\$|ShinyHunters|Scattered\s*Lapsus)\b/gi;

/** Extract structured indicators from a free-text query (deduplicated). */
export function extractQueryEntities(query: string): QueryEntities {
  const ips = [...new Set(query.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])].filter(isValidIp);
  const hashes = [...new Set(query.match(/\b[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{32}\b/g) ?? [])].map(
    (h) => h.toLowerCase()
  );
  const cves = [...new Set((query.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((c) => c.toUpperCase()))];
  const urls = [...new Set(query.match(/\bhttps?:\/\/[^\s)]+/gi) ?? [])];
  const domains = [
    ...new Set(
      query.match(
        /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|gov|edu|onion|info|xyz)\b/gi
      ) ?? []
    ),
  ]
    .map((d) => d.toLowerCase())
    .filter((d) => !ips.includes(d) && !urls.some((u) => u.includes(d)));
  const actors = [...new Set((query.match(ACTOR_PATTERN) ?? []).map((a) => a.replace(/\s+/g, ' ')))];

  return { ips, hashes, cves, domains, urls, actors };
}

/** True when the query contains at least one concrete indicator. */
export function hasIndicators(e: QueryEntities): boolean {
  return e.ips.length + e.hashes.length + e.cves.length + e.domains.length + e.urls.length + e.actors.length > 0;
}

/**
 * Flatten extracted entities into the indicator shape `lookupMemory` expects
 * (IOC values + actors + CVEs) for cross-investigation memory search.
 */
export function entitiesToMemoryIndicators(e: QueryEntities): { iocs: string[]; actors: string[]; cves: string[] } {
  return {
    iocs: [...e.ips, ...e.hashes, ...e.domains, ...e.urls],
    actors: e.actors,
    cves: e.cves,
  };
}
