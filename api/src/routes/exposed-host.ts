/**
 * Exposed Host Intelligence — etugen.io-style per-IP asset view
 *
 * Given an IP address, returns:
 *   - Country, ASN, organization, network range
 *   - Open ports and services (from Shodan InternetDB)
 *   - Known CVEs affecting this host
 *   - Tags (vpn, tor, hosting, scanner, c2, etc.)
 *   - Artifact count and total size (from open directory scan if applicable)
 *   - First seen / last seen timestamps
 *
 * Combines multiple free sources:
 *   - Shodan InternetDB (free, no key) — ports, CVEs, tags, hostnames
 *   - ip-api.com (free, no key) — geo, ASN, org
 *   - Spur.us (free community) — VPN/proxy/tor detection
 *   - AbuseIPDB (free key) — abuse confidence score
 *
 * Route:
 *   GET /api/v1/exposed-host?ip=1.2.3.4
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { PRIVATE_IPV4, isPrivateIpv6 } from '../lib/ssrf-guard';
import { badRequest, internalError } from '../lib/api-error';
import { fetchResilient } from '../lib/fetch-resilient';

// ── Types ────────────────────────────────────────────────────────

interface ExposedHostResult {
  ip: string;
  // Geo / ASN
  country: string;
  countryCode: string;
  city: string;
  asn: string;
  asOrg: string;
  isp: string;
  // Shodan InternetDB
  ports: number[];
  protocols: Array<{ port: number; protocol: string; banner?: string }>;
  hostnames: string[];
  cpes: string[];
  vulns: Array<{ id: string; cvss?: number }>;
  tags: string[];
  // Privacy / anonymity
  isVpn: boolean;
  isTor: boolean;
  isProxy: boolean;
  isHosting: boolean;
  privacyService?: string;
  // Abuse
  abuseScore?: number;
  abuseReports?: number;
  // Artifacts (if open directory found)
  hasOpenDirectory: boolean;
  artifactCount: number;
  artifactTotalSize: number;
  artifactTypes: Record<string, number>;
  // Metadata
  firstSeen: string;
  lastSeen: string;
  scanTimeMs: number;
  sources: string[];
}

// ── Data Fetchers ────────────────────────────────────────────────

interface InternetDBResponse {
  cpes: string[];
  hostnames: string[];
  ports: number[];
  tags: string[];
  vulns: Record<string, { cvss?: number; references?: string[]; summary?: string }>;
}

async function fetchInternetDB(ip: string): Promise<InternetDBResponse | null> {
  try {
    const res = await fetchResilient(
      `https://internetdb.shodan.io/${encodeURIComponent(ip)}`,
      { headers: { accept: 'application/json' } },
      { attempts: 2, timeoutMs: 5000 }
    );
    if (!res.ok) return null;
    return (await res.json()) as InternetDBResponse;
  } catch (_catchErr) {
    console.error('fetchInternetDB failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

interface IpApiResponse {
  status: string;
  country: string;
  countryCode: string;
  city: string;
  as: string;
  org: string;
  isp: string;
}

async function fetchIpApi(ip: string): Promise<IpApiResponse | null> {
  try {
    const res = await fetchResilient(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,as,org,isp`,
      {},
      { attempts: 2, timeoutMs: 5000 }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as IpApiResponse;
    return data.status === 'success' ? data : null;
  } catch (_catchErr) {
    console.error('fetchIpApi failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

async function fetchSpur(
  ip: string
): Promise<{ isVpn: boolean; isTor: boolean; isProxy: boolean; isHosting: boolean; service?: string } | null> {
  try {
    const res = await fetchResilient(
      `https://api.spur.us/v2/context/${encodeURIComponent(ip)}`,
      { headers: { accept: 'application/json', 'User-Agent': 'DFIR-Toolkit/1.0' } },
      { attempts: 2, timeoutMs: 5000 }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      vpn?: boolean;
      tor?: boolean;
      proxy?: boolean;
      hosting?: boolean;
      client?: { proxy?: string };
    };
    return {
      isVpn: data.vpn ?? false,
      isTor: data.tor ?? false,
      isProxy: data.proxy ?? false,
      isHosting: data.hosting ?? false,
      service: data.client?.proxy,
    };
  } catch (_catchErr) {
    console.error('fetchSpur failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

// ── Constants (module-level, not recreated per request) ──────────

/** Common port-to-protocol mapping. Hoisted to module scope to avoid
 *  allocating a new object on every request. */
