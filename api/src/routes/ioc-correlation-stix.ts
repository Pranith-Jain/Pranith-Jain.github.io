import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchIocCorrelation } from './ioc-correlation';

/**
 * STIX 2.1 export of the cross-source correlated IOCs.
 *
 * Produces a STIX 2.1 Bundle containing:
 *   - one Identity SDO for this platform
 *   - one Indicator SDO per correlated IOC (ip/url/domain/hash) with
 *     a proper STIX pattern + indicator_types + labels + valid_from
 *     + external_references back to each contributing source's portal
 *
 * Cache 1h alongside the upstream correlation cache.
 *
 * Reference: https://docs.oasis-open.org/cti/stix/v2.1/cs02/stix-v2.1-cs02.html
 */

export const IOC_CORRELATION_STIX_CACHE_KEY = 'https://ioc-correlation-stix-cache.internal/v1';
const CACHE_TTL_SECONDS = 3600;

const PLATFORM_IDENTITY_ID = 'identity--7f3d2a8a-1c8f-4e9b-a4c3-pranithjain';

interface StixIndicator {
  type: 'indicator';
  spec_version: '2.1';
  id: string;
  created_by_ref: string;
  created: string;
  modified: string;
  name: string;
  description: string;
  indicator_types: string[];
  pattern: string;
  pattern_type: 'stix';
  pattern_version: '2.1';
  valid_from: string;
  labels: string[];
  confidence: number;
  external_references?: Array<{ source_name: string; url?: string; description?: string }>;
}

interface StixIdentity {
  type: 'identity';
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  name: string;
  identity_class: 'organization';
  description: string;
  contact_information?: string;
}

interface StixBundle {
  type: 'bundle';
  id: string;
  objects: Array<StixIdentity | StixIndicator>;
}

