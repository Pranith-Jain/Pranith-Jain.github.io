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
      const description = item.querySelector('description')?.textContent || 
                         item.querySelector('content\\:encoded')?.textContent || '';
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
      const description = item.querySelector('summary')?.textContent || 
                         item.querySelector('content')?.textContent || '';
      const pubDate = item.querySelector('published')?.textContent || 
                      item.querySelector('updated')?.textContent || '';
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

// Fetch a single feed with CORS proxy fallback
async function fetchFeedWithProxy(feed: RSSFeed): Promise<FeedResult> {
  const cacheKey = feed.id;
  const cached = feedCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const result: FeedResult = {
    feed,
    items: [],
    lastUpdated: new Date(),
  };
  
  // CORS proxy options (try multiple)
  const corsProxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
  ];
  
  for (const proxy of corsProxies) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${proxy}${encodeURIComponent(feed.url)}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const text = await response.text();
        result.items = parseFeed(text, feed);
        result.lastUpdated = new Date();
        
        feedCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        
        return result;
      }
    } catch {
      continue;
    }
  }
  
  result.error = 'Unable to fetch feed. Try refreshing or check your connection.';
  return result;
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
  if (options.filter && options.filter !== 'all') {
    filtered = filtered.filter(
      (item) =>
        item.category === options.filter ||
        item.source.toLowerCase().includes(options.filter.toLowerCase())
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