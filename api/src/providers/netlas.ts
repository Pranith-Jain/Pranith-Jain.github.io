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

// Response shape: defensive — Netlas's host envelope has varied across
// schema versions. Common fields documented below; the parser falls back
// to empty when a field is absent. A body_preview is included in
// raw_summary on first deploy so we can confirm the actual shape and
// drop the diagnostic in a follow-up commit (same approach that worked
// for the Censys provider).

interface NetlasService {
  port?: number;
  protocol?: string;
  service?: string;
  product?: string;
}

interface NetlasGeo {
  country?: string;
  country_name?: string;
  country_code?: string;
  city?: string;
}

interface NetlasAS {
  number?: number;
  asn?: number;
  name?: string;
  organization?: string;
  org?: string;
}

interface NetlasHost {
  ip?: string;
  data?: NetlasService[];
  ports?: number[];
  services?: NetlasService[];
  geo?: NetlasGeo;
  asn?: NetlasAS;
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

    const bodyText = await res.text();
    let host: NetlasHost = {};
    try {
      const parsed = JSON.parse(bodyText) as NetlasHost | { data?: NetlasHost; result?: NetlasHost };
      // Netlas wraps the host record in different envelopes depending on
      // tier / endpoint version. Try common containers, fall back to top.
      host =
        (parsed as { data?: NetlasHost }).data ?? (parsed as { result?: NetlasHost }).result ?? (parsed as NetlasHost);
    } catch {
      host = {};
    }

    // Port extraction: services[]/data[] objects each carry a port field;
    // some responses also expose a top-level ports[] array.
    const serviceItems = (host.services ?? host.data ?? []) as NetlasService[];
    const portsFromServices = serviceItems.map((s) => s.port).filter((p): p is number => typeof p === 'number');
    const portsTopLevel = Array.isArray(host.ports)
      ? (host.ports.filter((p) => typeof p === 'number') as number[])
      : [];
    const portsAll = [...new Set([...portsFromServices, ...portsTopLevel])];

    const vulns = (host.vulns ?? host.cves ?? []) as unknown[];
    const vulnsCount = vulns.length;
    const openPorts = portsAll.length;

    const score = Math.min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const country = host.geo?.country ?? host.geo?.country_name ?? '';
    const countryCode = host.geo?.country_code ?? '';
    const asn = host.asn?.number ?? host.asn?.asn ?? '';
    const asName = host.asn?.name ?? host.asn?.organization ?? host.asn?.org ?? '';

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
        services: serviceItems
          .slice(0, 8)
          .map((s) => `${s.port}/${s.service ?? s.protocol ?? '?'}`)
          .join(', '),
        country,
        asn,
        as_name: asName,
        domains: (host.domains ?? []).slice(0, 5),
        vulns_count: vulnsCount,
        // Diagnostic — remove once we've verified the actual response shape
        // for a populated host. The Censys provider used the same approach.
        body_preview: bodyText.slice(0, 400),
        top_keys: Object.keys(host as Record<string, unknown>)
          .slice(0, 20)
          .join(','),
      },
      tags: uniqueTags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
