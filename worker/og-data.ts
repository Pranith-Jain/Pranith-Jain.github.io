/**
 * Load the data an OG card needs for a given (type, slug), from the same
 * stores the pages themselves read: briefings from D1 (`BRIEFINGS_DB`), blog
 * posts from `CASE_STUDIES` KV. Returns null when the entity is missing so the
 * route can fall back to a static card.
 */
import type { Env } from './env';
import type { OgImageData, OgStats } from './og-image';
import type { BriefingFinding, BriefingSection } from '../api/src/core/entities/briefing';
import { createD1BriefingRepository } from '../api/src/infrastructure/persistence/d1-briefing-repository';

export type OgImageType = 'briefing' | 'blog';

const CVE_RE = /CVE-\d{4}-\d{3,7}/gi;

/** Derive the briefing "data viz" stats from its sections + tags. Counts are
 *  computed, not stored, so they always reflect the briefing's actual content:
 *  total findings, distinct CVE IDs (across finding text + briefing tags), and
 *  critical/high severity tallies. */
export function computeBriefingStats(sections: BriefingSection[], tags?: string[]): OgStats {
  let findings = 0;
  let critical = 0;
  let high = 0;
  const cves = new Set<string>();

  const harvestCves = (text?: string): void => {
    if (!text) return;
    const matches = text.match(CVE_RE);
    if (matches) for (const id of matches) cves.add(id.toUpperCase());
  };

  for (const section of sections ?? []) {
    for (const finding of section.findings ?? ([] as BriefingFinding[])) {
      findings++;
      const sev = (finding.severity ?? '').toLowerCase();
      if (sev === 'critical') critical++;
      else if (sev === 'high') high++;
      harvestCves(finding.title);
      harvestCves(finding.description);
      for (const tag of finding.tags ?? []) harvestCves(tag);
    }
  }
  for (const tag of tags ?? []) harvestCves(tag);

  return { findings, cves: cves.size, critical, high };
}

/** Minimal blog record shape in CASE_STUDIES KV (mirrors og-rewriter's read). */
interface BlogOgRecord {
  title?: string;
  excerpt?: string;
  publishedAt?: string;
  tags?: string[];
}

export async function loadOgData(env: Env, type: OgImageType, slug: string): Promise<OgImageData | null> {
  if (type === 'briefing') {
    if (!env.BRIEFINGS_DB) return null;
    const briefing = await createD1BriefingRepository(env.BRIEFINGS_DB).get(slug);
    if (!briefing) return null;
    return {
      title: briefing.title,
      subtitle: briefing.summary ?? '',
      type: 'briefing',
      date: briefing.date,
      tags: briefing.tags,
      stats: computeBriefingStats(briefing.sections, briefing.tags),
    };
  }

  // blog
  const post = (await env.CASE_STUDIES.get(`posts:${slug}`, 'json')) as BlogOgRecord | null;
  if (!post?.title) return null;
  return {
    title: post.title,
    subtitle: post.excerpt ?? '',
    type: 'blog',
    date: post.publishedAt?.slice(0, 10),
    tags: post.tags,
  };
}
