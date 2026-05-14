import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6']);

// Censys migrated from Legacy Search API (HTTP Basic, ID+Secret, paid-tier
// gated) to a new Platform API (Bearer PAT, free-tier accessible) some time
// in 2024-2025. This adapter targets the Platform API exclusively.
//
// Endpoint:  GET https://api.platform.censys.io/v3/global/asset/host/{ip}
// Auth:      Authorization: Bearer <PAT>
//            or `Bearer <PAT>:<ORG_ID>` per Censys's docs when an Org ID
//            is associated with the token. Empirically the v3 hosts
//            endpoint accepts the PAT-only form for personal accounts;
//            we send the combined form when CENSYS_ORG_ID is set so we
//            match Censys's documented format.

interface PlatformService {
  port?: number;
  protocol?: string;
  service_name?: string;
}

interface PlatformLocation {
  country?: string;
  country_code?: string;
  city?: string;
}

interface PlatformAS {
  asn?: number;
  name?: string;
  country_code?: string;
}

interface PlatformHost {
  ip?: string;
  services?: PlatformService[];
  location?: PlatformLocation;
  autonomous_system?: PlatformAS;
  labels?: string[];
  vulnerabilities?: unknown[];
}

interface PlatformResponse {
  result?: PlatformHost;
  // Some endpoints wrap differently — fall back to top-level fields.
  ip?: string;
  services?: PlatformService[];
  location?: PlatformLocation;
  autonomous_system?: PlatformAS;
  labels?: string[];
}

export const censys: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'censys',
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

  const pat = env.CENSYS_PAT;
  const orgId = env.CENSYS_ORG_ID;
  const token = orgId ? `${pat}:${orgId}` : pat;

  try {
    const url = `https://api.platform.censys.io/v3/global/asset/host/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    // 401 / 403 = missing / invalid PAT, inactive token, or wrong org.
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      let censysError = '';
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string; reason?: string } };
        const e = parsed.error ?? {};
        censysError = [e.message, e.reason].filter(Boolean).join(' — ');
      } catch {
        censysError = body.slice(0, 200);
      }
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['censys-no-access'],
        raw_summary: {
          reason: `${res.status} from Censys (check CENSYS_PAT / CENSYS_ORG_ID)`,
          censys_error: censysError,
          pat_len: pat.length,
          org_id_len: orgId.length,
        },
      });
    }
    // 429 = rate-limited or quota exhausted on the free tier.
    if (res.status === 429) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['censys-quota'],
        raw_summary: { reason: '429 quota or rate-limit' },
      });
    }
    // 404 = host not indexed.
    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['censys-no-data'],
        raw_summary: { reason: 'host not indexed' },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const bodyText = await res.text();
    let json: PlatformResponse = {};
    try {
      json = JSON.parse(bodyText) as PlatformResponse;
    } catch {
      json = {};
    }
    // Tolerate both `{ result: {...} }` and top-level shapes.
    const host: PlatformHost = json.result ?? (json as PlatformHost);

    const services = host.services ?? [];
    const ports = services.map((s) => s.port).filter((p): p is number => typeof p === 'number');
    const vulns = (host.vulnerabilities ?? []) as unknown[];

    const openPorts = ports.length;
    const vulnsCount = vulns.length;
    const score = Math.min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    (host.labels ?? []).slice(0, 5).forEach((t) => tags.push(t));
    if (host.location?.country_code) tags.push(host.location.country_code);
    if (host.autonomous_system?.name) tags.push(host.autonomous_system.name);
    const uniqueTags = [...new Set(tags)].slice(0, 7);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        ports: ports.slice(0, 8),
        services: services
          .slice(0, 8)
          .map((s) => `${s.port}/${s.service_name ?? s.protocol ?? '?'}`)
          .join(', '),
        country: host.location?.country ?? '',
        asn: host.autonomous_system?.asn ?? '',
        as_name: host.autonomous_system?.name ?? '',
        vulns_count: vulnsCount,
        body_preview: bodyText.slice(0, 500),
        top_keys: Object.keys(json as Record<string, unknown>)
          .slice(0, 20)
          .join(','),
      },
      tags: uniqueTags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
