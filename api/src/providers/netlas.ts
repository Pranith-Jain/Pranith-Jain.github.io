import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6']);

// Netlas internet-asset intelligence platform — third opinion alongside
// Shodan + Censys. Free Community tier: 50 host requests/day, 60 req/min
// search ceiling.
//
// Endpoint:  GET https://app.netlas.io/api/host/{ip}
// Auth:      Authorization: Bearer <NETLAS_API_KEY>
//            (X-API-Key is still accepted but documented as deprecated.)
// Docs:      https://docs.netlas.io/api-reference/
//
// Response shape verified empirically against the live API (2026-05-14):
//   {
//     ports: [{ port, protocol, prot4, prot7 }, ...],
//     domains: ["...", ...],
//     domains_count: N,
//     geo: { country, country_code, city, ... },
//     organization: string | { name, ... },   ← varies; handle both
//     whois: {...}, software: {...}, ptr: ..., ip: ..., type: ...,
//     source: ..., ioc: ..., privacy: ...
//   }

interface NetlasPort {
  port?: number;
  protocol?: string;
  prot4?: string;
  prot7?: string;
}

interface NetlasGeo {
  country?: string;
  country_name?: string;
  country_code?: string;
  city?: string;
}

interface NetlasOrganization {
  name?: string;
  organization?: string;
  asn?: number;
  number?: number;
}

interface NetlasHost {
  ip?: string;
  ports?: NetlasPort[];
  geo?: NetlasGeo;
  organization?: string | NetlasOrganization;
  domains?: string[];
  tags?: string[];
  vulns?: unknown[];
  cves?: unknown[];
}

export const netlas: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'netlas',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  const apiKey = env.NETLAS_API_KEY;

  try {
    const url = `https://app.netlas.io/api/host/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    // 401 / 403 = missing or invalid API key.
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      let netlasError = '';
      try {
        const parsed = JSON.parse(body) as { error?: string; detail?: string; message?: string };
        netlasError = parsed.error ?? parsed.detail ?? parsed.message ?? '';
      } catch {
        netlasError = body.slice(0, 200);
      }
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['netlas-no-access'],
        raw_summary: {
          reason: `${res.status} from Netlas (check NETLAS_API_KEY)`,
          netlas_error: netlasError,
        },
      });
    }
    // 429 = daily quota exhausted (Community tier: 50/day) or per-minute rate-limit.
    if (res.status === 429) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['netlas-quota'],
        raw_summary: { reason: '429 quota or rate-limit (Community tier: 50/day)' },
      });
    }
    // 404 = host not indexed.
    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['netlas-no-data'],
        raw_summary: { reason: 'host not indexed' },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const host = (await res.json()) as NetlasHost;

    // Ports: array of objects with .port + .protocol. Deduplicate because
    // the same port often appears with prot4=tcp + prot4=udp variants.
    const portObjects = host.ports ?? [];
    const portsAll = [...new Set(portObjects.map((p) => p.port).filter((p): p is number => typeof p === 'number'))];

    // Organization can arrive as a plain string ("Cloudflare, Inc.") or as
    // an object with name/asn fields. Normalise into asName + asn separately
    // so the UI summary stays consistent with Shodan/Censys.
    let asName = '';
    let asn: string | number = '';
    if (typeof host.organization === 'string') {
      asName = host.organization;
    } else if (host.organization && typeof host.organization === 'object') {
      asName = host.organization.name ?? host.organization.organization ?? '';
      asn = host.organization.asn ?? host.organization.number ?? '';
    }

    const country = host.geo?.country ?? host.geo?.country_name ?? '';
    const countryCode = host.geo?.country_code ?? '';

    const vulns = (host.vulns ?? host.cves ?? []) as unknown[];
    const vulnsCount = vulns.length;
    const openPorts = portsAll.length;

    const score = Math.min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    (host.tags ?? []).slice(0, 5).forEach((t) => tags.push(t));
    if (countryCode) tags.push(countryCode);
    if (asName) tags.push(asName);
    const uniqueTags = [...new Set(tags)].slice(0, 7);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        ports: portsAll.slice(0, 8),
        services: portObjects
          .slice(0, 8)
          .map((p) => `${p.port}/${p.protocol ?? p.prot7 ?? p.prot4 ?? '?'}`)
          .join(', '),
        country,
        asn,
        as_name: asName,
        domains: (host.domains ?? []).slice(0, 5),
        vulns_count: vulnsCount,
      },
      tags: uniqueTags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
