import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'ipv6']);

interface IPQSResponse {
  success?: boolean;
  fraud_score?: number;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  active_vpn?: boolean;
  active_tor?: boolean;
  recent_abuse?: boolean;
  bot_status?: boolean;
  connection_type?: string;
  abuse_velocity?: string;
  ISP?: string;
  ASN?: string;
  organization?: string;
  country_code?: string;
  region?: string;
  city?: string;
  is_crawler?: boolean;
  mobile?: boolean;
  hosting?: boolean;
  message?: string;
}

export const ipqs: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'ipqs',
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

  const key = (env as { IPQS_API_KEY?: string }).IPQS_API_KEY;
  if (!key) return base('unsupported', { error: 'no_api_key', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    const url = `https://ipqualityscore.com/api/json/ip/${key}/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as IPQSResponse;

    if (!json.success) {
      return base('error', {
        error: json.message || 'ipqs request failed',
        error_code: 'unknown',
        error_tags: ['ipqs-error'],
      });
    }

    const score = Number(json.fraud_score ?? 0);
    const verdict: Verdict = score >= 75 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    if (json.proxy) tags.push('proxy');
    if (json.vpn) tags.push('vpn');
    if (json.tor) tags.push('tor');
    if (json.country_code) tags.push(json.country_code);
    if (json.connection_type) tags.push(json.connection_type);
    if (json.recent_abuse) tags.push('recent-abuse');

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        fraud_score: json.fraud_score ?? 0,
        proxy: json.proxy ?? false,
        vpn: json.vpn ?? false,
        tor: json.tor ?? false,
        active_vpn: json.active_vpn ?? false,
        active_tor: json.active_tor ?? false,
        recent_abuse: json.recent_abuse ?? false,
        bot_status: json.bot_status ?? false,
        connection_type: json.connection_type ?? '',
        abuse_velocity: json.abuse_velocity ?? '',
        ISP: json.ISP ?? '',
        ASN: json.ASN ?? '',
        organization: json.organization ?? '',
        country_code: json.country_code ?? '',
        region: json.region ?? '',
        city: json.city ?? '',
        is_crawler: json.is_crawler ?? false,
        mobile: json.mobile ?? false,
        hosting: json.hosting ?? false,
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
