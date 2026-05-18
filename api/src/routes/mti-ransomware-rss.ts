/**
 * MyThreatIntel ransomware → synthesised RSS 2.0.
 *
 * The MyThreatIntel (t.me/s/mythreatintel) ransomware alerts are already
 * parsed for /api/v1/ransomware-recent. This endpoint re-publishes that same
 * structured data as a standard RSS feed so it can appear as its OWN
 * selectable, labelled source in the RSS feed lists (Dark Web / Threat
 * Feeds) — the same treatment the abuse.ch CSV→RSS shim gets.
 *
 * Served at an absolute same-origin URL so it flows through the normal feed
 * aggregator (which only takes http(s) URLs); the underlying t.me HTML is
 * shared-cached 5min by the parser, so this is cheap.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchMythreatintelRansomwareVictims } from '../lib/mythreatintel-parser';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The synthesised feed's stable same-origin path (single source of truth). */
export const MTI_RANSOMWARE_FEED_PATH = '/api/v1/feeds/mti-ransomware';

/**
 * Build the RSS 2.0 XML. Exported so the feed aggregator can resolve this
 * synthesised feed IN-PROCESS rather than HTTP self-fetching the Worker's
 * own hostname (which is unreliable). Returns `{ xml, count }`.
 */
export async function buildMtiRansomwareRss(): Promise<{ xml: string; count: number }> {
  let victims: Awaited<ReturnType<typeof fetchMythreatintelRansomwareVictims>> = [];
  try {
    victims = await fetchMythreatintelRansomwareVictims();
  } catch {
    victims = [];
  }

  const items = victims
    .slice(0, 100)
    .map((v) => {
      const title = `RANSOMWARE: ${v.victim} — ${v.group}${v.country ? ` (${v.country})` : ''}`;
      const link = v.source_url || 'https://t.me/s/mythreatintel';
      const descParts = [
        `Group: ${v.group}`,
        v.country ? `Country: ${v.country}` : '',
        v.sector ? `Sector: ${v.sector}` : '',
        v.description ?? '',
      ].filter(Boolean);
      const pubDate = (() => {
        const t = Date.parse(v.discovered);
        return Number.isNaN(t) ? new Date().toUTCString() : new Date(t).toUTCString();
      })();
      const guid = `mti-ransomware:${v.group}:${v.victim}:${v.discovered}`;
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
    <title>MyThreatIntel — ransomware</title>
    <link>https://t.me/s/mythreatintel</link>
    <description>Ransomware victim claims parsed from the MyThreatIntel CTI channel.</description>
${items}
  </channel>
</rss>`;
  return { xml, count: victims.length };
}

export async function mtiRansomwareRssHandler(_c: Context<{ Bindings: Env }>): Promise<Response> {
  const { xml, count } = await buildMtiRansomwareRss();
  // No-store when empty so a transient parse miss isn't pinned by the edge.
  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': count > 0 ? 'public, max-age=300' : 'no-store',
    },
  });
}
