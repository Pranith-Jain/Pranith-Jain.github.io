import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Server-side feed aggregator. Cuts client-side network calls from N (one per
 * feed) to 1. Each call into the underlying proxy benefits from Cloudflare
 * edge caching, so 95% of work is the parse + sort, not the fetch.
 *
 * Response shape mirrors the per-feed proxy enough that the frontend can keep
 * its existing FeedItem type.
 *
 * GET /api/v1/feeds/aggregate?urls=<comma-separated-urls>
 *   - urls: comma-separated, URL-encoded list of feed URLs (max 50)
 *   - limit: max items to return after merging + sorting (default 30, max 100)
 *   - perSource: max items per source before global cap (default 3, max 10)
 *
 * Items are sorted newest-first by pubDate.
 */

const MAX_FEEDS = 50;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const DEFAULT_PER_SOURCE = 3;
const MAX_PER_SOURCE = 10;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 300; // 5 minutes — matches per-feed proxy cache

const ALLOWED_HOSTS = new Set([
  // Same allow-list as feeds.ts. Could be DRYed but inlining keeps this route
  // self-contained and avoids a circular dep.
  'www.cisa.gov',
  'cisa.gov',
  'us-cert.cisa.gov',
  'isc.sans.edu',
  'cert.europa.eu',
  'feeds.feedburner.com',
  'thehackernews.com',
  'krebsonsecurity.com',
  'www.bleepingcomputer.com',
  'bleepingcomputer.com',
  'www.securityweek.com',
  'securityweek.com',
  'www.theregister.com',
  'www.schneier.com',
  'www.wired.com',
  'threatfox.abuse.ch',
  'urlhaus.abuse.ch',
  'bazaar.abuse.ch',
  'mb-api.abuse.ch',
  'feodotracker.abuse.ch',
  'sslbl.abuse.ch',
  'openphish.com',
  'www.openphish.com',
  'dfir-lab.ch',
  'www.dfir-lab.ch',
  'falhumaid.github.io',
  'blog.talosintelligence.com',
  'talosintelligence.com',
  'unit42.paloaltonetworks.com',
  'www.welivesecurity.com',
  'welivesecurity.com',
  'securelist.com',
  'www.securelist.com',
  'www.crowdstrike.com',
  'crowdstrike.com',
  'www.sentinelone.com',
  'sentinelone.com',
  'flashpoint.io',
  'www.flashpoint.io',
  'msrc-blog.microsoft.com',
  'googleprojectzero.blogspot.com',
  'cloud.google.com',
  'research.checkpoint.com',
  'www.trendmicro.com',
  'news.sophos.com',
  'blog.malwarebytes.com',
  'www.volexity.com',
  'www.huntress.com',
  'redcanary.com',
  'www.malware-traffic-analysis.net',
  'doublepulsar.com',
  'www.hackmageddon.com',
  'www.infostealers.com',
  'medium.com',
  'darkwebinformer.com',
  'ransomware.live',
  'www.databreaches.net',
  'thedfirreport.com',
  'therecord.media',
  'www.curatedintel.org',
  'www.cyfirma.com',
  'www.reddit.com',
  'reddit.com',
  'old.reddit.com',
  'hnrss.org',
  'news.ycombinator.com',
  'www.ycombinator.com',
  'ycombinator.com',
  'rss.packetstormsecurity.com',
  'otx.alienvault.com',
  'www.helpnetsecurity.com',
  'www.csoonline.com',
  'www.cvedetails.com',
  'www.exploit-db.com',
  'raw.githubusercontent.com',
  // Scam Watch sources
  'consumer.ftc.gov',
  'www.ic3.gov',
  'ic3.gov',
  'www.snopes.com',
  'snopes.com',
  'news.google.com',
  'rekt.news',
  'www.web3isgoinggreat.com',
  'web3isgoinggreat.com',
  // Industry / fundraising / Tech & AI
  'techcrunch.com',
  'www.techcrunch.com',
  'venturebeat.com',
  'www.venturebeat.com',
  'www.theverge.com',
  'theverge.com',
  'feeds.arstechnica.com',
  'arstechnica.com',
  'www.technologyreview.com',
  'technologyreview.com',
  'openai.com',
  'www.openai.com',
  'blog.google',
]);

interface AggregatedItem {
  source: string; // hostname of the feed URL
  source_url: string; // original feed URL
  title: string;
  link: string;
  description?: string;
  pubDate: string; // ISO 8601 if parseable, else raw
  guid?: string;
}

interface AggregateResponse {
  generated_at: string;
  total_items: number;
  feeds_attempted: number;
  feeds_returned: number;
  items: AggregatedItem[];
}

/** Strip HTML / XML entities from a feed string. Keep it short and conservative. */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/<[^>]+>/g, '')
    .trim();
}

