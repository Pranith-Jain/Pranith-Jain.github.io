import { rssFeeds, type RSSFeed } from '../data/rssFeeds';

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category: string;
  guid?: string;
}

export interface FeedResult {
  feed: RSSFeed;
  items: FeedItem[];
  error?: string;
  lastUpdated: Date;
}

// Cache for feed data (5 minutes TTL)
const CACHE_TTL = 5 * 60 * 1000;
const feedCache = new Map<string, { data: FeedResult; timestamp: number }>();

// Parse XML/Atom feed to JSON
function parseFeed(text: string, feed: RSSFeed): FeedItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  const items: FeedItem[] = [];

  // Try RSS format first
  const rssItems = doc.querySelectorAll('item');
  if (rssItems.length > 0) {
    rssItems.forEach((item) => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const description =
        item.querySelector('description')?.textContent || item.querySelector('content\\:encoded')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const guid = item.querySelector('guid')?.textContent || link;

      items.push({
        title: sanitizeText(title),
        link: sanitizeUrl(link),
        description: sanitizeText(stripHtml(description)),
        pubDate,
        source: feed.name,
        category: feed.category,
        guid,
      });
    });
    return items;
  }

  // Try Atom format
  const atomItems = doc.querySelectorAll('entry');
  if (atomItems.length > 0) {
    atomItems.forEach((item) => {
      const title = item.querySelector('title')?.textContent || '';
      const linkEl = item.querySelector('link[href]') || item.querySelector('link');
      const link = linkEl?.getAttribute('href') || linkEl?.textContent || '';
      const description =
        item.querySelector('summary')?.textContent || item.querySelector('content')?.textContent || '';
      const pubDate = item.querySelector('published')?.textContent || item.querySelector('updated')?.textContent || '';
      const guid = item.querySelector('id')?.textContent || link;

      items.push({
        title: sanitizeText(title),
        link: sanitizeUrl(link),
        description: sanitizeText(stripHtml(description)),
        pubDate,
        source: feed.name,
        category: feed.category,
        guid,
      });
    });
    return items;
  }

  return items;
}

