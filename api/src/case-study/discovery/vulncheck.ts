import type { Candidate, DedupRecord } from '../types';
import { cveKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

const KEV_URL = 'https://api.vulncheck.com/v3/index/vulncheck-kev';
const WINDOW_MS = 14 * 24 * 3600 * 1000;

interface VcKevEntry {
  cve?: string[];
  vendorProject?: string;
  product?: string;
  name?: string;
  shortDescription?: string;
  date_added?: string;
}

export interface DiscoverVulnCheckDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  /** Free Community token. Empty string = runner disabled (no fetch). */
  token: string;
}

/** Exploited CVEs from VulnCheck KEV (ahead of CISA KEV). No-op when no token. */
export async function discoverVulnCheckKev(deps: DiscoverVulnCheckDeps): Promise<Candidate[]> {
  if (!deps.token) return [];
  const out: Candidate[] = [];
  try {
    const r = await deps.fetch(KEV_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${deps.token}`,
        'User-Agent': 'pranithjain.qzz.io case-study-discovery',
      },
    });
    if (!r.ok) throw new Error(`VulnCheck KEV ${r.status}`);
    const json = (await r.json()) as { data?: VcKevEntry[] };
    const cutoff = deps.now.getTime() - WINDOW_MS;
    for (const e of json.data ?? []) {
      const cveId = e.cve?.[0];
      if (!cveId || !e.date_added) continue;
      const added = new Date(e.date_added).getTime();
      if (!Number.isFinite(added) || added < cutoff) continue;
      const key = cveKey(cveId);
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(e.date_added, deps.now),
        severity: severityScore({ kev: true }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.9,
      });
      const vendor = [e.vendorProject, e.product].filter(Boolean).join(' ');
      out.push({
        key,
        type: 'cve',
        title: `${cveId}${vendor ? ` — ${vendor}` : ''} (exploited in the wild)`,
        rationale: `VulnCheck KEV · added ${e.date_added}${e.shortDescription ? ` · ${e.shortDescription}` : ''}`,
        score,
        evidence: {
          cve: cveId,
          vendor: e.vendorProject,
          product: e.product,
          name: e.name,
          dateAdded: e.date_added,
          description: e.shortDescription,
          url: `https://www.vulncheck.com/cve/${cveId}`,
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('discoverVulnCheckKev failed', err);
  }
  return out;
}
