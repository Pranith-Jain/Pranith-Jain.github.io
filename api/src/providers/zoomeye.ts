import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'ipv6', 'domain']);

/**
 * ZoomEye API — host/port search and web fingerprinting by IP or domain.
 * Free tier: 10,000 req/month. Auth via API key header.
 *
 * https://www.zoomeye.org/doc
 */
export const zoomeye: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'zoomeye',
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

  const key = (env as { ZOOMEYE_API_KEY?: string }).ZOOMEYE_API_KEY;
  if (!key) return base('unsupported', { error: 'no_api_key', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    // Build query based on indicator type
    const query = indicator.type === 'domain'
      ? `hostname:${indicator.value}`
      : `ip:${indicator.value}`;

    const res = await fetch(
      `https://api.zoomeye.org/host/search?query=${encodeURIComponent(query)}&page=1`,
      {
        headers: {
          'API-KEY': key,
          Accept: 'application/json',
        },
        signal,
      }
    );

    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['zoomeye-no-access'],
        raw_summary: { reason: `${res.status} from ZoomEye` },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as {
      total?: number;
      matches?: Array<{
        ip?: string;
        portinfo?: {
          port?: number;
          service?: string;
          banner?: string;
          product?: string;
          version?: string;
        };
        geoinfo?: {
          country?: { code?: string };
          city?: { names?: { en?: string } };
          location?: { latitude?: number; longitude?: number };
        };
        whois?: {
          name?: string;
          desc?: string;
        };
      }>;
    };

    const matches = json.matches ?? [];
    const total = json.total ?? 0;

    // Extract open ports and services
    const ports = matches
      .map((m) => m.portinfo?.port)
      .filter((p): p is number => p != null);
    const services = matches
      .map((m) => m.portinfo?.service)
      .filter((s): s is string => s != null);
    const products = matches
      .map((m) => m.portinfo?.product)
      .filter((p): p is string => p != null);

    const uniquePorts = [...new Set(ports)].sort((a, b) => a - b);
    const uniqueServices = [...new Set(services)];
    const uniqueProducts = [...new Set(products)];

    // Score based on exposure — more open ports = higher risk
    let score = 0;
    const hasHighRiskServices = uniqueServices.some((s) =>
      ['ssh', 'ftp', 'telnet', 'rdp', 'vnc', 'mysql', 'mssql', 'postgres', 'redis', 'mongodb'].includes(s.toLowerCase())
    );
    if (hasHighRiskServices) score += 40;
    if (uniquePorts.length > 10) score += 30;
    else if (uniquePorts.length > 5) score += 20;
    else if (uniquePorts.length > 0) score += 10;

    const verdict: Verdict = score >= 60 ? 'suspicious' : score > 0 ? 'unknown' : 'clean';

    const tags: string[] = [];
    if (uniqueServices.length > 0) tags.push(...uniqueServices.slice(0, 5));
    if (uniquePorts.length > 0) tags.push(`${uniquePorts.length}-open-ports`);

    const country = matches[0]?.geoinfo?.country?.code;
    if (country) tags.push(country);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        total_hosts: total,
        open_ports: uniquePorts,
        services: uniqueServices,
        products: uniqueProducts.slice(0, 10),
        country: country ?? '',
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
