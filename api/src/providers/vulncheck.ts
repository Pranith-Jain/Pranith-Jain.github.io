import type { ProviderAdapter, ProviderErrorCode, ProviderResult, Verdict } from './types';
import type { VcErrorInfo } from '../lib/vulncheck';
import { vulncheckIp } from '../lib/vulncheck';

/**
 * Map the VulnCheck lib's error codes onto the shared {@link ProviderErrorCode}
 * union. `upstream_5xx`/`upstream_4xx` are valid codes already; `network_error`
 * is the lib's name for what the shared union calls `network`.
 */
const toProviderErrorCode = (code: VcErrorInfo['code']): ProviderErrorCode =>
  code === 'network_error' ? 'network' : code;

const supports = new Set(['ipv4']);

/**
 * VulnCheck IP Intelligence (ipintel-3d): flags IPs seen as C2, initial-access,
 * or honeypot infrastructure, with associated CVEs/ASN/country. Free Community
 * token via env.VULNCHECK_API_TOKEN; degrades to 'unsupported' when unset.
 */
export const vulncheck: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'vulncheck',
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
  const token = env.VULNCHECK_API_TOKEN;
  if (!token)
    return base('unsupported', { error: 'no_vulncheck_token', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    const intel = await vulncheckIp(token, indicator.value, signal);
    if ('err' in intel) {
      const code = intel.err.code;
      const status = intel.err.status;
      const errorCode = toProviderErrorCode(code);
      return base('error', {
        error: `vulncheck ${code}${status ? ` (${status})` : ''}`,
        error_code: errorCode,
        error_status: status,
        error_tags: status ? [errorCode, String(status)] : [errorCode],
      });
    }
    const data = intel.ok;
    if (!data.found) {
      return base('ok', { score: 0, verdict: 'clean', tags: ['not-listed'], raw_summary: { found: false } });
    }

    // C2 / initial-access are strong malicious signals; honeypot-only is suspicious.
    const tags = data.tags.map((t) => t.toLowerCase());
    const malicious = tags.some((t) => t.includes('c2') || t.includes('initial-access') || t.includes('botnet'));
    const score = malicious ? 90 : 50;
    const verdict: Verdict = malicious ? 'malicious' : 'suspicious';

    const outTags = [...new Set(['vulncheck', ...data.tags])].slice(0, 6);
    if (data.cves.length) outTags.push(`${data.cves.length}-cves`);

    return base('ok', {
      score,
      verdict,
      tags: outTags.slice(0, 8),
      raw_summary: {
        detections: data.detections,
        tags: data.tags,
        country: data.country,
        asn: data.asn,
        hostnames: data.hostnames,
        cves: data.cves,
        source: 'vulncheck ipintel-3d',
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