// Basic HTML stripper
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Sanitize text to prevent XSS
function sanitizeText(text: string): string {
  return stripHtml(text)
    .replace(/[<>'"]/g, '')
    .substring(0, 500);
}

// Validate and sanitize URL
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

// Fetch a single feed via our server-side RSS proxy (replaces public CORS proxies)
async function fetchFeedWithProxy(feed: RSSFeed): Promise<FeedResult> {
  const result: FeedResult = {
    feed,
    items: [],
    lastUpdated: new Date(),
  };

  // Check cache first
  const cached = feedCache.get(feed.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Same-origin URLs (synthesised feeds like /api/v1/feeds/abuse-rss?source=urlhaus)
    // are fetched directly. Cross-origin URLs go through the SSRF-safe proxy.
    const url = feed.url.startsWith('/') ? feed.url : `/api/v1/feeds/proxy?url=${encodeURIComponent(feed.url)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      result.error = `proxy returned ${response.status}`;
      return result;
    }
    const text = await response.text();
    result.items = parseFeed(text, feed);
    feedCache.set(feed.id, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'feed unavailable';
    return result;
  }
}

// Fetch multiple feeds in parallel
export async function fetchMultipleFeeds(feedIds: string[]): Promise<Map<string, FeedResult>> {
  const feeds = rssFeeds.filter((f) => feedIds.includes(f.id));
  const results = new Map<string, FeedResult>();

  await Promise.all(
    feeds.map(async (feed) => {
      const result = await fetchFeedWithProxy(feed);
      results.set(feed.id, result);
    })
  );

  return results;
}

/**
 * Stream feed results as each fetch resolves. The callback runs on every
 * settled feed, letting callers update the UI progressively instead of
 * waiting for all feeds to finish.
 *
 * NOTE: prefer `fetchAggregatedFeed` for the common case of "show me the
 * latest items across N feeds." It's one round trip vs. N here, and the
 * server already does the parsing + sorting + capping for you.
 */
export async function fetchFeedsProgressive(
  feedIds: string[],
  onResult: (id: string, result: FeedResult) => void
): Promise<void> {
  const feeds = rssFeeds.filter((f) => feedIds.includes(f.id));
  await Promise.all(
    feeds.map(async (feed) => {
      const result = await fetchFeedWithProxy(feed);
      onResult(feed.id, result);
    })
  );
}

export interface AggregatedFeedItem {
  source: string; // hostname
  source_url: string;
  title: string;
  link: string;
  description?: string;
  pubDate: string;
  guid?: string;
}

export interface AggregatedFeedResponse {
  generated_at: string;
  total_items: number;
  feeds_attempted: number;
  feeds_returned: number;
  items: AggregatedFeedItem[];
}

/**
 * Fetch many feeds via the server-side aggregator. Replaces N round-trips
 * to /feeds/proxy with a single round trip to /feeds/aggregate. The server
 * does the parallel fan-out, parses each feed, merges, sorts newest-first,
 * and returns the top `limit` items.
 *
 * 60-second client cache + 60-second edge cache. For the common feed-widget
 * use case this is much faster than `fetchFeedsProgressive` and uses far
 * fewer network requests.
 *
 * Returns:
 *   - null   only when zero feeds in the requested set are aggregator-
 *            eligible (local config issue — callers can treat as "no data
 *            to show" without alarming the user).
 *   - throws on HTTP / network / timeout errors with a descriptive message
 *            so the page-level error UI surfaces the real reason instead
 *            of a generic "Aggregator returned no data". Previously all
 *            three failure modes collapsed to null + a useless string.
 */
export async function fetchAggregatedFeed(
  feedIds: string[],
  options: { limit?: number; perSource?: number } = {}
): Promise<AggregatedFeedResponse | null> {
  const feeds = rssFeeds.filter((f) => feedIds.includes(f.id));
  if (feeds.length === 0) return null;
  const urls = feeds
    .map((f) => f.url)
    .filter((u) => !u.startsWith('/')) // synthesised feeds aren't aggregator-eligible
    .join(',');
  if (!urls) return null;
  // Defaults raised in step with the route's DEFAULT_LIMIT/MAX_LIMIT bump
  // (100 / 500). The route enforces caps; callers can still pass smaller
  // values when they want a tight preview.
  const limit = options.limit ?? 100;
  const perSource = options.perSource ?? 5;
  const url = `/api/v1/feeds/aggregate?urls=${encodeURIComponent(urls)}&limit=${limit}&perSource=${perSource}`;
  let res: Response;
  try {
    // 15s was too tight: the aggregator fans out to N feeds (10-30 in the
    // common paths) and the slowest tail is regularly 8-12s on the worker
    // edge. A single slow feed shouldn't paint the whole call as failed.
    res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error';
    if (reason.toLowerCase().includes('timed out') || reason.toLowerCase().includes('abort')) {
      throw new Error('feed aggregator timed out (25s) — upstream RSS sources are slow right now');
    }
    throw new Error(`feed aggregator unreachable: ${reason}`);
  }
  if (!res.ok) {
    throw new Error(`feed aggregator returned ${res.status} ${res.statusText}`.trim());
  }
  try {
    return (await res.json()) as AggregatedFeedResponse;
  } catch {
    throw new Error('feed aggregator returned a malformed response');
  }
}

// Get all feeds
export async function fetchAllFeeds(): Promise<Map<string, FeedResult>> {
  return fetchMultipleFeeds(rssFeeds.map((f) => f.id));
}

// Get single feed by ID
export async function fetchSingleFeed(feedId: string): Promise<FeedResult | null> {
  const feed = rssFeeds.find((f) => f.id === feedId);
  if (!feed) return null;

  return fetchFeedWithProxy(feed);
}

// Clear cache
export function clearFeedCache(): void {
  feedCache.clear();
}

// Get cache stats
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: feedCache.size,
    entries: Array.from(feedCache.keys()),
  };
}

// Filter and sort feed items
export function sortFeedItems(
  items: FeedItem[],
  options: {
    sortBy?: 'date' | 'source';
    filter?: string;
    limit?: number;
  } = {}
): FeedItem[] {
  let filtered = [...items];

  // Filter by category/source
  const filterValue = options.filter;
  if (filterValue && filterValue !== 'all') {
    filtered = filtered.filter(
      (item) => item.category === filterValue || item.source.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  // Sort by date
  if (options.sortBy === 'date') {
    filtered.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime() || 0;
      const dateB = new Date(b.pubDate).getTime() || 0;
      return dateB - dateA;
    });
  }

  // Limit results
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

// Format relative time
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  } catch {
    return '';
  }
}
