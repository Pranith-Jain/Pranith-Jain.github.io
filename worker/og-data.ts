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
import { ogMetaForPath, readBlogPostShadowed } from './og-rewriter';

/** Minimal blog record shape in CASE_STUDIES KV (mirrors og-rewriter's read). */
interface BlogOgRecord {
  title?: string;
  excerpt?: string;
  publishedAt?: string;
  tags?: string[];
}

export async function loadOgData(env: Env, type: OgImageType, slug: string): Promise<OgImageData | null> {
  // Generic per-page card: `slug` is the route path (e.g. "/dfir/cve"). Title,
  // description, and section branding come from the SAME derivation the meta
  // rewriter uses (ogMetaForPath), so the card text always matches the page's
  // og:title/og:description. Pure in-memory — no KV/D1 subrequest.
  if (type === 'page') {
    const meta = ogMetaForPath(slug);
    if (!meta) return null;
    return {
      title: meta.title.replace(/\s*·\s*pranithjain\.qzz\.io$/i, ''),
      subtitle: meta.description,
      type: 'page',
      badge: meta.badge,
      product: meta.product,
    };
  }

  if (type === 'briefing') {
    if (!env.BRIEFINGS_DB) return null;
    const b = await readBriefing(env.BRIEFINGS_DB, slug);
    if (!b) return null;
    return {
      title: b.title,
      subtitle: b.executive_summary ?? '',
      type: 'briefing',
      date: b.date,
      // stats are pre-computed on the briefing body — surface the most
      // shareable metrics for the OG card: critical/high severity, IOC
      // count, KEV count, and ransomware victims (analysts engage with
      // concrete numbers like "1,482 IOCs" / "12 victims").
      stats: {
        findings: b.stats?.findings,
        cves: b.stats?.cves,
        critical: b.stats?.critical,
        high: b.stats?.high,
        iocs: b.stats?.iocs,
        kevs: b.stats?.kevs,
        ransomware: b.stats?.ransomware_victims,
      },
    };
  }

  // Shared investigation report (capability-token link). The token is the
  // credential — the card only exposes title/org/counts, never raw IOCs.
  if (type === 'report') {
    if (!env.BRIEFINGS_DB) return null;
    const row = await env.BRIEFINGS_DB.prepare(
      `SELECT title, ioc_count, cve_count, ttp_count, branding_json
       FROM saved_reports WHERE share_token = ?`
    )
      .bind(slug)
      .first<{ title: string; ioc_count?: number; cve_count?: number; ttp_count?: number; branding_json?: string }>();
    if (!row) return null;
    let orgName = '';
    try {
      const branding = row.branding_json ? (JSON.parse(row.branding_json) as { orgName?: string }) : null;
      orgName = branding?.orgName ?? '';
    } catch {
      /* malformed branding → generic badge */
    }
    return {
      title: `Investigation Report — ${row.title}`.slice(0, 90),
      subtitle: orgName ? `Shared by ${orgName}` : 'Shared capability link',
      type: 'briefing', // reuse the briefing stats-strip renderer
      date: new Date().toISOString().slice(0, 10),
      badge: 'THREAT INVESTIGATION',
      product: 'DFIR Toolkit',
      stats: {
        iocs: row.ioc_count ?? 0,
        findings: row.ttp_count ?? 0,
        cves: row.cve_count ?? 0,
      },
    };
  }

  // blog
  const post = await readBlogPostShadowed<BlogOgRecord>(env, slug);
  if (!post?.title) return null;
  return {
    title: post.title,
    subtitle: post.excerpt ?? '',
    type: 'blog',
    date: post.publishedAt?.slice(0, 10),
    tags: post.tags,
  };
}
