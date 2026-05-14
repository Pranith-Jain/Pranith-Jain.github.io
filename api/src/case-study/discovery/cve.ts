import type { Candidate, DedupRecord } from '../types';
import { cveKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  knownRansomwareCampaignUse?: string;
}

export interface DiscoverDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export async function discoverCves(deps: DiscoverDeps): Promise<Candidate[]> {
  const { fetch, now, getDedup } = deps;
  const candidates: Candidate[] = [];

  try {
    const r = await fetch(KEV_URL, { headers: { 'User-Agent': 'pranithjain.qzz.io case-study-discovery' } });
    if (!r.ok) throw new Error(`KEV fetch ${r.status}`);
    const data = (await r.json()) as { vulnerabilities: KevEntry[] };

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    for (const k of data.vulnerabilities) {
      const dateAdded = new Date(k.dateAdded + 'T00:00:00Z');
      if (dateAdded < fourteenDaysAgo) continue;

      const stable = cveKey(k.cveID);
      const dedup = await getDedup(stable);

      const evidence = {
        cveId: k.cveID,
        vendor: k.vendorProject,
        product: k.product,
        name: k.vulnerabilityName,
        description: k.shortDescription,
        kev: true,
        kevAddedAt: dateAdded.toISOString(),
        ransomwareUse: k.knownRansomwareCampaignUse === 'Known',
      };

      const score = finalScore({
        recency: recencyScore(dateAdded.toISOString(), now),
        severity: severityScore({ kev: true }),
        novelty: noveltyScore(dedup, now),
        sourceWeight: 1.0,
      });

      candidates.push({
        key: stable,
        type: 'cve',
        title: `${k.cveID} — ${k.vendorProject} ${k.product} ${k.vulnerabilityName}`,
        rationale: `Added to CISA KEV ${k.dateAdded}` + (evidence.ransomwareUse ? '; known ransomware use' : ''),
        score,
        evidence,
        discoveredAt: now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverCves: KEV fetch failed', err);
  }

  return candidates;
}
