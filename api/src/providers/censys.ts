import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6']);

interface CensysService {
  port?: number;
  service_name?: string;
  transport_protocol?: string;
}

interface CensysLocation {
  country?: string;
  country_code?: string;
  city?: string;
}

interface CensysAS {
  asn?: number;
  name?: string;
  country_code?: string;
}

interface CensysResult {
  ip?: string;
  services?: CensysService[];
  location?: CensysLocation;
  autonomous_system?: CensysAS;
  labels?: string[];
  vulnerabilities?: unknown[];
}

interface CensysResponse {
  code?: number;
  status?: string;
  result?: CensysResult;
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

  const id = env.CENSYS_API_ID;
  const secret = env.CENSYS_API_SECRET;

  try {
    const url = `https://search.censys.io/api/v2/hosts/${encodeURIComponent(indicator.value)}`;
    const auth = `Basic ${btoa(`${id}:${secret}`)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    });

    // 401 / 403 = bad / missing credentials. Treat as graceful "no data" so
    // the rest of the pipeline isn't poisoned by a permission failure.
    // Capture Censys's error body — the exact wording distinguishes missing
    // auth ("You must authenticate...") from invalid credentials ("Invalid
    // API ID or secret"), which is the difference between a config drop and
    // a typo when setting the secrets.
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      let censysError = '';
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (typeof parsed.error === 'string') censysError = parsed.error;
      } catch {
        censysError = body.slice(0, 200);
      }
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['censys-no-access'],
        raw_summary: {
          reason: `${res.status} from Censys (check CENSYS_API_ID / CENSYS_API_SECRET)`,
          censys_error: censysError,
        },
      });
    }
    // 429 = free-tier quota exhausted (≈250 lookups / month). Don't escalate
    // to an error — render as "no answer this time".
    if (res.status === 429) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['censys-quota'],
        raw_summary: { reason: '429 quota exhausted' },
      });
    }
    // 404 = host not indexed. Common for clean infrastructure.
    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['censys-no-data'],
        raw_summary: { reason: 'host not indexed' },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as CensysResponse;
    const result = json.result ?? {};

    const services = result.services ?? [];
    const ports = services.map((s) => s.port).filter((p): p is number => typeof p === 'number');
    const vulns = (result.vulnerabilities ?? []) as unknown[];

    const openPorts = ports.length;
    const vulnsCount = vulns.length;
    const score = Math.min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    (result.labels ?? []).slice(0, 5).forEach((t) => tags.push(t));
    if (result.location?.country_code) tags.push(result.location.country_code);
    if (result.autonomous_system?.name) tags.push(result.autonomous_system.name);
    const uniqueTags = [...new Set(tags)].slice(0, 7);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        ports: ports.slice(0, 8),
        services: services
          .slice(0, 8)
          .map((s) => `${s.port}/${s.service_name ?? '?'}`)
          .join(', '),
        country: result.location?.country ?? '',
        asn: result.autonomous_system?.asn ?? '',
        as_name: result.autonomous_system?.name ?? '',
        vulns_count: vulnsCount,
      },
      tags: uniqueTags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
