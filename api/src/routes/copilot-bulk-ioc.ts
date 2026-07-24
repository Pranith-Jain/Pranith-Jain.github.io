import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError } from '../lib/api-error';

interface BulkIocResult {
  value: string;
  type: string;
  verdict: string;
  score: number;
  tags: string[];
  source: string;
  summary?: string;
  error?: string;
}

const PROVIDER_TIMEOUT = 8000;

const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/i;
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/;
const HASH_RE = /\b[a-fA-F0-9]{64}\b/;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|onion|dev|app|gov|edu|info|biz)\b/;

function classifyToken(token: string): string {
  if (CVE_RE.test(token)) return 'cve';
  if (IP_RE.test(token)) return 'ip';
  if (HASH_RE.test(token)) return 'hash';
  if (DOMAIN_RE.test(token)) return 'domain';
  return 'unknown';
}

export async function copilotBulkIocHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ iocs: string[] }>();
    const rawIocs = body.iocs ?? [];
    if (rawIocs.length === 0) return badRequest(c, 'iocs array required');
    if (rawIocs.length > 100) return badRequest(c, 'max 100 IOCs per request');

    const iocs = [...new Set(rawIocs.map((s) => s.trim()).filter(Boolean))].slice(0, 100);
    const results: BulkIocResult[] = [];

    const ipIocs = iocs.filter((i) => classifyToken(i) === 'ip');
    const domainIocs = iocs.filter((i) => classifyToken(i) === 'domain');
    const hashIocs = iocs.filter((i) => classifyToken(i) === 'hash');
    const cveIocs = iocs.filter((i) => classifyToken(i) === 'cve');
    const unknownIocs = iocs.filter((i) => classifyToken(i) === 'unknown');

    // IP enrichment via AbuseIPDB
    if (ipIocs.length > 0 && c.env.ABUSEIPDB_API_KEY) {
      const ipPromises = ipIocs.map(async (ip) => {
        try {
          const res = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
            headers: { Key: c.env.ABUSEIPDB_API_KEY ?? '', Accept: 'application/json' },
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
          });
          if (!res.ok) return { value: ip, type: 'ip', verdict: 'error', score: 0, tags: [], source: 'abuseipdb', error: `HTTP ${res.status}` } satisfies BulkIocResult;
          const data = await res.json() as { data?: { abuseConfidenceScore?: number; countryCode?: string; isTor?: boolean; totalReports?: number; lastReportedAt?: string } };
          const d = data?.data;
          return {
            value: ip, type: 'ip',
            verdict: (d?.abuseConfidenceScore ?? 0) >= 50 ? 'malicious' : (d?.abuseConfidenceScore ?? 0) >= 10 ? 'suspicious' : 'clean',
            score: d?.abuseConfidenceScore ?? 0,
            tags: [d?.isTor ? 'tor' : null, d?.countryCode ? `geo:${d.countryCode}` : null].filter(Boolean) as string[],
            source: 'abuseipdb',
            summary: d?.totalReports ? `${d.totalReports} reports, last: ${d?.lastReportedAt ?? 'N/A'}` : 'No reports',
          } satisfies BulkIocResult;
        } catch (e) {
          return { value: ip, type: 'ip', verdict: 'error', score: 0, tags: [], source: 'abuseipdb', error: e instanceof Error ? e.message : 'timeout' } satisfies BulkIocResult;
        }
      });
      const ipResults = await Promise.allSettled(ipPromises);
      for (const r of ipResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    // Domain enrichment via OTX
    if (domainIocs.length > 0 && c.env.OTX_API_KEY) {
      const domainPromises = domainIocs.map(async (domain) => {
        try {
          const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/general`, {
            headers: { 'X-OTX-API-KEY': c.env.OTX_API_KEY ?? '' },
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
          });
          if (!res.ok) return { value: domain, type: 'domain', verdict: 'error', score: 0, tags: [], source: 'otx', error: `HTTP ${res.status}` } satisfies BulkIocResult;
          const data = await res.json() as { pulses?: number; tags?: string[]; reputation?: number };
          return {
            value: domain, type: 'domain',
            verdict: (data?.reputation ?? 0) < 0 ? 'malicious' : (data?.pulses ?? 0) > 0 ? 'suspicious' : 'clean',
            score: data?.reputation ?? 0,
            tags: data?.tags ?? [],
            source: 'otx',
            summary: data?.pulses ? `${data.pulses} related pulses` : 'No pulses',
          } satisfies BulkIocResult;
        } catch (e) {
          return { value: domain, type: 'domain', verdict: 'error', score: 0, tags: [], source: 'otx', error: e instanceof Error ? e.message : 'timeout' } satisfies BulkIocResult;
        }
      });
      const domainResults = await Promise.allSettled(domainPromises);
      for (const r of domainResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    // Hash enrichment via MalwareBazaar
    if (hashIocs.length > 0) {
      const hashPromises = hashIocs.map(async (hash) => {
        try {
          const res = await fetch('https://mb-api.abuse.ch/api/v1/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ query: 'get_info', hash }),
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
          });
          if (!res.ok) return { value: hash, type: 'hash', verdict: 'error', score: 0, tags: [], source: 'malwarebazaar', error: `HTTP ${res.status}` } satisfies BulkIocResult;
          const data = await res.json() as { query_status?: string; data?: Array<{ signature?: string; file_type?: string; tags?: string[]; first_seen?: string; sha256_hash?: string }> };
          if (data.query_status !== 'ok' || !data.data?.[0]) {
            return { value: hash, type: 'hash', verdict: 'clean', score: 0, tags: [], source: 'malwarebazaar', summary: 'Not found' } satisfies BulkIocResult;
          }
          const d = data.data[0];
          return {
            value: hash, type: 'hash',
            verdict: 'malicious',
            score: 100,
            tags: [d.signature ?? 'unknown', d.file_type ?? '', ...(d.tags ?? [])].filter(Boolean) as string[],
            source: 'malwarebazaar',
            summary: `${d.signature ?? 'Unknown family'} — first seen ${d.first_seen ?? 'N/A'}`,
          } satisfies BulkIocResult;
        } catch (e) {
          return { value: hash, type: 'hash', verdict: 'error', score: 0, tags: [], source: 'malwarebazaar', error: e instanceof Error ? e.message : 'timeout' } satisfies BulkIocResult;
        }
      });
      const hashResults = await Promise.allSettled(hashPromises);
      for (const r of hashResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    // CVE enrichment via Shodan CVEDB
    if (cveIocs.length > 0) {
      const cvePromises = cveIocs.map(async (cve) => {
        try {
          const res = await fetch(`https://cvedb.shodan.io/cve/${cve.toUpperCase()}`, {
            headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
          });
          if (!res.ok) return { value: cve, type: 'cve', verdict: 'error', score: 0, tags: [], source: 'shodan-cvedb', error: `HTTP ${res.status}` } satisfies BulkIocResult;
          const d = await res.json() as { cvss_v3?: number; epss?: number; kev?: boolean; ransomware_campaign?: string; summary?: string };
          return {
            value: cve, type: 'cve',
            verdict: d.kev ? 'malicious' : (d.cvss_v3 ?? 0) >= 9 ? 'suspicious' : 'clean',
            score: d.kev ? 100 : d.epss ? Math.round(d.epss * 100) : 0,
            tags: [d.kev ? 'kev' : null, d.ransomware_campaign ? `ransomware:${d.ransomware_campaign}` : null, `cvss:${d.cvss_v3 ?? 'N/A'}`].filter(Boolean) as string[],
            source: 'shodan-cvedb',
            summary: d.summary?.slice(0, 200) ?? 'No summary available',
          } satisfies BulkIocResult;
        } catch (e) {
          return { value: cve, type: 'cve', verdict: 'error', score: 0, tags: [], source: 'shodan-cvedb', error: e instanceof Error ? e.message : 'timeout' } satisfies BulkIocResult;
        }
      });
      const cveResults = await Promise.allSettled(cvePromises);
      for (const r of cveResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    for (const u of unknownIocs) {
      results.push({ value: u, type: 'unknown', verdict: 'unknown', score: 0, tags: [], source: 'none', summary: 'Unrecognized IOC format' });
    }

    const byType: Record<string, BulkIocResult[]> = {};
    for (const r of results) {
      if (!byType[r.type]) byType[r.type] = [];
      byType[r.type]!.push(r);
    }

    return c.json({
      total: results.length,
      byType: Object.fromEntries(Object.entries(byType).map(([t, items]) => [t, { count: items.length, malicious: items.filter((i) => i.verdict === 'malicious').length, suspicious: items.filter((i) => i.verdict === 'suspicious').length, clean: items.filter((i) => i.verdict === 'clean').length, error: items.filter((i) => i.verdict === 'error').length }])),
      results,
    });
  } catch (e) {
    console.error('copilotBulkIocHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}
