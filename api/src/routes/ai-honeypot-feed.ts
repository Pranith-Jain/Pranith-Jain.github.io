import type { Context } from 'hono';
import type { Env } from '../env';

const FEED_JSON_URL = 'https://ai-honeypots.com/feeds/iocs.json';
const CACHE_TTL = 30 * 60;

export interface HoneypotIndicator {
  ioc_type: string;
  value: string;
  tlp: string;
  confidence: string;
  actor_category: string;
  ttps: string[];
  first_seen: string;
  last_seen: string;
  total_hits: number;
  distinct_personas: number;
  distinct_paths: number;
  prompt_count: number;
  user_agents: string[];
  models_requested: string[];
  interesting_paths: string[];
  sample_prompts: string[];
  details: string;
  source: string;
  honeypot_context: string;
}

export interface HoneypotFeedResponse {
  feed_id: string;
  feed_name: string;
  description: string;
  published: string;
  window_days: number;
  tlp: string;
  license: string;
  source_url: string;
  contact: string;
  taxonomy: {
    actor_categories: Record<string, string>;
    confidence_levels: Record<string, string>;
  };
  summary: {
    total_iocs: number;
    by_category: Record<string, number>;
    window_days: number;
  };
  indicators: HoneypotIndicator[];
}

export async function aiHoneypotFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://ai-honeypot-feed.internal/v2');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(FEED_JSON_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'pranithjain-dfir/1.0' },
    });
    if (!res.ok) return c.json({ error: `Upstream returned ${res.status}` }, 502);
    const data = (await res.json()) as HoneypotFeedResponse;
    const response = c.json(data, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*',
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    console.error('aiHoneypotFeedHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'Fetch failed' }, 502);
  }
}
