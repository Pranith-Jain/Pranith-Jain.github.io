import type { Context } from 'hono';
import type { Env } from '../env';
import { selfFetchJson } from '../lib/self-fetch';
import { fetchResilient } from '../lib/fetch-resilient';

export interface ExposureDimension {
  name: string;
  score: number;
  weight: number;
  signals: string[];
}

export interface FusionExposureItem {
  cve_id: string;
  description: string;
  published: string;
  cvss_score: number | null;
  cvss_severity: string;
  epss_score: number | null;
  epss_percentile: number | null;
  in_kev: boolean;
  kev_ransomware: boolean;
  has_exploit: boolean;
  exploit_count: number;
  actor_count: number;
  actors: string[];
  fusion_score: number;
  fusion_label: 'Critical' | 'High' | 'Medium' | 'Low';
  dimensions: ExposureDimension[];
}

export interface FusionExposureResponse {
  generated_at: string;
  count: number;
  items: FusionExposureItem[];
  filters: {
    min_score: number;
    severity?: string;
    kev_only: boolean;
    exploit_only: boolean;
  };
}

const SCORE_BANDS: [number, 'Critical' | 'High' | 'Medium' | 'Low'][] = [
  [80, 'Critical'],
  [60, 'High'],
  [40, 'Medium'],
  [0, 'Low'],
];

function fusionLabel(s: number): FusionExposureItem['fusion_label'] {
  for (const [t, l] of SCORE_BANDS) if (s >= t) return l;
  return 'Low';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

const GITLAB_CSV = 'https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv';

async function fetchExploitIndex(env: Env): Promise<Map<string, number>> {
  const cacheKey = 'fusion:exploit-index:v1';
  try {
    const cached = await env.KV_CACHE?.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as [string, number][];
      return new Map(parsed);
    }
  } catch {
    /* fall through */
  }

  const res = await fetchResilient(GITLAB_CSV, {}, { attempts: 2, timeoutMs: 15000 });
  if (!res.ok) return new Map();

  const text = await res.text();
  const lines = text.split('\n');
  const exploitByCve = new Map<string, number>();

  for (const line of lines) {
    const cveMatch = line.match(/CVE-\d{4}-\d{4,7}/gi);
    if (cveMatch) {
      for (const cve of cveMatch) {
        const upper = cve.toUpperCase();
        exploitByCve.set(upper, (exploitByCve.get(upper) ?? 0) + 1);
      }
    }
  }

  try {
    await env.KV_CACHE?.put(cacheKey, JSON.stringify([...exploitByCve]), { expirationTtl: 21600 });
  } catch {
    /* non-fatal */
  }

  return exploitByCve;
}

interface RecentCveEntry {
  id: string;
  description: string;
  published: string;
  severity: string;
  score: number | null;
  kev: boolean;
  kev_ransomware?: boolean;
  actors?: Array<{ slug: string; mitre_id?: string }>;
}

interface CveRecentResponse {
  cves: RecentCveEntry[];
}