function pickTag(body: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = body.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function pickAttr(body: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = body.match(re);
  return m ? m[1] : '';
}

/** Parse RSS or Atom feed body into items. Tolerant; never throws. */
function parseFeedBody(body: string, sourceUrl: string, host: string, perSource: number): AggregatedItem[] {
  const items: AggregatedItem[] = [];
  // RSS <item> + Atom <entry>; both are matched with the same regex.
  const itemRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(body)) !== null) {
    const inner = match[2];
    const title = pickTag(inner, 'title') || '(untitled)';
    let link = pickTag(inner, 'link');
    if (!link) link = pickAttr(inner, 'link', 'href');
    if (!link) link = pickTag(inner, 'guid');
    const description = pickTag(inner, 'description') || pickTag(inner, 'summary') || pickTag(inner, 'content');
    const pubRaw = pickTag(inner, 'pubDate') || pickTag(inner, 'updated') || pickTag(inner, 'published') || '';
    const pubDate = pubRaw ? new Date(pubRaw).toISOString() : '';
    const guid = pickTag(inner, 'guid') || pickTag(inner, 'id') || link;
    items.push({
      source: host,
      source_url: sourceUrl,
      title: title.slice(0, 300),
      link,
      description: description ? description.slice(0, 500) : undefined,
      pubDate: pubDate || pubRaw,
      guid,
    });
    if (items.length >= perSource) break;
  }
  return items;
}

async function fetchOne(url: string, perSource: number): Promise<AggregatedItem[]> {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return [];
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) pranithjain-rss/1.0 Safari/537.36',
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });
    if (res.status === 429) {
      // Surface to wrangler tail so ops see which upstreams are pushing
      // back. Per-source degradation is acceptable here — the aggregator
      // returns whatever feeds DID succeed.
      console.warn(`feeds-aggregate: 429 from ${parsed.hostname} for ${url}`);
      return [];
    }
    if (!res.ok) return [];
    const body = await res.text();
    return parseFeedBody(body, url, parsed.hostname, perSource);
  } catch {
    return [];
  }
}

/**
 * Pure-data aggregator exposed for /api/v1/snapshot. Same logic as the HTTP
 * handler but returns the body directly so the snapshot endpoint can
 * compose without a worker-internal HTTP call.
 */
export async function aggregateFeeds(
  urls: string[],
  limit: number = DEFAULT_LIMIT,
  perSource: number = DEFAULT_PER_SOURCE
): Promise<AggregateResponse> {
  const cleanUrls = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_FEEDS);
  const cappedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const cappedPerSource = Math.min(perSource || DEFAULT_PER_SOURCE, MAX_PER_SOURCE);

  const settled = await Promise.allSettled(cleanUrls.map((u) => fetchOne(u, cappedPerSource)));
  const allItems: AggregatedItem[] = [];
  let feedsReturned = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.length > 0) {
      feedsReturned += 1;
      allItems.push(...s.value);
    }
  }

  allItems.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  return {
    generated_at: new Date().toISOString(),
    total_items: allItems.length,
    feeds_attempted: cleanUrls.length,
    feeds_returned: feedsReturned,
    items: allItems.slice(0, cappedLimit),
  };
}

export async function feedsAggregateHandler(c: Context<{ Bindings: Env }>) {
  const urlsParam = c.req.query('urls');
  if (!urlsParam) return c.json({ error: 'missing urls param' }, 400);

  const urls = urlsParam
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_FEEDS);
  if (urls.length === 0) return c.json({ error: 'no valid urls' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const perSource = Math.min(
    parseInt(c.req.query('perSource') ?? `${DEFAULT_PER_SOURCE}`, 10) || DEFAULT_PER_SOURCE,
    MAX_PER_SOURCE
  );

  // Cache the aggregated response in the Cache API too (key by query string).
  // 1-min cache so the page feels instant on subsequent loads but stays fresh.
  const cache = caches.default;
  const cacheKey = new Request(
    `https://feeds-agg.internal/?urls=${encodeURIComponent(urlsParam)}&limit=${limit}&perSource=${perSource}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
        'x-cache': 'HIT',
      },
    });
  }

  const settled = await Promise.allSettled(urls.map((u) => fetchOne(u, perSource)));
  const allItems: AggregatedItem[] = [];
  let feedsReturned = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.length > 0) {
      feedsReturned += 1;
      allItems.push(...s.value);
    }
  }

  // Sort newest first, then cap globally
  allItems.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  const body: AggregateResponse = {
    generated_at: new Date().toISOString(),
    total_items: allItems.length,
    feeds_attempted: urls.length,
    feeds_returned: feedsReturned,
    items: allItems.slice(0, limit),
  };
  const json = JSON.stringify(body);
  const response = new Response(json, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60',
      'x-cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
