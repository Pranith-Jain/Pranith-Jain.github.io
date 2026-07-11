import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'ipv6', 'domain']);

interface FullhuntHostResponse {
  host?: string;
  ip?: string;
  isp?: string;
  asn?: {
    asn?: number;
    org?: string;
    country?: string;
  };
  technologies?: string[];
  cloud_provider?: string;
  ports?: Array<{
    port: number;
    protocol: string;
    service: string;
    status: string;
  }>;
  subdomains?: string[];
  dns?: {
    a?: string[];
    mx?: string[];
    ns?: string[];
    txt?: string[];
    soa?: string;
  };
  whois?: Record<string, string>;
}

export const fullhunt: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'fullhunt',
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

  const key = env.FULLHUNT_API_KEY;
  if (!key) {
    return base('error', {
      error: 'FULLHUNT_API_KEY not set — free key at fullhunt.io',
      error_code: 'no_api_key',
      error_tags: ['no-api-key'],
    });
  }

  try {
    const isDomain = indicator.type === 'domain';
    const endpoint = isDomain
      ? `https://api.fullhunt.io/api/v1/domain/${encodeURIComponent(indicator.value)}/details`
      : `https://api.fullhunt.io/api/v1/host/${encodeURIComponent(indicator.value)}`;

    const res = await fetch(endpoint, {
      headers: {
        'X-API-Key': key,
        Accept: 'application/json',
      },
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        verdict: 'unknown',
        tags: ['fullhunt-no-access'],
        raw_summary: { reason: `${res.status} — check FULLHUNT_API_KEY` },
      });
    }
    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (res.status === 404) {
      return base('ok', {
        verdict: 'unknown',
        tags: ['fullhunt-no-data'],
        raw_summary: { reason: 'not found' },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as FullhuntHostResponse;

    const ports = json.ports ?? [];
    const techs = json.technologies ?? [];
    const subdomains = json.subdomains ?? [];

    const openPorts = ports.length;
    const score = Math.min(100, openPorts * 5 + (subdomains.length > 50 ? 20 : subdomains.length > 10 ? 10 : 0));
    const verdict: Verdict = score >= 70 ? 'suspicious' : score >= 40 ? 'suspicious' : 'unknown';

    const tags: string[] = [];
    if (json.cloud_provider) tags.push(`cloud:${json.cloud_provider}`);
    if (json.asn?.org) tags.push(json.asn.org);
    techs.slice(0, 5).forEach((t) => tags.push(`tech:${t}`));

    return base('ok', {
      score,
      verdict: openPorts > 0 || subdomains.length > 0 ? verdict : 'unknown',
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        ip: json.ip,
        isp: json.isp,
        asn: json.asn?.asn,
        as_org: json.asn?.org,
        cloud_provider: json.cloud_provider,
        open_ports: ports.slice(0, 10).map((p) => `${p.port}/${p.service}`),
        technologies: techs.slice(0, 10),
        subdomain_count: subdomains.length,
        subdomains: subdomains.slice(0, 10),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
