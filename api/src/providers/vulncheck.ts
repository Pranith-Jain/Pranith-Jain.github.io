import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { vulncheckIp } from '../lib/vulncheck';

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
  if (!token) return base('unsupported', { error: 'no_vulncheck_token' });

  try {
    const intel = await vulncheckIp(token, indicator.value, signal);
    if (!intel) return base('error', { error: 'vulncheck_fetch_failed' });
    if (!intel.found) {
      return base('ok', { score: 0, verdict: 'clean', tags: ['not-listed'], raw_summary: { found: false } });
    }

    // C2 / initial-access are strong malicious signals; honeypot-only is suspicious.
    const tags = intel.tags.map((t) => t.toLowerCase());
    const malicious = tags.some((t) => t.includes('c2') || t.includes('initial-access') || t.includes('botnet'));
    const score = malicious ? 90 : 50;
    const verdict: Verdict = malicious ? 'malicious' : 'suspicious';

    const outTags = [...new Set(['vulncheck', ...intel.tags])].slice(0, 6);
    if (intel.cves.length) outTags.push(`${intel.cves.length}-cves`);

    return base('ok', {
      score,
      verdict,
      tags: outTags.slice(0, 8),
      raw_summary: {
        detections: intel.detections,
        tags: intel.tags,
        country: intel.country,
        asn: intel.asn,
        hostnames: intel.hostnames,
        cves: intel.cves,
        source: 'vulncheck ipintel-3d',
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
