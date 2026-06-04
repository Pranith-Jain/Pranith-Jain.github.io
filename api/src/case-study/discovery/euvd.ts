import type { Candidate, DedupRecord } from '../types';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const EUVD_URL = 'https://euvdservices.enisa.europa.eu/api/lastvulnerabilities';
const WINDOW_MS = 7 * 24 * 3600 * 1000;

interface EuvdEntry {
  id?: string;
  description?: string;
  datePublished?: string;
  baseScore?: number;
}

export interface DiscoverEuvdDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

/** Recently published EU vulnerabilities (ENISA EUVD). Keyless. */
export async function discoverEuvd(deps: DiscoverEuvdDeps): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const r = await deps.fetch(EUVD_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`EUVD ${r.status}`);
    const all = (await r.json()) as EuvdEntry[];
    const cutoff = deps.now.getTime() - WINDOW_MS;
    for (const v of Array.isArray(all) ? all : []) {
      if (!v.id || !v.datePublished) continue;
      const pub = new Date(v.datePublished).getTime();
      if (!Number.isFinite(pub) || pub < cutoff) continue;
      const key = v.id.toLowerCase(); // e.g. "euvd-2026-1001"
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(v.datePublished, deps.now),
        severity: severityScore({ cvss: v.baseScore }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.75,
      });
      out.push({
        key,
        type: 'cve',
        title: `${v.id}${typeof v.baseScore === 'number' ? ` (CVSS ${v.baseScore})` : ''}`,
        rationale: `ENISA EUVD · ${v.datePublished.slice(0, 10)}${v.description ? ` · ${v.description.slice(0, 100)}` : ''}`,
        score,
        evidence: {
          id: v.id,
          baseScore: v.baseScore,
          datePublished: v.datePublished,
          description: v.description,
          url: `https://euvd.enisa.europa.eu/vulnerability/${v.id}`,
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverEuvd failed', err);
  }
  return out;
}
