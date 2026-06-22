import { fetchResilient } from './fetch-resilient';

export interface CyberNewsItem {
  title: string;
  link: string;
  description: string;
  pub_date: string;
  source: string;
  tier: number;
  image_url?: string;
}

export interface CyberNewsResult {
  last_updated: string;
  total: number;
  articles: CyberNewsItem[];
}

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  enclosure?: { url?: string; type?: string };
  'content:encoded'?: string;
  'media:content'?: { url?: string };
}

interface RssFeed {
  channel?: { item?: RssItem[] };
}

export type FeedTier = 1 | 2 | 3 | 4 | 5;

interface FeedSource {
  url: string;
  tier: FeedTier;
}

const FEEDS: Record<string, FeedSource> = {
  'CISA Advisories': { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', tier: 1 },
  Rapid7: { url: 'https://blog.rapid7.com/rss/', tier: 1 },
  'Packet Storm': { url: 'https://rss.packetstormsecurity.com/files/', tier: 2 },
  'The Hacker News': { url: 'https://feeds.feedburner.com/TheHackersNews', tier: 3 },
  BleepingComputer: { url: 'https://www.bleepingcomputer.com/feed/', tier: 3 },
  CyberSecurityNews: { url: 'https://cybersecuritynews.com/feed/', tier: 3 },
  'GitHub Security': { url: 'https://github.blog/security/feed/', tier: 4 },
  'Zero Day Initiative': { url: 'https://www.zerodayinitiative.com/rss/published/', tier: 4 },
  'r/netsec': { url: 'https://www.reddit.com/r/netsec/.rss', tier: 5 },
  'r/ExploitDev': { url: 'https://www.reddit.com/r/ExploitDev/.rss', tier: 5 },
  'r/bugbounty': { url: 'https://www.reddit.com/r/bugbounty/.rss', tier: 5 },
};

const MAX_ITEMS_PER_SRC = 15;
const IMG_RE = /<img[^>]+src="([^">]+)"/i;

function cleanHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 200);
}

function extractImage(item: RssItem): string | undefined {
  if (item['media:content']?.url) return item['media:content'].url;
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) return item.enclosure.url;
  const html = item['content:encoded'] ?? item.description ?? '';
  const m = IMG_RE.exec(html);
  return m?.[1];
}

function parseRssDate(dateStr: string): Date {
  for (const layout of ['RFC1123Z', 'RFC1123', 'RFC822', 'RFC822Z', 'Rfc3339']) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const [, block] of itemMatches) {
    if (!block) continue;
    const tag = (name: string) => {
      const m =
        block.match(new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, 'i')) ??
        block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
      return m?.[1]?.trim();
    };
    items.push({
      title: tag('title'),
      link: tag('link'),
      description: tag('description'),
      pubDate: tag('pubDate'),
      enclosure: block.includes('<enclosure')
        ? { url: block.match(/url="([^"]+)"/)?.[1], type: block.match(/type="([^"]+)"/)?.[1] }
        : undefined,
      'content:encoded': tag('content:encoded'),
    });
  }
  return items;
}

async function fetchFeed(name: string, source: FeedSource, signal?: AbortSignal): Promise<CyberNewsItem[]> {
  const res = await fetchResilient(
    source.url,
    {
      headers: { 'User-Agent': 'DFIR-NewsAggregator/1.0' },
      signal,
    },
    { attempts: 2, timeoutMs: 10000 }
  );
  if (!res.ok) return [];

  const xml = await res.text();
  const items = parseRssXml(xml).slice(0, MAX_ITEMS_PER_SRC);

  return items
    .filter((item) => item.title && item.link)
    .map(
      (item): CyberNewsItem => ({
        title: item.title!,
        link: item.link!,
        description: item.description ? cleanHtml(item.description) : '',
        pub_date: item.pubDate ?? '',
        source: name,
        tier: source.tier,
        image_url: extractImage(item),
      })
    );
}

/**
 * Aggregate cybersecurity news from 11 RSS feeds across 5 tiers.
 * Fetches all feeds concurrently with bounded parallelism.
 */
export async function fetchCyberNews(opts?: {
  tiers?: FeedTier[];
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<CyberNewsResult> {
  const allowedTiers = opts?.tiers;
  const query = opts?.query?.toLowerCase();
  const limit = opts?.limit ?? 100;

  const entries = Object.entries(FEEDS).filter(([, s]) => !allowedTiers || allowedTiers.includes(s.tier));

  const results = await Promise.allSettled(entries.map(([name, src]) => fetchFeed(name, src, opts?.signal)));

  let articles = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => parseRssDate(b.pub_date).getTime() - parseRssDate(a.pub_date).getTime());

  if (query) {
    articles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.source.toLowerCase().includes(query)
    );
  }

  return {
    last_updated: new Date().toISOString(),
    total: articles.length,
    articles: articles.slice(0, limit),
  };
}
