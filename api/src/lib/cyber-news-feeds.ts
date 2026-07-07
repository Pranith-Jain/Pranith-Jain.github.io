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

export type FeedTier = 1 | 2 | 3 | 4 | 5;

interface FeedSource {
  url: string;
  tier: FeedTier;
}

const FEEDS: Record<string, FeedSource> = {
  /* Tier 1 — core adversary / CISA / primary sources */
  'CISA Advisories': { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', tier: 1 },
  Rapid7: { url: 'https://blog.rapid7.com/rss/', tier: 1 },
  'Risky Bulletin': { url: 'https://risky.biz/feed/', tier: 1 },
  '404 Media': { url: 'https://www.404media.co/rss/', tier: 1 },
  'NCSC UK': { url: 'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml', tier: 1 },
  'Krebs on Security': { url: 'https://krebsonsecurity.com/feed/', tier: 1 },
  'Palo Alto Unit 42': { url: 'https://unit42.paloaltonetworks.com/feed/', tier: 1 },
  Mandiant: { url: 'https://www.mandiant.com/resources/blog/recent.xml', tier: 1 },
  'Cisco Talos': { url: 'https://blog.talosintelligence.com/feed/', tier: 1 },
  'SANS ISC': { url: 'https://isc.sans.edu/rssfeed.xml', tier: 1 },
  'Volexity': { url: 'https://www.volexity.com/blog/feed/', tier: 1 },

  /* Tier 2 — major security news & vendor research */
  'Packet Storm': { url: 'https://rss.packetstormsecurity.com/files/', tier: 2 },
  'Cybersecurity Dive': { url: 'https://www.cybersecuritydive.com/feeds/news/', tier: 2 },
  'Schneier on Security': { url: 'https://www.schneier.com/feed/', tier: 2 },
  'Dark Reading': { url: 'https://www.darkreading.com/rss.xml', tier: 2 },
  'SecurityWeek': { url: 'https://www.securityweek.com/feed/', tier: 2 },
  'The Record': { url: 'https://therecord.media/feed/', tier: 2 },
  'Threatpost': { url: 'https://threatpost.com/feed/', tier: 2 },
  'Naked Security': { url: 'https://nakedsecurity.sophos.com/feed/', tier: 2 },
  'CrowdStrike Blog': { url: 'https://www.crowdstrike.com/blog/feed/', tier: 2 },
  'SentinelOne Blog': { url: 'https://www.sentinelone.com/blog/feed/', tier: 2 },
  'Microsoft Security': { url: 'https://www.microsoft.com/en-us/security/blog/feed/', tier: 2 },
  'Elastic Security': { url: 'https://www.elastic.co/security-labs/feed.xml', tier: 2 },
  'Recorded Future': { url: 'https://www.recordedfuture.com/feed/', tier: 2 },
  Dragos: { url: 'https://www.dragos.com/blog/feed/', tier: 2 },
  WithSecure: { url: 'https://www.withsecure.com/en/research/rss.xml', tier: 2 },
  'Kaspersky Blog': { url: 'https://securelist.com/feed/', tier: 2 },

  /* Tier 3 — secondary news, industry & community */
  'The Hacker News': { url: 'https://feeds.feedburner.com/TheHackersNews', tier: 3 },
  BleepingComputer: { url: 'https://www.bleepingcomputer.com/feed/', tier: 3 },
  CyberSecurityNews: { url: 'https://cybersecuritynews.com/feed/', tier: 3 },
  StateScoop: { url: 'https://statescoop.com/feed/', tier: 3 },
  FedScoop: { url: 'https://fedscoop.com/feed/', tier: 3 },
  'Tao Security': { url: 'https://taosecurity.blogspot.com/feeds/posts/default', tier: 3 },
  'Ars Technica Security': { url: 'https://feeds.arstechnica.com/arstechnica/security', tier: 3 },
  'Wired Security': { url: 'https://www.wired.com/feed/category/security/latest/rss', tier: 3 },
  'Infosecurity Magazine': { url: 'https://www.infosecurity-magazine.com/rss/news/', tier: 3 },
  'SC Media': { url: 'https://www.scmagazine.com/feed', tier: 3 },
  'CSO Online': { url: 'https://www.csoonline.com/feed/', tier: 3 },
  'Trend Micro': { url: 'https://www.trendmicro.com/vinfo/us/security/rss/news', tier: 3 },
  ACTH: { url: 'https://acth.org/feed/', tier: 3 },

  /* Tier 4 — vendor long-form, offensive / red team & niche */
  'GitHub Security': { url: 'https://github.blog/security/feed/', tier: 4 },
  'Zero Day Initiative': { url: 'https://www.zerodayinitiative.com/rss/published/', tier: 4 },
  'ZDNet Security': { url: 'https://www.zdnet.com/topic/security/rss.xml', tier: 4 },
  Sektor7: { url: 'https://blog.sektor7.net/rss/', tier: 4 },
  'XPN InfoSec': { url: 'https://blog.xpnsec.com/rss.xml', tier: 4 },
  'ired.team': { url: 'https://www.ired.team/feed.xml', tier: 4 },
  SpecterOps: { url: 'https://posts.specterops.io/feed', tier: 4 },
  MDSec: { url: 'https://www.mdsec.co.uk/feed/', tier: 4 },
  OUTFLANK: { url: 'https://outflank.nl/blog/feed/', tier: 4 },
  Domchell: { url: 'https://domchell.medium.com/feed', tier: 4 },
  'Research!rsc': { url: 'https://research.swtch.com/feed.xml', tier: 4 },
  N00py: { url: 'https://n00py.io/feed/', tier: 4 },
  Crummie5: { url: 'https://crummie5.github.io/feed.xml', tier: 4 },

  /* Tier 5 — community / social */
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
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
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
 * Aggregate cybersecurity news from 55+ RSS feeds across 5 tiers.
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