/** Make a deterministic UUID-shaped string from a string seed. Not cryptographically random — just stable per IOC value. */
function pseudoUuidFromString(seed: string): string {
  // FNV-1a 32-bit hash twice to produce two halves we shape into UUID v4-ish form.
  let h1 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  let h2 = 0x1505;
  for (let i = seed.length - 1; i >= 0; i--) {
    h2 = (h2 << 5) + h2 + seed.charCodeAt(i);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // Pad to 32 hex chars by repeating + slicing
  const full = (hex1 + hex2 + hex1 + hex2).slice(0, 32);
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-4${full.slice(13, 16)}-a${full.slice(17, 20)}-${full.slice(20, 32)}`;
}

/** STIX pattern syntax per indicator kind. */
function patternFor(
  kind: 'ip' | 'url' | 'domain' | 'hash',
  value: string
): { pattern: string; indicator_types: string[] } {
  const escaped = value.replace(/'/g, "\\'");
  if (kind === 'ip') {
    return {
      pattern: `[ipv4-addr:value = '${escaped}']`,
      indicator_types: ['malicious-activity'],
    };
  }
  if (kind === 'url') {
    return {
      pattern: `[url:value = '${escaped}']`,
      indicator_types: ['malicious-activity'],
    };
  }
  if (kind === 'domain') {
    return {
      pattern: `[domain-name:value = '${escaped}']`,
      indicator_types: ['malicious-activity'],
    };
  }
  // hash — pick the algo based on length
  const len = value.length;
  const algo = len === 32 ? 'MD5' : len === 40 ? 'SHA-1' : len === 64 ? 'SHA-256' : 'SHA-256';
  return {
    pattern: `[file:hashes.'${algo}' = '${escaped}']`,
    indicator_types: ['malicious-activity', 'anomalous-activity'],
  };
}

/** External-reference URLs for the upstream sources we know how to link out to. */
const SOURCE_PORTAL: Record<string, { name: string; url?: string }> = {
  feodo: { name: 'Abuse.ch Feodo Tracker', url: 'https://feodotracker.abuse.ch/' },
  urlhaus: { name: 'Abuse.ch URLhaus', url: 'https://urlhaus.abuse.ch/' },
  threatfox: { name: 'Abuse.ch ThreatFox', url: 'https://threatfox.abuse.ch/' },
  malwarebazaar: { name: 'Abuse.ch MalwareBazaar', url: 'https://bazaar.abuse.ch/' },
  openphish: { name: 'OpenPhish', url: 'https://openphish.com/' },
  ipsum: { name: 'Ipsum (stamparm)', url: 'https://github.com/stamparm/ipsum' },
  cinsarmy: { name: 'CINS Score', url: 'https://cinsscore.com/' },
  bitwire: { name: 'Bitwire IP Blocklist', url: 'https://github.com/bitwire-it/ipblocklist' },
  'blocklist-de': { name: 'Blocklist.de', url: 'https://lists.blocklist.de/' },
  'binary-defense': { name: 'Binary Defense Banlist', url: 'https://www.binarydefense.com/banlist.txt' },
  'phishing-army': { name: 'Phishing Army', url: 'https://phishing.army/' },
  tweetfeed: { name: 'TweetFeed', url: 'https://tweetfeed.live/' },
  'sans-isc': { name: 'SANS Internet Storm Center', url: 'https://isc.sans.edu/' },
  'c2-intel': { name: 'C2IntelFeeds (drb-ra)', url: 'https://github.com/drb-ra/C2IntelFeeds' },
  'emerging-threats': { name: 'Emerging Threats compromised-ips', url: 'https://rules.emergingthreats.net/' },
  'otx-reputation': { name: 'AlienVault OTX', url: 'https://otx.alienvault.com/' },
  'blp-ransomware': { name: 'BlocklistProject (ransomware)', url: 'https://github.com/blocklistproject/Lists' },
  'blp-scam': { name: 'BlocklistProject (scam)', url: 'https://github.com/blocklistproject/Lists' },
};

/**
 * Map source count (consensus) to a STIX confidence 0-100. We tier it
 * rather than scale linearly because 2 vs 3 vs 4+ are the analyst-relevant
 * cutoffs — analysts triage off "appeared in N feeds" not "what % of feeds."
 */
function confidenceFromCount(n: number): number {
  if (n >= 5) return 90;
  if (n >= 4) return 80;
  if (n >= 3) return 65;
  if (n >= 2) return 50;
  return 25;
}

export async function fetchIocCorrelationStix(): Promise<StixBundle> {
  const data = await fetchIocCorrelation();
  const now = new Date().toISOString();

  const identity: StixIdentity = {
    type: 'identity',
    spec_version: '2.1',
    id: PLATFORM_IDENTITY_ID,
    created: now,
    modified: now,
    name: 'pranithjain.qzz.io threat-intel platform',
    identity_class: 'organization',
    description:
      'Cross-source IOC correlation across 18 free, public CTI feeds. See https://pranithjain.qzz.io/threatintel/correlation',
    contact_information: 'https://pranithjain.qzz.io/threatintel/correlation',
  };

  const indicators: StixIndicator[] = [];

  const allBuckets: Array<{
    kind: 'ip' | 'url' | 'domain' | 'hash';
    items: typeof data.ips;
  }> = [
    { kind: 'ip', items: data.ips },
    { kind: 'url', items: data.urls },
    { kind: 'domain', items: data.domains },
    { kind: 'hash', items: data.hashes },
  ];

  for (const { kind, items } of allBuckets) {
    for (const ioc of items) {
      const id = `indicator--${pseudoUuidFromString(`${kind}:${ioc.value}`)}`;
      const { pattern, indicator_types } = patternFor(kind, ioc.value);
      const labels = [`${kind}`, 'cross-source-correlated', `consensus-${ioc.source_count}`];
      if (ioc.context)
        labels.push(
          `context:${ioc.context
            .slice(0, 60)
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')}`
        );
      const validFrom = ioc.last_seen ?? now;

      const external_references = ioc.sources.map((s) => {
        const portal = SOURCE_PORTAL[s];
        if (!portal) return { source_name: s };
        return { source_name: portal.name, url: portal.url, description: `Indicator reported by ${portal.name}` };
      });

      indicators.push({
        type: 'indicator',
        spec_version: '2.1',
        id,
        created_by_ref: PLATFORM_IDENTITY_ID,
        created: now,
        modified: now,
        name: `Cross-source ${kind}: ${ioc.value.slice(0, 80)}`,
        description: `Observed by ${ioc.source_count} independent feeds (${ioc.sources.join(', ')}).${ioc.context ? ` Context: ${ioc.context}` : ''}`,
        indicator_types,
        pattern,
        pattern_type: 'stix',
        pattern_version: '2.1',
        valid_from: validFrom,
        labels,
        confidence: confidenceFromCount(ioc.source_count),
        external_references,
      });
    }
  }

  return {
    type: 'bundle',
    id: `bundle--${pseudoUuidFromString('correlation-bundle-' + now.slice(0, 10))}`,
    objects: [identity, ...indicators],
  };
}

export async function iocCorrelationStixHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(IOC_CORRELATION_STIX_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const bundle = await fetchIocCorrelationStix();
  const response = new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/stix+json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'content-disposition': `attachment; filename="ioc-correlation-${new Date().toISOString().slice(0, 10)}.stix.json"`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
