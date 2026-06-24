import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const KEYWORDS = ['machine learning', 'large language model'];
const WINDOW_MS = 14 * 24 * 3600 * 1000;

interface NvdCve {
  id: string;
  published?: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: { cvssMetricV31?: Array<{ cvssData: { baseScore: number } }> };
}
interface NvdResponse {
  vulnerabilities?: Array<{ cve: NvdCve }>;
}

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

/** AI/ML-security CVEs — NVD keyword search, published ≤ 14d. */
export async function discoverAiSec(deps: DiscoverDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const cutoff = deps.now.getTime() - WINDOW_MS;
  for (const kw of KEYWORDS) {
    try {
      const url = `${NVD_API}?keywordSearch=${encodeURIComponent(kw)}&resultsPerPage=30`;
      const r = await deps.fetch(url, { headers: { 'User-Agent': NVD_UA, Accept: 'application/json' } });
      if (!r.ok) continue;
      const data = (await r.json()) as NvdResponse;
      for (const { cve } of data.vulnerabilities ?? []) {
        if (!cve?.id || seen.has(cve.id) || !cve.published) continue;
        const pub = new Date(cve.published).getTime();
        if (!Number.isFinite(pub) || pub < cutoff) continue;
        seen.add(cve.id);
        const desc = cve.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
        const cvss = cve.metrics?.cvssMetricV31?.[0]?.cvssData.baseScore;
        const key = topicKey('aisec', cve.id);
        const dedup = await deps.getDedup(key);
        const score = finalScore({
          recency: recencyScore(cve.published, deps.now),
          severity: severityScore({ cvss }),
          novelty: noveltyScore(dedup, deps.now),
          sourceWeight: 0.75,
        });
        out.push({
          key,
          type: 'aisec',
          title: `${cve.id}: ${desc.slice(0, 90)}${desc.length > 90 ? '…' : ''}`,
          rationale: `AI/ML-security CVE (kw "${kw}")${cvss ? ` · CVSS ${cvss}` : ''}`,
          score,
          evidence: {
            cveId: cve.id,
            cvss,
            published: cve.published,
            description: desc,
            url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`,
          },
          discoveredAt: deps.now.toISOString(),
          status: 'pending',
        });
      }
    } catch (err) {
      console.warn(`discoverAiSec: keyword failed ${kw}`, err);
    }
  }
  return out;
}
