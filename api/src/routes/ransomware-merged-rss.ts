import type { Context } from 'hono';
import type { Env } from '../env';
import { getSiteUrl } from '../lib/site-config';
import { RANSOMWARE_RECENT_CACHE_KEY, fetchRansomwareRecent } from './ransomware-recent';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const RANSOMWARE_MERGED_FEED_PATH = '/api/v1/feeds/ransomware-merged';

/**
 * Build the merged ransomware RSS. Reads from edge cache first (zero
 * subrequests). When `env` is provided AND the cache is cold, falls back
 * to fetchRansomwareRecent() so the standalone HTTP endpoint always returns
 * data. The in-process aggregator path should NOT pass `env` to avoid
 * subrequest-budget pressure during a multi-feed aggregate.
 */
export async function buildRansomwareMergedRss(env?: Env): Promise<{ xml: string; count: number }> {
  let victims: { victim: string; group: string; discovered: string; description?: string; source_url?: string; origin?: string }[] = [];
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(RANSOMWARE_RECENT_CACHE_KEY);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = (await cached.json()) as {
        victims: typeof victims;
        count: number;
      };
      victims = body.victims ?? [];
    }
  } catch {
    victims = [];
  }

  // Cold cache fallback — only when env is provided (i.e. the standalone
  // HTTP endpoint, not the in-process aggregator).
  if (victims.length === 0 && env) {
    try {
      const result = await fetchRansomwareRecent(env);
      victims = result.body.victims ?? [];
    } catch {
      victims = [];
    }
  }

  const items = victims
    .slice(0, 100)
    .map((v) => {
      const title = `RANSOMWARE: ${v.victim} — ${v.group}`;
      const link = v.source_url || `${getSiteUrl(env)}/threatintel/ransomware-activity`;
      const descParts = [
        `Group: ${v.group}`,
        v.origin ? `Source: ${v.origin}` : '',
        v.description ?? '',
      ].filter(Boolean);
      const pubDate = (() => {
        const t = Date.parse(v.discovered);
        return Number.isNaN(t) ? new Date().toUTCString() : new Date(t).toUTCString();
      })();
      const guid = `ransomware-merged:${v.group}:${v.victim}:${v.discovered}`;
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(descParts.join(' · '))}</description>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ransomware claims (merged)</title>
    <link>${getSiteUrl(env)}/threatintel/ransomware-activity</link>
    <description>Merged ransomware victim claims from Ransomlook, ransomware.live, ransomfeed.it, ransomwatch, and andreafortuna — deduped and sorted newest-first.</description>
${items}
  </channel>
</rss>`;
  return { xml, count: victims.length };
}

export async function ransomwareMergedRssHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { xml, count } = await buildRansomwareMergedRss(c.env);
  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': count > 0 ? 'public, max-age=300' : 'no-store',
    },
  });
}
