import { resolveRecord, resolveAllStandard, type RecordType, type ResolveResult } from './dns';

const CDN_PATTERNS: Record<string, string> = {
  cloudflare: 'Cloudflare',
  'cloudfront.net': 'AWS CloudFront',
  'akadns.org': 'Akamai',
  'edgekey.net': 'Akamai',
  'edgesuite.net': 'Akamai',
  'fastly.net': 'Fastly',
  'akamaized.net': 'Akamai',
  'incapsuladns.com': 'Imperva',
  'impervadns.com': 'Imperva',
  'cdn.cloudflare.net': 'Cloudflare',
  'sentry.cdn': 'Sentry',
  'hwcdn.net': 'Highwinds/StackPath',
  'azurewebsites.net': 'Azure',
  'azurefd.net': 'Azure Front Door',
  'azureedge.net': 'Azure CDN',
  'googlehosted.com': 'Google Sites',
  'googleusercontent.com': 'Google',
  'amazonaws.com': 'AWS',
  'edgecastcdn.net': 'Edgecast/Verizon',
  'pantheon.io': 'Pantheon',
  'wpengine.com': 'WP Engine',
};

export interface DnsRecordAnswer {
  data: string;
  TTL: number;
}

export interface CdNInfo {
  detected: boolean;
  provider: string | null;
}

export interface AsnInfo {
  asn: string | null;
  org: string | null;
  prefix: string | null;
  country: string | null;
}

export interface DnsLookupResult {
  hostname: string;
  records: Partial<Record<RecordType, DnsRecordAnswer[]>>;
  cdn: CdNInfo;
  asn: AsnInfo;
  wildcard_detected: boolean;
  record_count: number;
}

async function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function detectCdn(cnames: string[]): CdNInfo {
  const lower = cnames.map((c) => c.toLowerCase());
  for (const cname of lower) {
    for (const [pattern, provider] of Object.entries(CDN_PATTERNS)) {
      if (cname.includes(pattern)) return { detected: true, provider };
    }
  }
  return { detected: false, provider: null };
}

function detectWildcard(domain: string, aRecords: string[], nsRecords: string[], mxRecords: string[]): boolean {
  if (aRecords.length === 0) return false;
  const uniqueIps = new Set(aRecords);
  if (uniqueIps.size === 1 && nsRecords.length === 0 && mxRecords.length === 0) {
    const parts = domain.split('.');
    if (parts.length > 2) return true;
  }
  return false;
}

const PROBE_LABELS = ['test-wildcard-probe-xyz', '_dmarc-check', 'nonexistent-subdomain-abc123', 'random-probe-98765'];

export async function wildcardProbe(
  domain: string
): Promise<{
  is_wildcard: boolean;
  confidence: number;
  probe_results: Array<{ subdomain: string; resolves: boolean; ips: string[] }>;
}> {
  const probeResults: Array<{ subdomain: string; resolves: boolean; ips: string[] }> = [];
  const allIps = new Set<string>();

  const probes = PROBE_LABELS.map(async (label) => {
    const subdomain = `${label}.${domain}`;
    const result = await resolveRecord(subdomain, 'A');
    const ips = result.records;
    const resolves = ips.length > 0 && !result.error;
    ips.forEach((ip) => allIps.add(ip));
    return { subdomain, resolves, ips };
  });

  const results = await Promise.all(probes);
  probeResults.push(...results);

  const resolvingProbes = results.filter((r) => r.resolves);
  const confidence = results.length > 0 ? resolvingProbes.length / results.length : 0;
  const is_wildcard = resolvingProbes.length >= 3 && confidence >= 0.75;

  return { is_wildcard, confidence, probe_results: probeResults };
}

async function lookupAsn(ip: string): Promise<AsnInfo> {
  const data = await fetchJson<{ ip: string; asn: string; name: string; prefix: string; country_code: string }>(
    `https://bgp.tools/api/v1/ip/${ip}`
  );
  if (!data) return { asn: null, org: null, prefix: null, country: null };
  return {
    asn: data.asn ?? null,
    org: data.name ?? null,
    prefix: data.prefix ?? null,
    country: data.country_code ?? null,
  };
}

export async function fullDnsLookup(hostname: string): Promise<DnsLookupResult> {
  const all = await resolveAllStandard(hostname);
  const records: Partial<Record<RecordType, DnsRecordAnswer[]>> = {};

  for (const [type, result] of Object.entries(all) as [RecordType, ResolveResult][]) {
    if (result.records.length > 0 && !result.error) {
      records[type] = result.records.map((r) => ({ data: r, TTL: 0 }));
    }
  }

  const cnames = (records.CNAME ?? []).map((r) => r.data);
  const aRecords = (records.A ?? []).map((r) => r.data);
  const nsRecords = (records.NS ?? []).map((r) => r.data);
  const mxRecords = (records.MX ?? []).map((r) => r.data);

  const cdn = detectCdn(cnames);
  const wildcard = detectWildcard(hostname, aRecords, nsRecords, mxRecords);

  let asn: AsnInfo = { asn: null, org: null, prefix: null, country: null };
  if (aRecords.length > 0) {
    asn = await lookupAsn(aRecords[0]!);
  }

  const recordCount = Object.values(records).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);

  return { hostname, records, cdn, asn, wildcard_detected: wildcard, record_count: recordCount };
}

export async function batchDnsLookup(hostnames: string[]): Promise<DnsLookupResult[]> {
  const CONCURRENCY = 5;
  const results: DnsLookupResult[] = [];
  for (let i = 0; i < hostnames.length; i += CONCURRENCY) {
    const batch = hostnames.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((h) => fullDnsLookup(h)));
    results.push(...batchResults);
  }
  return results;
}
