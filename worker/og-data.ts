/**
 * Load the data an OG card needs for a given (type, slug), from the same
 * stores the pages themselves read: briefings via `readBriefing` (the rich
 * JSON `body` blob in D1 — `executive_summary` + pre-computed `stats`), blog
 * posts from `CASE_STUDIES` KV. Returns null when the entity is missing so the
 * route can fall back to a static card.
 *
 * NOTE: use `readBriefing`, NOT the D1 briefings *repository* — the repo reads
 * the sparse `summary`/`sections` columns (empty for built briefings); the real
 * content lives in the `body` blob.
 */
import type { Env } from './env';
import type { OgImageData } from './og-image';
import type { OgImageType } from './og-path';
import { readBriefing } from '../api/src/lib/briefing-builder';

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
    const b = await readBriefing(env.BRIEFINGS_DB, slug);
    if (!b) return null;
    return {
      title: b.title,
      subtitle: b.executive_summary ?? '',
      type: 'briefing',
      date: b.date,
      // stats are pre-computed on the briefing body — surface findings/CVEs and
      // the critical/high tallies as the card's data-viz strip.
      stats: {
        findings: b.stats?.findings,
        cves: b.stats?.cves,
        critical: b.stats?.critical,
        high: b.stats?.high,
      },
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
