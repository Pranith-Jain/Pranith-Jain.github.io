/**
 * Unified Threat Feed Aggregator
 *
 * Aggregates feeds from multiple sources, deduplicates, scores by relevance,
 * and surfaces trending threats. Combines data from existing feed routes into
 * a single ranked stream.
 *
 * GET /api/v1/ti/feed-aggregate — Get aggregated, deduplicated feed
 * GET /api/v1/ti/feed-trending — Get trending threats by velocity
 * GET /api/v1/ti/feed-stats — Get feed health and coverage stats
 */

import { Hono } from 'hono';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface FeedEnv {
  BRIEFINGS_DB: D1Database;
  KV_CACHE: KVNamespace;
}

interface FeedItem {
  id: string;
  source: string;
  type: 'cve' | 'ioc' | 'ransomware' | 'malware' | 'breach' | 'actor' | 'advisory' | 'research';
  title: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  timestamp: string;
  tags: string[];
  url?: string;
  iocs?: string[];
  cve_id?: string;
  actor?: string;
  sector?: string[];
  country?: string[];
  score: number;
  trending: boolean;
  duplicate_of?: string;
}

interface TrendingThreat {
  topic: string;
  count: number;
  velocity: number;
  first_seen: string;
  last_seen: string;
  sources: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  related_items: FeedItem[];
}

const feed = new Hono<{ Bindings: FeedEnv }>();

// In-memory dedup cache (resets on cold start, fine for this use case)
const recentHashes = new Map<string, string>();

function hashItem(item: Partial<FeedItem>): string {
  const key = `${item.type}:${item.title?.toLowerCase().trim()}`.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function computeScore(item: FeedItem): number {
  let score = 0;

  // Severity weight
  const severityWeight: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10, info: 5 };
  score += severityWeight[item.severity] || 0;

  // Source diversity bonus
  score += Math.min(item.confidence * 0.3, 15);

  // Recency decay (items lose 50% score per 12 hours)
  const ageHours = (Date.now() - new Date(item.timestamp).getTime()) / 3600000;
  const recencyFactor = Math.pow(0.5, ageHours / 12);
  score *= recencyFactor;

  // IOCs present bonus
  if (item.iocs && item.iocs.length > 0) score += Math.min(item.iocs.length * 2, 10);

  // CVE present bonus
  if (item.cve_id) score += 5;

  // Actor attribution bonus
  if (item.actor) score += 5;

  // Tag diversity
  score += Math.min(item.tags.length, 5);

  return Math.round(score * 10) / 10;
}

feed.get('/feed-aggregate', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const kv = c.env.KV_CACHE;
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const type = c.req.query('type');
  const minScore = parseFloat(c.req.query('minScore') || '0');
  const hours = parseInt(c.req.query('hours') || '48');

  // Try KV cache first
  const cacheKey = `ti:aggregate:${type || 'all'}:${hours}h:${limit}`;
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return c.json(cached);

  const items: FeedItem[] = [];
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  // Gather from existing tables
  const queries: Promise<{ results: FeedItem[] }>[] = [];

  // Ransomware
  if (!type || type === 'ransomware') {
    queries.push(
      db
        .prepare(
          `
      SELECT id, 'ransomware' as type, group_name as title, description as summary,
        'high' as severity, created_at as timestamp, url
      FROM ransomware_groups
      WHERE created_at > ?
      ORDER BY created_at DESC LIMIT 100
    `
        )
        .bind(since)
        .all<FeedItem>()
        .catch(() => ({ results: [] }))
    );
  }

  // CVEs
  if (!type || type === 'cve') {
    queries.push(
      db
        .prepare(
          `
      SELECT cve_id as id, 'cve' as type, cve_id as title, description as summary,
        severity, published_at as timestamp, url
      FROM cve_recent
      WHERE published_at > ?
      ORDER BY published_at DESC LIMIT 100
    `
        )
        .bind(since)
        .all<FeedItem>()
        .catch(() => ({ results: [] }))
    );
  }

  // IOCs
  if (!type || type === 'ioc') {
    queries.push(
      db
        .prepare(
          `
      SELECT indicator as id, 'ioc' as type, indicator as title, CONCAT(type, ' indicator') as summary,
        'medium' as severity, first_seen as timestamp
      FROM live_iocs
      WHERE first_seen > ?
      ORDER BY first_seen DESC LIMIT 100
    `
        )
        .bind(since)
        .all<FeedItem>()
        .catch(() => ({ results: [] }))
    );
  }

  // Briefings
  if (!type || type === 'advisory') {
    queries.push(
      db
        .prepare(
          `
      SELECT id, 'advisory' as type, title, SUBSTR(body, 1, 200) as summary,
        'medium' as severity, date as timestamp
      FROM briefings
      WHERE date > ?
      ORDER BY date DESC LIMIT 50
    `
        )
        .bind(since.slice(0, 10))
        .all<FeedItem>()
        .catch(() => ({ results: [] }))
    );
  }

  const results = await Promise.all(queries);

  for (const result of results) {
    if (result.results) {
      items.push(...result.results);
    }
  }

  // Dedup
  const deduped: FeedItem[] = [];

  for (const item of items) {
    const hash = hashItem(item);
    if (recentHashes.has(hash)) {
      item.duplicate_of = recentHashes.get(hash);
      continue;
    }
    recentHashes.set(hash, item.id);
    deduped.push(item);
  }

  // Clean old hashes
  for (const [hash, _] of recentHashes) {
    if (recentHashes.size > 10000) recentHashes.delete(hash);
  }

  // Score and sort
  for (const item of deduped) {
    item.score = computeScore(item);
  }

  const sorted = deduped
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const response = {
    items: sorted,
    total: sorted.length,
    filters: { type, minScore, hours },
    generated_at: new Date().toISOString(),
  };

  // Cache for 5 minutes
  await kv.put(cacheKey, JSON.stringify(response), { expirationTtl: 300 });

  return c.json(response);
});

