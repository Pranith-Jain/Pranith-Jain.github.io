import type { D1Database } from '@cloudflare/workers-types';
import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

export interface DiscoverDeps {
  briefingsDb: D1Database;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

interface BriefingData {
  slug: string;
  type: string;
  title: string;
  date: string;
  date_range: string;
  range_start: string;
  range_end: string;
  generated_at: string;
  executive_summary: string;
  stats: {
    findings: number;
    sections: number;
    cves: number;
    kevs: number;
    iocs: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  sections: Array<{
    id: string;
    title: string;
    count: number;
    blurb: string;
    findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: string;
      cvss?: number;
      cwes?: string[];
      source: string;
      source_url?: string;
      mitre_techniques: string[];
      vendor?: string;
      product?: string;
    }>;
  }>;
  iocs: {
    urls?: unknown[];
    domains?: unknown[];
    ipv4s?: unknown[];
    hashes?: unknown[];
  };
  mitre_techniques: string[];
  sources: string[];
}

export async function discoverBriefing(deps: DiscoverDeps): Promise<Candidate[]> {
  try {
    const { briefingsDb, now, getDedup } = deps;

    const row = await briefingsDb
      .prepare('SELECT body FROM briefings WHERE type = ? ORDER BY range_end DESC LIMIT 1')
      .bind('weekly')
      .first<{ body: string }>();

    if (!row) return [];

    const briefing = JSON.parse(row.body) as BriefingData;
    const key = topicKey('briefing', briefing.slug);

    const dedup = await getDedup(key);

    const score = finalScore({
      recency: recencyScore(briefing.date, now),
      severity: severityScore({
        kev: briefing.stats.kevs > 0,
        cvss: briefing.stats.critical > 0 ? 9.5 : briefing.stats.high > 0 ? 7.5 : 5,
      }),
      novelty: noveltyScore(dedup, now),
      sourceWeight: 0.7,
    });

    const totalIocs =
      (briefing.iocs.urls?.length ?? 0) +
      (briefing.iocs.domains?.length ?? 0) +
      (briefing.iocs.ipv4s?.length ?? 0) +
      (briefing.iocs.hashes?.length ?? 0);

    return [
      {
        key,
        type: 'briefing',
        title: briefing.title,
        rationale: `Weekly threat briefing — ${briefing.stats.findings} findings, ${briefing.stats.kevs} KEVs, ${totalIocs} IOCs across ${briefing.date_range}`,
        score,
        evidence: {
          slug: briefing.slug,
          date: briefing.date,
          date_range: briefing.date_range,
          range_start: briefing.range_start,
          range_end: briefing.range_end,
          generated_at: briefing.generated_at,
          executive_summary: briefing.executive_summary,
          stats: briefing.stats,
          sections: briefing.sections,
          iocs: briefing.iocs,
          mitre_techniques: briefing.mitre_techniques,
          sources: [`https://pranithjain.qzz.io/threatintel/briefings/${briefing.slug}`, ...briefing.sources],
        },
        discoveredAt: now.toISOString(),
        status: 'pending',
      },
    ];
  } catch (err) {
    console.warn('discoverBriefing failed', err);
    return [];
  }
}
