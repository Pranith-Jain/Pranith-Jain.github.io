import type { Context } from 'hono';
import type { Env } from '../env';

interface FeedCatalogEntry {
  vendor: string;
  description: string;
  category: string;
  url: string;
  raw_url: string;
  status: string;
}

interface FeedCatalogResponse {
  generated_at: string;
  total: number;
  active: number;
  vendors: string[];
  categories: string[];
  entries: FeedCatalogEntry[];
}

const CSV_URL = 'https://raw.githubusercontent.com/Bert-JanP/Open-Source-Threat-Intel-Feeds/main/ThreatIntelFeeds.csv';
const CACHE_TTL = 3600;

/** Convert GitHub blob URLs to raw.githubusercontent.com URLs */
function toRawUrl(url: string): string {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]!}/${match[2]!}/${match[3]!}/${match[4]!}`;
  }
  return url;
}

export async function feedCatalogHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const res = await fetch(CSV_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: '*/*' },
      cf: { cacheTtl: 3000, cacheEverything: true },
    });
    if (!res.ok) {
      return c.json({ error: 'failed to fetch feed catalog' }, 502);
    }
    const text = await res.text();

    const entries: FeedCatalogEntry[] = [];
    const vendorSet = new Set<string>();
    const categorySet = new Set<string>();

    const lines = text.split('\n');
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;

      const cols = line.split(';');
      if (cols.length < 5) continue;

      const vendor = cols[0]!.trim();
      const description = cols[1]!.trim();
      const category = cols[2]!.trim();
      const url = cols[3]!.trim();
      const status = cols[4]!.trim();

      if (!url) continue;

      vendorSet.add(vendor);
      categorySet.add(category);

      entries.push({
        vendor,
        description,
        category,
        url,
        raw_url: toRawUrl(url),
        status,
      });
    }

    const body: FeedCatalogResponse = {
      generated_at: new Date().toISOString(),
      total: entries.length,
      active: entries.filter((e) => e.status === 'Active').length,
      vendors: [...vendorSet].sort(),
      categories: [...categorySet].sort(),
      entries,
    };

    return c.json(body, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: String(e) }, 500);
  }
}
