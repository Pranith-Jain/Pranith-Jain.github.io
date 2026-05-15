/** Minimal RSS/Atom item extraction shared by the RSS-backed discovery
 *  runners (scam, intel). Deliberately tiny — matches the inline regex
 *  approach already used by discovery/actor.ts. */
const ITEM_RE = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/;
const LINK_RE = /<link[^>]*>([\s\S]*?)<\/link>|<link[^>]*href="([^"]+)"/;
const DATE_RE = /<(?:pubDate|published|updated)>([\s\S]*?)<\/(?:pubDate|published|updated)>/;

export interface RssItem {
  title: string;
  link: string;
  date: Date;
}

export function parseRssItems(xml: string, now: Date): RssItem[] {
  const out: RssItem[] = [];
  for (const block of xml.match(ITEM_RE) ?? []) {
    const title = (block.match(TITLE_RE)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const lm = block.match(LINK_RE);
    const link = (lm?.[1] || lm?.[2] || '').trim();
    const ds = block.match(DATE_RE)?.[1];
    const d = ds ? new Date(ds) : now;
    if (!title) continue;
    out.push({ title, link, date: Number.isFinite(d.getTime()) ? d : now });
  }
  return out;
}