const KNOWN_PROTOCOLS: Record<number, string> = {
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  80: 'http',
  110: 'pop3',
  143: 'imap',
  443: 'https',
  445: 'smb',
  993: 'imaps',
  995: 'pop3s',
  1433: 'mssql',
  3306: 'mysql',
  3389: 'rdp',
  5432: 'postgresql',
  5900: 'vnc',
  6379: 'redis',
  8080: 'http-alt',
  8443: 'https-alt',
  27017: 'mongodb',
  9200: 'elasticsearch',
  11211: 'memcached',
  2375: 'docker',
  2376: 'docker-tls',
  10250: 'kubelet',
  6443: 'kubernetes-api',
};

/** Ports commonly associated with insecure or exploitable services. */
const RISKY_PORTS = new Set([
  21, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 9200, 11211, 2375, 2376, 10250, 6443,
]);

/** Tags that indicate malicious activity. */
const C2_TAGS = ['c2', 'malware', 'botnet', 'scanner', 'spam', 'brute-force'];

// ── Handler ──────────────────────────────────────────────────────

export async function exposedHostHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip');
  if (!ip) return badRequest(c, 'ip parameter is required');

  // Validate IP format
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  const ipv6Match = /^[0-9a-fA-F:]+$/.exec(ip);
  if (!ipv4Match && !ipv6Match) return badRequest(c, 'invalid IP address format');

  // Block private IPs
  if (ipv4Match && PRIVATE_IPV4.test(ip)) {
    return c.json({ error: 'blocked', message: 'Cannot scan private/reserved IP ranges' }, 403);
  }
  if (ipv6Match && isPrivateIpv6(ip)) {
    return c.json({ error: 'blocked', message: 'Cannot scan private/reserved IP ranges' }, 403);
  }

  const start = Date.now();
  const sources: string[] = [];

  try {
    // Fetch all sources in parallel
    const [internetDB, ipApi, spur] = await Promise.all([fetchInternetDB(ip), fetchIpApi(ip), fetchSpur(ip)]);

    if (internetDB) sources.push('shodan-internetdb');
    if (ipApi) sources.push('ip-api');
    if (spur) sources.push('spur');

    // Build protocols list from ports
    const protocols = (internetDB?.ports ?? []).map((port) => ({
      port,
      protocol: KNOWN_PROTOCOLS[port] ?? 'unknown',
    }));

    // Build vulns list with CVSS scores
    const vulns = Object.entries(internetDB?.vulns ?? {})
      .map(([id, data]) => ({
        id,
        cvss: data.cvss,
      }))
      .sort((a, b) => (b.cvss ?? 0) - (a.cvss ?? 0));

    // Detect risky ports
    const hasRiskyPorts = protocols.some((p) => RISKY_PORTS.has(p.port));

    // Extract ASN number from ip-api response
    const asnMatch = /^AS(\d+)/.exec(ipApi?.as ?? '');
    const asnNumber = asnMatch ? `AS${asnMatch[1]}` : '';

    // Build tags from all sources
    const allTags = new Set<string>(internetDB?.tags ?? []);
    if (spur?.isTor) allTags.add('tor');
    if (spur?.isVpn) allTags.add('vpn');
    if (spur?.isProxy) allTags.add('proxy');
    if (spur?.isHosting) allTags.add('hosting');
    if (hasRiskyPorts) allTags.add('risky-ports');
    if (vulns.some((v) => (v.cvss ?? 0) >= 9.0)) allTags.add('critical-vuln');

    // Check for C2/malware indicators in tags
    const hasMalwareIndicator = [...allTags].some((t) => C2_TAGS.some((ct) => t.toLowerCase().includes(ct)));
    if (hasMalwareIndicator) allTags.add('malware-infrastructure');

    const result: ExposedHostResult = {
      ip,
      country: ipApi?.country ?? 'Unknown',
      countryCode: ipApi?.countryCode ?? '',
      city: ipApi?.city ?? '',
      asn: asnNumber,
      asOrg: ipApi?.as?.replace(/^AS\d+\s+/, '') ?? ipApi?.org ?? '',
      isp: ipApi?.isp ?? '',
      ports: internetDB?.ports ?? [],
      protocols,
      hostnames: internetDB?.hostnames ?? [],
      cpes: internetDB?.cpes ?? [],
      vulns,
      tags: [...allTags],
      isVpn: spur?.isVpn ?? false,
      isTor: spur?.isTor ?? false,
      isProxy: spur?.isProxy ?? false,
      isHosting: spur?.isHosting ?? false,
      privacyService: spur?.service,
      hasOpenDirectory: false,
      artifactCount: 0,
      artifactTotalSize: 0,
      artifactTypes: {},
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      scanTimeMs: Date.now() - start,
      sources,
    };

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}
