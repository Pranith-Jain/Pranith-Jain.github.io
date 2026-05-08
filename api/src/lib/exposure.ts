import { ctLogs } from './crt-sh';
import { resolveRecord } from './dns';
import { shodan } from '../providers/shodan';
import type { ProviderEnv, ProviderResult } from '../providers/types';

const MAX_SUBDOMAINS = 20;

export interface ExposureSubdomain {
  name: string;
  ips: string[];
  shodan?: ProviderResult;
}

export interface ExposureResult {
  domain: string;
  subdomains: ExposureSubdomain[];
  total_subdomains_seen: number;
  score: number; // 0-100, exposure risk
  verdict: 'low' | 'medium' | 'high';
  shodan_enabled: boolean;
}

export async function aggregateExposure(domain: string, env: ProviderEnv): Promise<ExposureResult> {
  const empty: ExposureResult = {
    domain,
    subdomains: [],
    total_subdomains_seen: 0,
    score: 0,
    verdict: 'low',
    shodan_enabled: !!env.SHODAN_API_KEY,
  };

  const ct = await ctLogs(domain);
  if (!ct || ct.length === 0) return empty;

  // Aggregate unique subdomains across all CT subjects
  const subdomainSet = new Set<string>();
  for (const cert of ct) {
    for (const subj of cert.subjects) {
      const lower = subj.toLowerCase();
      // Skip wildcards (e.g. *.example.com) and sanity-check it's actually a subdomain
      if (lower.startsWith('*.')) continue;
      if (lower === domain || lower.endsWith(`.${domain}`)) {
        subdomainSet.add(lower);
      }
    }
  }
  const totalSeen = subdomainSet.size;
  const subdomains = Array.from(subdomainSet).slice(0, MAX_SUBDOMAINS);

  // Resolve each + (optionally) Shodan
  const resolved = await Promise.all(
    subdomains.map(async (name) => {
      const aRecord = await resolveRecord(name, 'A');
      const ips = aRecord.records;
      let shodanResult: ProviderResult | undefined;
      if (env.SHODAN_API_KEY && ips.length > 0) {
        try {
          const firstIp = ips[0];
          shodanResult = firstIp
            ? await shodan({ type: 'ipv4', value: firstIp }, env, AbortSignal.timeout(5000))
            : undefined;
        } catch {
          /* swallow */
        }
      }
      return { name, ips, shodan: shodanResult };
    })
  );

  // Score: count of subdomains with Shodan-detected ports + vuln presence
  let score = 0;
  for (const sd of resolved) {
    if (sd.ips.length === 0) continue;
    score += 5;
    if (sd.shodan?.status === 'ok') {
      const vulns = (sd.shodan.raw_summary as { vulns?: unknown[] }).vulns;
      if (Array.isArray(vulns) && vulns.length > 0) score += 20;
      else score += sd.shodan.score / 5;
    }
  }
  score = Math.min(100, Math.round(score));
  const verdict: ExposureResult['verdict'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

  return {
    domain,
    subdomains: resolved,
    total_subdomains_seen: totalSeen,
    score,
    verdict,
    shodan_enabled: !!env.SHODAN_API_KEY,
  };
}
