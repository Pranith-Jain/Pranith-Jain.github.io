/**
 * Host intelligence aggregator — given an IPv4, fan out to keyless live
 * sources and normalize into an etugen.io-style "EXPOSED HOST" view:
 * ASN + org + country, open services, leaks, and tagged artifacts.
 *
 * Live-only. Sources:
 *   - Shodan InternetDB (keyless): open ports, CVEs, hostnames, tags
 *   - ipinfo (keyless free tier, better with IPINFO_TOKEN): ASN, org, country
 *   - LeakIX host endpoint (keyless, best-effort): exposed services & leaks
 *
 * Every external call is wrapped in Promise.allSettled with a per-call
 * timeout so one dead source never fails the page.
 */

import { shodanInternetDB } from '../providers/shodan-internetdb';
import { classifyArtifact, highRiskTags, type ArtifactTag, type ArtifactType } from './artifact-tags';

export interface HostArtifact {
  name: string;
  kind: 'service' | 'leak';
  type: ArtifactType;
  size?: number;
  http_status?: number;
  last_seen?: string;
  source: string;
  tags: ArtifactTag[];
}

export interface HostIntel {
  ip: string;
  asn?: number;
  org?: string;
  country?: string;
  hostnames: string[];
  open_ports: number[];
  vulns: string[];
  last_seen?: string;
  artifact_count: number;
  artifacts: HostArtifact[];
  /** High-signal tags rolled up across all artifacts. */
  risk_tags: ArtifactTag[];
  sources_used: string[];
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Validates a dotted-quad IPv4 with each octet in range. */
export function isValidIpv4(ip: string): boolean {
  const m = ip.match(IPV4_RE);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    if (octet === undefined) return false;
    const n = Number(octet);
    if (n < 0 || n > 255 || String(n) !== octet.replace(/^0+(?=\d)/, '')) return false;
  }
  return true;
}

/** Common service names for well-known ports (used to label service artifacts). */
const PORT_NAMES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 135: 'MSRPC', 139: 'NetBIOS', 143: 'IMAP', 443: 'HTTPS',
  445: 'SMB', 1433: 'MSSQL', 1521: 'Oracle', 2049: 'NFS', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-alt',
  8443: 'HTTPS-alt', 9200: 'Elasticsearch', 27017: 'MongoDB',
};

interface IpInfoJson {
  org?: string;
  country?: string;
  hostname?: string;
}

/** Parses ipinfo's "AS#### Org Name" org string into {asn, name}. */
export function parseOrg(org?: string): { asn?: number; name?: string } {
  if (!org) return {};
  const m = org.match(/^AS(\d+)\s+(.*)$/i);
  if (m && m[1] && m[2]) return { asn: Number(m[1]), name: m[2].trim() };
  return { name: org.trim() };
}

async function fetchIpInfo(ip: string, token: string | undefined, signal: AbortSignal): Promise<IpInfoJson | null> {
  const url = token ? `https://ipinfo.io/${ip}/json?token=${token}` : `https://ipinfo.io/${ip}/json`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return (await res.json()) as IpInfoJson;
}

interface LeakIxHost {
  Leaks?: Array<{ plugin?: string; event_source?: string; time?: string }>;
}

async function fetchLeakIxHost(ip: string, signal: AbortSignal): Promise<HostArtifact[]> {
  const res = await fetch(`https://leakix.net/host/${encodeURIComponent(ip)}`, {
    signal,
    headers: { accept: 'application/json', 'user-agent': 'pranithjain.qzz.io DFIR toolkit' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as LeakIxHost;
  const artifacts: HostArtifact[] = [];
  for (const leak of data.Leaks ?? []) {
    const name = leak.plugin ?? leak.event_source ?? 'leak';
    artifacts.push({
      name,
      kind: 'leak',
      type: 'FILE',
      last_seen: leak.time,
      source: 'leakix',
      tags: classifyArtifact(name, leak.plugin),
    });
  }
  return artifacts;
}

export interface HostIntelEnv {
  IPINFO_TOKEN?: string;
  SHODAN_API_KEY?: string;
}

/**
 * Aggregate live host intelligence for an IPv4 address.
 * Returns a normalized HostIntel; never throws for upstream failures.
 */
export async function aggregateHostIntel(ip: string, env: HostIntelEnv, now: string): Promise<HostIntel> {
  const timeout = (ms: number) => AbortSignal.timeout(ms);

  const [internetdb, ipinfoRes, leakix] = await Promise.allSettled([
    shodanInternetDB({ type: 'ipv4', value: ip }, env as never, timeout(6000)),
    fetchIpInfo(ip, env.IPINFO_TOKEN, timeout(5000)),
    fetchLeakIxHost(ip, timeout(8000)),
  ]);

  const sources_used: string[] = [];
  const artifacts: HostArtifact[] = [];
  let hostnames: string[] = [];
  let open_ports: number[] = [];
  let vulns: string[] = [];

  // ── Shodan InternetDB (keyless): ports → service artifacts, vulns, hostnames
  if (internetdb.status === 'fulfilled' && internetdb.value.status === 'ok') {
    sources_used.push('shodan-internetdb');
    const raw = internetdb.value.raw_summary as {
      ports?: number[]; vulns?: string[]; hostnames?: string[];
    };
    open_ports = raw.ports ?? [];
    vulns = raw.vulns ?? [];
    hostnames = raw.hostnames ?? [];
    for (const port of open_ports) {
      const label = PORT_NAMES[port];
      const name = label ? `tcp/${port} (${label})` : `tcp/${port}`;
      artifacts.push({ name, kind: 'service', type: 'BIN', last_seen: now, source: 'shodan-internetdb', tags: [] });
    }
  }

  // ── ipinfo (keyless free tier): ASN + org + country
  let asn: number | undefined;
  let org: string | undefined;
  let country: string | undefined;
  if (ipinfoRes.status === 'fulfilled' && ipinfoRes.value) {
    sources_used.push('ipinfo');
    const parsed = parseOrg(ipinfoRes.value.org);
    asn = parsed.asn;
    org = parsed.name;
    country = ipinfoRes.value.country;
    if (ipinfoRes.value.hostname && !hostnames.includes(ipinfoRes.value.hostname)) {
      hostnames = [ipinfoRes.value.hostname, ...hostnames];
    }
  }

  // ── LeakIX leak artifacts (keyless, best-effort)
  if (leakix.status === 'fulfilled' && leakix.value.length > 0) {
    sources_used.push('leakix');
    artifacts.push(...leakix.value);
  }

  const risk_tags = Array.from(new Set(artifacts.flatMap((a) => highRiskTags(a.tags))));

  return {
    ip,
    asn,
    org,
    country,
    hostnames: hostnames.slice(0, 10),
    open_ports,
    vulns,
    last_seen: now,
    artifact_count: artifacts.length,
    artifacts,
    risk_tags,
    sources_used,
  };
}