export async function fusionExposureHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = c.req.query('severity');
  const kevOnly = c.req.query('kev_only') === 'true';
  const exploitOnly = c.req.query('exploit_only') === 'true';
  const minScore = Math.max(0, Math.min(100, Number(c.req.query('min_score')) || 0));

  const recent = await selfFetchJson<CveRecentResponse>(c.env.SELF, '/api/v1/cve-recent', c.env);
  const cves = recent?.cves ?? [];

  if (cves.length === 0) {
    return c.json({ error: 'No CVE data available' }, 503);
  }

  const exploitIndex = await fetchExploitIndex(c.env);

  const items: FusionExposureItem[] = [];

  for (const cve of cves) {
    const exploitCount = exploitIndex.get(cve.id) ?? 0;
    const actorCount = cve.actors?.length ?? 0;
    const actorNames = (cve.actors ?? []).map((a) => a.slug);

    // Dimension 1: CVSS Severity (weight 0.25)
    let cvssDimScore = 0;
    const cvssSignals: string[] = [];
    if (cve.score != null) {
      cvssDimScore = clamp((cve.score / 10) * 100);
      cvssSignals.push(`CVSS ${cve.score.toFixed(1)}`);
    } else {
      cvssSignals.push('No CVSS');
    }

    // Dimension 2: KEV Status (weight 0.25)
    let kevDimScore = 0;
    const kevSignals: string[] = [];
    if (cve.kev) {
      kevDimScore = cve.kev_ransomware ? 100 : 85;
      kevSignals.push(cve.kev_ransomware ? 'KEV + ransomware' : 'In CISA KEV');
    } else {
      kevSignals.push('Not in KEV');
    }

    // Dimension 3: Exploit Availability (weight 0.2)
    let exploitDimScore = 0;
    const exploitSignals: string[] = [];
    if (exploitCount > 0) {
      exploitDimScore = clamp(50 + exploitCount * 10);
      exploitSignals.push(`${exploitCount} public exploit(s)`);
    } else {
      exploitSignals.push('No public exploit');
    }

    // Dimension 4: Threat Actor Association (weight 0.15)
    let actorDimScore = 0;
    const actorSignals: string[] = [];
    if (actorCount > 0) {
      actorDimScore = clamp(actorCount * 25);
      actorSignals.push(`${actorCount} actor(s): ${actorNames.join(', ')}`);
    } else {
      actorSignals.push('No actor association');
    }

    // Dimension 5: EPSS Score (weight 0.15) — try KV cache
    let epssDimScore = 0;
    let epssPercentileVal: number | null = null;
    let epssScoreVal: number | null = null;
    const epssSignals: string[] = ['EPSS not cached'];
    try {
      const cveData = await c.env.KV_CACHE?.get(`cve:${cve.id}`);
      if (cveData) {
        const parsed = JSON.parse(cveData) as { epss?: { score: number; percentile: number } };
        if (parsed.epss?.score != null) {
          epssScoreVal = parsed.epss.score;
          epssPercentileVal = parsed.epss.percentile;
          epssDimScore = clamp(parsed.epss.score * 100);
          epssSignals[0] = `EPSS ${(parsed.epss.score * 100).toFixed(2)}% (p${(parsed.epss.percentile * 100).toFixed(1)})`;
        }
      }
    } catch {
      /* skip EPSS enrichment */
    }

    const dimensions: ExposureDimension[] = [
      { name: 'CVSS Severity', score: cvssDimScore, weight: 0.25, signals: cvssSignals },
      { name: 'CISA KEV', score: kevDimScore, weight: 0.25, signals: kevSignals },
      { name: 'Exploit Availability', score: exploitDimScore, weight: 0.2, signals: exploitSignals },
      { name: 'Threat Actor', score: actorDimScore, weight: 0.15, signals: actorSignals },
      { name: 'EPSS Probability', score: epssDimScore, weight: 0.15, signals: epssSignals },
    ];

    const fusionScore = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));

    items.push({
      cve_id: cve.id,
      description: cve.description?.slice(0, 300) ?? '',
      published: cve.published,
      cvss_score: cve.score,
      cvss_severity: cve.severity,
      epss_score: epssScoreVal,
      epss_percentile: epssPercentileVal,
      in_kev: cve.kev,
      kev_ransomware: cve.kev_ransomware ?? false,
      has_exploit: exploitCount > 0,
      exploit_count: exploitCount,
      actor_count: actorCount,
      actors: actorNames,
      fusion_score: fusionScore,
      fusion_label: fusionLabel(fusionScore),
      dimensions,
    });
  }

  // Apply filters
  let filtered = items;

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((i) => i.cvss_severity.toLowerCase() === q);
  }

  if (kevOnly) {
    filtered = filtered.filter((i) => i.in_kev);
  }

  if (exploitOnly) {
    filtered = filtered.filter((i) => i.has_exploit);
  }

  if (minScore > 0) {
    filtered = filtered.filter((i) => i.fusion_score >= minScore);
  }

  filtered.sort((a, b) => b.fusion_score - a.fusion_score);

  const response: FusionExposureResponse = {
    generated_at: new Date().toISOString(),
    count: filtered.length,
    items: filtered,
    filters: { min_score: minScore, severity: query, kev_only: kevOnly, exploit_only: exploitOnly },
  };

  return c.json(response, 200, {
    'Cache-Control': 'public, max-age=120, s-maxage=300',
  });
}
