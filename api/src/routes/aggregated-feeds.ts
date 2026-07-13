import type { Context } from 'hono';
import type { Env } from '../env';

interface AggregatedFeed {
  id: string;
  name: string;
  url: string;
  category: 'c2' | 'blocklist' | 'scanner' | 'malware' | 'tor' | 'collected';
  description: string;
  size_bytes: number | null;
  ioc_count: number | null;
  sample_entries: string[];
  fetch_ok: boolean;
}

interface AggregatedFeedsResponse {
  generated_at: string;
  total_feeds: number;
  feeds_ok: number;
  categories: Record<string, number>;
  feeds: AggregatedFeed[];
}

const CPS_BASE = 'https://raw.githubusercontent.com/CriticalPathSecurity/Public-Intelligence-Feeds/master';

const FEED_DEFS: Omit<AggregatedFeed, 'size_bytes' | 'ioc_count' | 'sample_entries' | 'fetch_ok'>[] = [
  {
    id: 'cobaltstrike-ips',
    name: 'CobaltStrike C2 IPs',
    url: `${CPS_BASE}/cobaltstrike_ips.txt`,
    category: 'c2',
    description: 'CobaltStrike beacon IPs aggregated from multiple operator sources',
  },
  {
    id: 'cps-cobaltstrike-ips',
    name: 'CPS CobaltStrike IPs',
    url: `${CPS_BASE}/cps_cobaltstrike_ip.txt`,
    category: 'c2',
    description: 'CPS-curated CobaltStrike C2 IPs',
  },
  {
    id: 'cps-cobaltstrike-domains',
    name: 'CPS CobaltStrike Domains',
    url: `${CPS_BASE}/cps_cobaltstrike_domain.txt`,
    category: 'c2',
    description: 'CPS-curated CobaltStrike C2 domains',
  },
  {
    id: 'avanzato-c2',
    name: 'Avanzato C2 IPs',
    url: `${CPS_BASE}/avanzato_c2.txt`,
    category: 'c2',
    description: 'Avanzato malware C2 infrastructure IPs',
  },
  {
    id: 'alienvault',
    name: 'AlienVault OTX IPs',
    url: `${CPS_BASE}/alienvault.txt`,
    category: 'blocklist',
    description: 'AlienVault Open Threat Exchange reputation IPs',
  },
  {
    id: 'binarydefense',
    name: 'BinaryDefense IPs',
    url: `${CPS_BASE}/binarydefense.txt`,
    category: 'blocklist',
    description: 'BinaryDefense curated malicious IP blocklist',
  },
  {
    id: 'threatfox',
    name: 'ThreatFox IOCs',
    url: `${CPS_BASE}/threatfox.txt`,
    category: 'malware',
    description: 'abuse.ch ThreatFox community-submitted IOCs (deduplicated)',
  },
  {
    id: 'compromised-ips',
    name: 'Compromised IPs',
    url: `${CPS_BASE}/compromised-ips.txt`,
    category: 'blocklist',
    description: 'Aggregated compromised IP blocklist',
  },
  {
    id: 'sans-isc',
    name: 'SANS ISC IPs',
    url: `${CPS_BASE}/sans.txt`,
    category: 'scanner',
    description: 'SANS Internet Storm Centre top attack sources',
  },
  {
    id: 'tor-exit',
    name: 'Tor Exit Nodes',
    url: `${CPS_BASE}/tor-exit.txt`,
    category: 'tor',
    description: 'Tor exit node IPs (useful for identifying anonymised traffic)',
  },
  {
    id: 'log4j',
    name: 'Log4j Scanners',
    url: `${CPS_BASE}/log4j.txt`,
    category: 'scanner',
    description: 'IPs scanning for Log4j (CVE-2021-44228) vulnerability',
  },
  {
    id: 'cps-collected',
    name: 'CPS Collected IOCs',
    url: `${CPS_BASE}/cps-collected-iocs.txt`,
    category: 'collected',
    description: 'CPS internally collected and deduplicated malicious IPs',
  },
  {
    id: 'cloudzy',
    name: 'Cloudzy IPs',
    url: `${CPS_BASE}/cloudzy.txt`,
    category: 'blocklist',
    description: 'Cloudzy VPS ranges used for malicious activity',
  },
  {
    id: 'sip',
    name: 'SIP Scanner IPs',
    url: `${CPS_BASE}/sip.txt`,
    category: 'scanner',
    description: 'SIP/VoIP scanner IP addresses',
  },
  {
    id: 'rutgers',
    name: 'Rutgers Spam IPs',
    url: `${CPS_BASE}/rutgers.txt`,
    category: 'blocklist',
    description: 'Rutgers University spam and abuse IP feed',
  },
  {
    id: 'predict',
    name: 'Predict IPs',
    url: `${CPS_BASE}/predict.txt`,
    category: 'blocklist',
    description: 'Predict-based malicious IP blocklist',
  },
  {
    id: 'atom-spam',
    name: 'AtomSpam IPs',
    url: `${CPS_BASE}/AtomSpam.txt`,
    category: 'blocklist',
    description: 'AtomSpam email spam source IPs',
  },
  {
    id: 'drb-ra-verified',
    name: 'DRB-Ra Verified C2',
    url: `${CPS_BASE}/drb-ra-verified.txt`,
    category: 'c2',
    description: 'DRB-Ra verified C2 infrastructure IPs',
  },
  {
    id: 'drb-ra-unverified',
    name: 'DRB-Ra Unverified C2',
    url: `${CPS_BASE}/drb-ra-unverified.txt`,
    category: 'c2',
    description: 'DRB-Ra unverified (potentially suspicious) C2 IPs',
  },
  {
    id: 'illuminate',
    name: 'Illuminate IPs',
    url: `${CPS_BASE}/illuminate.txt`,
    category: 'blocklist',
    description: 'Illuminate threat intel IP blocklist',
  },
];

const CACHE_TTL = 1800;
const SAMPLE_SIZE = 5;

async function fetchLines(url: string): Promise<{ lines: string[]; size: number } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: '*/*' },
      cf: { cacheTtl: 1500, cacheEverything: true },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    return { lines, size: new TextEncoder().encode(text).length };
  } catch (_catchErr) {
    console.error('fetchLines failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

export async function aggregatedFeedsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const results = await Promise.all(
    FEED_DEFS.map(async (def) => {
      const result = await fetchLines(def.url);
      if (!result) {
        return {
          ...def,
          size_bytes: null,
          ioc_count: null,
          sample_entries: [],
          fetch_ok: false,
        } satisfies AggregatedFeed;
      }
      return {
        ...def,
        size_bytes: result.size,
        ioc_count: result.lines.length,
        sample_entries: result.lines.slice(0, SAMPLE_SIZE),
        fetch_ok: true,
      } satisfies AggregatedFeed;
    })
  );

  const ok = results.filter((f) => f.fetch_ok);
  const categories: Record<string, number> = {};
  for (const f of ok) {
    categories[f.category] = (categories[f.category] ?? 0) + 1;
  }

  const body: AggregatedFeedsResponse = {
    generated_at: new Date().toISOString(),
    total_feeds: FEED_DEFS.length,
    feeds_ok: ok.length,
    categories,
    feeds: results,
  };

  return c.json(body, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
}