feed.get('/feed-trending', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const kv = c.env.KV_CACHE;
  const hours = parseInt(c.req.query('hours') || '24');
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 30);

  const cacheKey = `ti:trending:${hours}h`;
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return c.json(cached);

  const since = new Date(Date.now() - hours * 3600000).toISOString();

  // Get recent items grouped by type/title - handle missing tables gracefully
  let recentItems: {
    title: string;
    type: string;
    count: number;
    first_seen: string;
    last_seen: string;
    sources: string;
  }[] = [];
  try {
    const result = await db
      .prepare(
        `
      SELECT title, type, COUNT(*) as count, MIN(created_at) as first_seen,
        MAX(created_at) as last_seen, GROUP_CONCAT(DISTINCT source) as sources
      FROM (
        SELECT group_name as title, 'ransomware' as type, 'ransomware' as source, created_at
        FROM ransomware_groups WHERE created_at > ?
        UNION ALL
        SELECT cve_id as title, 'cve' as type, 'nvd' as source, published_at as created_at
        FROM cve_recent WHERE published_at > ?
        UNION ALL
        SELECT indicator as title, 'ioc' as type, source, first_seen as created_at
        FROM live_iocs WHERE first_seen > ?
      )
      GROUP BY title, type
      HAVING count >= 2
      ORDER BY count DESC
      LIMIT ?
    `
      )
      .bind(since, since, since, limit)
      .all<{
        title: string;
        type: string;
        count: number;
        first_seen: string;
        last_seen: string;
        sources: string;
      }>();
    recentItems = result.results || [];
  } catch {
    // Tables may not exist - return empty trending
  }

  const trending: TrendingThreat[] = (recentItems || []).map((item) => {
    const ageHours = Math.max(1, (Date.now() - new Date(item.first_seen).getTime()) / 3600000);
    return {
      topic: item.title,
      count: item.count,
      velocity: Math.round((item.count / ageHours) * 100) / 100,
      first_seen: item.first_seen,
      last_seen: item.last_seen,
      sources: (item.sources || '').split(',').filter(Boolean),
      severity: item.count > 10 ? 'critical' : item.count > 5 ? 'high' : 'medium',
      related_items: [],
    };
  });

  const response = { trending, period_hours: hours, generated_at: new Date().toISOString() };
  await kv.put(cacheKey, JSON.stringify(response), { expirationTtl: 600 });

  return c.json(response);
});

feed.get('/feed-stats', async (c) => {
  const db = c.env.BRIEFINGS_DB;

  const stats = await Promise.all([
    db
      .prepare('SELECT COUNT(*) as cnt FROM ransomware_groups')
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare('SELECT COUNT(*) as cnt FROM cve_recent')
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare('SELECT COUNT(*) as cnt FROM live_iocs')
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare('SELECT COUNT(*) as cnt FROM briefings')
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare("SELECT COUNT(*) as cnt FROM ransomware_groups WHERE created_at > datetime('now', '-24 hours')")
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare("SELECT COUNT(*) as cnt FROM cve_recent WHERE published_at > datetime('now', '-24 hours')")
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare("SELECT COUNT(*) as cnt FROM live_iocs WHERE first_seen > datetime('now', '-24 hours')")
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
  ]);

  return c.json({
    totals: {
      ransomware_groups: stats[0]?.cnt ?? 0,
      cves: stats[1]?.cnt ?? 0,
      iocs: stats[2]?.cnt ?? 0,
      briefings: stats[3]?.cnt ?? 0,
    },
    last_24h: {
      ransomware_groups: stats[4]?.cnt ?? 0,
      cves: stats[5]?.cnt ?? 0,
      iocs: stats[6]?.cnt ?? 0,
    },
    generated_at: new Date().toISOString(),
  });
});

export default feed;
