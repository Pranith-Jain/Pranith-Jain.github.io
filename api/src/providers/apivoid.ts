import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * APIVoid — IP + domain reputation (NoVirusThanks).
 *
 * Successor to the URLVoid/IPVoid web checkers (both bookmarked; neither
 * exposes its own API — URLVoid's beta API moved to APIVoid). Two endpoints:
 *   - POST https://api.apivoid.com/v2/ip-reputation      { ip }
 *   - POST https://api.apivoid.com/v2/domain-reputation  { host }
 * Auth: `X-API-Key` header. 1 credit per call on paid plans.
 *
 * **Requires `APIVOID_API_KEY` as a Worker secret.** Without a key we
 * return `unsupported` so the composite isn't polluted.
 *
 * Verdict mapping (IP):
 *   - malicious (90) when risk_score ≥ 70 OR ≥ 5 engines detect
 *   - suspicious (55) when risk_score ≥ 40 OR ≥ 2 detections OR
 *     tor/proxy/vpn anonymity flags
 *   - clean (0) otherwise
 * Domain endpoint: same shape with `detections` + optional
 * risk_score/trust_score (trust is inverted: risk = 100 - trust).
 */

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url']);

interface ApivoidEngine {
  name?: string;
  detected?: boolean | number;
  reference?: string;
  confidence?: string;
}

interface ApivoidResponse {
  ip?: string;
  host?: string;
  blacklists?: {
    engines?: Record<string, ApivoidEngine>;
    detections?: number;
    engines_count?: number;
    detection_rate?: string;
  };
  anonymity?: {
    is_proxy?: boolean;
    is_vpn?: boolean;
    is_tor?: boolean;
    is_hosting?: boolean;
  };
  information?: {
    country_code?: string;
    isp?: string;
    asn?: string;
  };
  risk_score?: { result?: number };
  trust_score?: { result?: number };
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const apivoid: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'apivoid',
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

  const key = (env as { APIVOID_API_KEY?: string }).APIVOID_API_KEY;
  if (!key) return base('unsupported');

  const isIp = indicator.type === 'ipv4' || indicator.type === 'ipv6';
  let target = indicator.value;
  if (indicator.type === 'url') {
    const host = hostnameOf(indicator.value);
    if (!host) return base('unsupported');
    target = host;
  }

  const endpoint = isIp ? 'ip-reputation' : 'domain-reputation';
  const payload = isIp ? { ip: target } : { host: target };

  try {
    const res = await fetch(`https://api.apivoid.com/v2/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as ApivoidResponse;
    const bl = data.blacklists ?? {};
    const engines = Object.values(bl.engines ?? {});
    const detected = engines.filter((e) => e.detected === true || e.detected === 1);
    const detections = bl.detections ?? detected.length;

    // risk_score.result is 0-100 maliciousness; some endpoints return a
    // trust_score (0-100 benign) instead — invert it.
    let risk: number | null = null;
    if (typeof data.risk_score?.result === 'number') risk = data.risk_score.result;
    else if (typeof data.trust_score?.result === 'number') risk = 100 - data.trust_score.result;

    const anon = data.anonymity ?? {};
    const anonFlag = Boolean(anon.is_tor || anon.is_proxy || anon.is_vpn);
    const threshold = isIp ? 5 : 3;

    const tags: string[] = [];
    for (const e of detected.slice(0, 8)) {
      if (e.name) tags.push(`engine:${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    }
    if (data.information?.country_code) tags.push(`country:${data.information.country_code.toLowerCase()}`);
    if (data.information?.asn) tags.push(`asn:${data.information.asn.toLowerCase()}`);
    if (anon.is_tor) tags.push('tor');
    if (anon.is_proxy) tags.push('proxy');
    if (anon.is_vpn) tags.push('vpn');
    if (anon.is_hosting) tags.push('hosting');

    let score: number;
    let verdict: Verdict;
    if ((risk !== null && risk >= 70) || detections >= threshold) {
      score = 90;
      verdict = 'malicious';
    } else if ((risk !== null && risk >= 40) || detections >= (isIp ? 2 : 1) || anonFlag) {
      score = 55;
      verdict = 'suspicious';
    } else {
      score = 0;
      verdict = 'clean';
    }

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        target,
        endpoint,
        risk_score: risk,
        detections,
        engines_count: bl.engines_count ?? engines.length,
        detection_rate: bl.detection_rate ?? '',
        country: data.information?.country_code ?? '',
        isp: data.information?.isp ?? '',
        anonymity: {
          tor: Boolean(anon.is_tor),
          proxy: Boolean(anon.is_proxy),
          vpn: Boolean(anon.is_vpn),
          hosting: Boolean(anon.is_hosting),
        },
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
