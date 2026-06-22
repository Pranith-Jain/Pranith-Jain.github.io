/** Minimal RSS/Atom item extraction shared by the RSS-backed discovery
 *  runners (scam, intel). Deliberately tiny — matches the inline regex
 *  approach already used by discovery/actor.ts.
 *  Supports namespace-prefixed elements (atom:link, dc:date, rss:item). */
const ITEM_RE = /<(?:[a-z]+:)?(?:item|entry)[\s\S]*?<\/(?:[a-z]+:)?(?:item|entry)>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/;
const LINK_RE = /<(?:[a-z]+:)?link[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?link>|<(?:[a-z]+:)?link[^>]*href="([^"]+)"/;
const DATE_RE =
  /<(?:[a-z]+:)?(?:pubDate|published|updated|date)[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?(?:pubDate|published|updated|date)>/;

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
    const d = ds ? new Date(ds.trim()) : now;
    if (!title) continue;
    out.push({ title, link, date: Number.isFinite(d.getTime()) ? d : now });
  }
  return out;
}
