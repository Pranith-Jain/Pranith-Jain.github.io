/**
 * CTI Collector — automated multi-source IOC ingestion
 *
 * Pulls from free feeds (abuse.ch, CISA KEV, NVD, RSS news) and stores
 * normalized IOCs in D1 with decay scoring. Runs on a cron schedule.
 *
 * Decay scoring: each IOC type has a half-life after which its score decays.
 * IPs: 5 days, Domains: 14 days, Hashes: 30 days, URLs: 7 days.
 */

import type { D1Database } from '@cloudflare/workers-types';

const FETCH_TIMEOUT_MS = 15_000;
const HEADERS = { 'User-Agent': 'PranithJain-CTI/1.0' };

// Half-life in days per IOC type
const DECAY_HALF_LIFE: Record<string, number> = {
  ip: 5,
  domain: 14,
  url: 7,
  hash: 30,
  email: 10,
};

interface CollectedIoc {
  value: string;
  type: string;
  source: string;
  confidence: number;
  malware_family?: string;
  threat_actor?: string;
  tags?: string[];
  raw_json?: Record<string, unknown>;
  first_seen: string;
}

interface CollectedNews {
  title: string;
  url: string;
  summary: string;
  source: string;
  published: string;
  tags?: string[];
}

// ── Fetch helpers ──────────────────────────────────────────────────────

async function safeFetch(url: string, opts: RequestInit = {}): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { ...HEADERS, ...((opts.headers as Record<string, string>) || {}) },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

// ── Abuse.ch sources ───────────────────────────────────────────────────

async function fetchThreatFox(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...HEADERS },
    body: JSON.stringify({ query: 'get_iocs', days: 1 }),
  });
  if (!res) return [];
  const data = (await res.json()) as { query_status: string; data: Array<Record<string, unknown>> };
  if (data.query_status !== 'ok') return [];
  const now = new Date().toISOString();
  return (data.data || [])
    .map((item) => ({
      value: String(item.ioc || ''),
      type: String(item.ioc_type || 'unknown'),
      source: 'threatfox',
      confidence: Number(item.confidence_level || 50),
      malware_family: String(item.malware_printable || item.malware || ''),
      tags: (item.tags as string[]) || [],
      raw_json: item,
      first_seen: String(item.first_seen || now),
    }))
    .filter((i) => i.value);
}

async function fetchUrlhaus(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', { timeout: FETCH_TIMEOUT_MS } as never);
  if (!res) {
    // Fallback: CSV bulk feed
    const csvRes = await safeFetch('https://urlhaus.abuse.ch/downloads/csv_online/');
    if (!csvRes) return [];
    const text = await csvRes.text();
    const now = new Date().toISOString();
    return text
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .slice(0, 300)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim().replace(/"/g, ''));
        return {
          value: parts[2] || '',
          type: 'url',
          source: 'urlhaus',
          confidence: 75,
          tags: parts[6] ? parts[6].split(',').map((t: string) => t.trim()) : [],
          first_seen: parts[1] || now,
        };
      })
      .filter((i) => i.value && i.value.startsWith('http'));
  }
  const data = (await res.json()) as { urls: Array<Record<string, unknown>> };
  const now = new Date().toISOString();
  return (data.urls || [])
    .slice(0, 200)
    .map((item) => ({
      value: String(item.url || ''),
      type: 'url',
      source: 'urlhaus',
      confidence: 75,
      tags: (item.tags as string[]) || [],
      raw_json: item,
      first_seen: String(item.date_added || now),
    }))
    .filter((i) => i.value);
}

async function fetchMalwareBazaar(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://mb-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...HEADERS },
    body: 'query=get_recent&selector=100',
  });
  if (!res) return [];
  const data = (await res.json()) as { query_status: string; data: Array<Record<string, unknown>> };
  if (data.query_status !== 'ok') return [];
  const now = new Date().toISOString();
  return (data.data || [])
    .slice(0, 200)
    .map((item) => ({
      value: String(item.sha256_hash || item.md5_hash || ''),
      type: 'hash',
      source: 'malwarebazaar',
      confidence: 80,
      malware_family: String(item.signature || ''),
      tags: (item.tags as string[]) || [],
      raw_json: item,
      first_seen: String(item.first_seen || now),
    }))
    .filter((i) => i.value);
}

async function fetchFeodoTracker(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json');
  if (!res) return [];
  const data = (await res.json()) as Array<Record<string, unknown>> | { blocklist: Array<Record<string, unknown>> };
  const items = Array.isArray(data) ? data : data.blocklist || [];
  const now = new Date().toISOString();
  return items
    .map((item) => ({
      value: String(item.ip_address || ''),
      type: 'ip',
      source: 'feodo_tracker',
      confidence: 90,
      malware_family: String(item.malware || ''),
      tags: ['c2', 'botnet'],
      raw_json: item,
      first_seen: String(item.first_seen || now),
    }))
    .filter((i) => i.value);
}

async function fetchSslbl(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://sslbl.abuse.ch/blacklist/sslipblacklist.csv');
  if (!res) return [];
  const text = await res.text();
  const now = new Date().toISOString();
  return text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .slice(0, 300)
    .map((line) => {
      const parts = line.split(',');
      return {
        value: (parts[0] || '').trim(),
        type: 'ip',
        source: 'sslbl',
        confidence: 85,
        tags: ['ssl', 'c2'],
        first_seen: (parts[2] || '').trim() || now,
      };
    })
    .filter((i) => i.value);
}

async function fetchOpenPhish(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://openphish.com/feed.txt');
  if (!res) return [];
  const text = await res.text();
  const now = new Date().toISOString();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('http'))
    .slice(0, 200)
    .map((url) => ({
      value: url,
      type: 'url',
      source: 'openphish',
      confidence: 80,
      tags: ['phishing'],
      first_seen: now,
    }));
}

// ── Vulnerability sources ──────────────────────────────────────────────

async function fetchCisaKev(): Promise<CollectedIoc[]> {
  const res = await safeFetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  if (!res) return [];
  const data = (await res.json()) as { vulnerabilities: Array<Record<string, unknown>> };
  return (data.vulnerabilities || [])
    .slice(0, 50)
    .map((v) => ({
      value: String(v.cveID || ''),
      type: 'cve',
      source: 'cisa_kev',
      confidence: 95,
      tags: ['kev', 'actively_exploited'],
      raw_json: v,
      first_seen: String(v.dateAdded || new Date().toISOString()),
    }))
    .filter((i) => i.value);
}

// ── News RSS feeds ─────────────────────────────────────────────────────

const RSS_FEEDS: Record<string, string> = {
  bleepingcomputer: 'https://www.bleepingcomputer.com/feed/',
  hackernews: 'https://feeds.feedburner.com/TheHackersNews',
  darkreading: 'https://www.darkreading.com/rss.xml',
  therecord: 'https://therecord.media/feed',
  securityweek: 'https://feeds.feedburner.com/securityweek',
  krebs: 'https://krebsonsecurity.com/feed/',
  mandiant: 'https://www.mandiant.com/resources/blog/rss.xml',
  unit42: 'https://unit42.paloaltonetworks.com/feed/',
  cisco_talos: 'https://blog.talosintelligence.com/feeds/posts/default',
  sans_isc: 'https://isc.sans.edu/rssfeed_full.xml',
};

function parseRssItems(xml: string, source: string): CollectedNews[] {
  const items: CollectedNews[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? '';
    const title =
      (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
        block.match(/<title>([\s\S]*?)<\/title>/) || ['', ''])[1]?.trim() ?? '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || ['', ''])[1]?.trim() ?? '';
    const desc =
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
        block.match(/<description>([\s\S]*?)<\/description>/) || ['', ''])[1]?.trim() ?? '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || ['', ''])[1]?.trim() ?? '';
    if (title) {
      items.push({
        title: title.replace(/<[^>]+>/g, '').slice(0, 300),
        url: link,
        summary: desc.replace(/<[^>]+>/g, '').slice(0, 500),
        source,
        published: pubDate,
      });
    }
  }
  return items;
}

async function fetchNewsFeed(source: string, url: string): Promise<CollectedNews[]> {
  const res = await safeFetch(url);
  if (!res) return [];
  const text = await res.text();
  return parseRssItems(text, source);
}

// ── Storage ────────────────────────────────────────────────────────────

export async function storeIocs(db: D1Database, iocs: CollectedIoc[]): Promise<number> {
  if (!iocs.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO cti_iocs (value, type, source, confidence, malware_family, threat_actor, tags, raw_json, first_seen, last_seen, observation_count, decay_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1.0)
    ON CONFLICT(value, source) DO UPDATE SET
      last_seen = excluded.last_seen,
      observation_count = observation_count + 1,
      confidence = MAX(confidence, excluded.confidence),
      malware_family = CASE WHEN excluded.malware_family != '' THEN excluded.malware_family ELSE malware_family END,
      tags = CASE WHEN excluded.tags != '[]' THEN excluded.tags ELSE tags END,
      raw_json = CASE WHEN excluded.raw_json != '{}' THEN excluded.raw_json ELSE raw_json END,
      decay_score = 1.0
  `);
  const now = new Date().toISOString();
  const batches: D1PreparedStatement[] = [];
  for (const ioc of iocs) {
    if (!ioc.value || ioc.value.length < 2) continue;
    batches.push(
      stmt.bind(
        ioc.value.slice(0, 512),
        ioc.type.slice(0, 32),
        ioc.source.slice(0, 64),
        ioc.confidence,
        (ioc.malware_family || '').slice(0, 128),
        (ioc.threat_actor || '').slice(0, 128),
        JSON.stringify(ioc.tags || []),
        JSON.stringify(ioc.raw_json || {}),
        ioc.first_seen,
        now
      )
    );
  }
  // D1 batch limit is 100 per batch
  let stored = 0;
  for (let i = 0; i < batches.length; i += 100) {
    const batch = batches.slice(i, i + 100);
    try {
      const results = await db.batch(batch);
      stored += results.filter((r) => r.meta?.changes > 0).length;
    } catch {
      // Skip failed batch
    }
  }
  return stored;
}

export async function storeNews(db: D1Database, articles: CollectedNews[]): Promise<number> {
  if (!articles.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO cti_news (title, url, summary, source, published, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const batches: D1PreparedStatement[] = [];
  for (const a of articles) {
    if (!a.title) continue;
    batches.push(
      stmt.bind(
        a.title.slice(0, 300),
        a.url.slice(0, 512),
        a.summary.slice(0, 1000),
        a.source.slice(0, 64),
        a.published,
        JSON.stringify(a.tags || [])
      )
    );
  }
  let stored = 0;
  for (let i = 0; i < batches.length; i += 100) {
    const batch = batches.slice(i, i + 100);
    try {
      const results = await db.batch(batch);
      stored += results.filter((r) => r.meta?.changes > 0).length;
    } catch {
      // Skip failed batch
    }
  }
  return stored;
}

// ── Decay scoring ──────────────────────────────────────────────────────

export async function applyDecayScoring(db: D1Database): Promise<{ updated: number }> {
  const now = Date.now();
  const dayMs = 86_400_000;

  // Read all IOCs (or batch-wise for large DBs)
  const rows = await db.prepare('SELECT id, type, last_seen, decay_score FROM cti_iocs WHERE decay_score > 0.01').all();
  const stmt = db.prepare('UPDATE cti_iocs SET decay_score = ? WHERE id = ?');
  const batches: D1PreparedStatement[] = [];

  for (const row of rows.results) {
    const id = row.id as number;
    const type = String(row.type || 'ip');
    const lastSeen = String(row.last_seen || '');
    const halfLife = DECAY_HALF_LIFE[type] || 7;
    const lastSeenMs = new Date(lastSeen).getTime();
    if (!lastSeenMs || isNaN(lastSeenMs)) continue;
    const ageDays = (now - lastSeenMs) / dayMs;
    const newScore = Math.max(0, Math.min(1, Math.pow(0.5, ageDays / halfLife)));
    const rounded = Math.round(newScore * 1000) / 1000;
    if (Math.abs(rounded - (row.decay_score as number)) > 0.01) {
      batches.push(stmt.bind(rounded, id));
    }
  }

  let updated = 0;
  for (let i = 0; i < batches.length; i += 100) {
    try {
      await db.batch(batches.slice(i, i + 100));
      updated += Math.min(100, batches.length - i);
    } catch {
      // Skip
    }
  }
  return { updated };
}

// ── Main collection orchestrator ───────────────────────────────────────

export interface CollectionResult {
  iocs_stored: number;
  news_stored: number;
  sources_attempted: number;
  sources_succeeded: number;
  errors: string[];
  duration_ms: number;
}

export async function runFullCollection(db: D1Database): Promise<CollectionResult> {
  const start = Date.now();
  const errors: string[] = [];
  let sourcesAttempted = 0;
  let sourcesSucceeded = 0;

  // Collect IOCs from all sources concurrently
  const iocFetchers: Array<[string, () => Promise<CollectedIoc[]>]> = [
    ['threatfox', fetchThreatFox],
    ['urlhaus', fetchUrlhaus],
    ['malwarebazaar', fetchMalwareBazaar],
    ['feodo_tracker', fetchFeodoTracker],
    ['sslbl', fetchSslbl],
    ['openphish', fetchOpenPhish],
    ['cisa_kev', fetchCisaKev],
  ];

  const iocResults = await Promise.allSettled(
    iocFetchers.map(async ([name, fn]) => {
      sourcesAttempted++;
      try {
        const items = await fn();
        sourcesSucceeded++;
        return items;
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : 'unknown'}`);
        return [];
      }
    })
  );

  const allIocs = iocResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const iocsStored = await storeIocs(db, allIocs);

  // Collect news concurrently
  const newsEntries = Object.entries(RSS_FEEDS);
  const newsResults = await Promise.allSettled(
    newsEntries.map(async ([name, url]) => {
      sourcesAttempted++;
      try {
        const items = await fetchNewsFeed(name, url);
        sourcesSucceeded++;
        return items;
      } catch (e) {
        errors.push(`news/${name}: ${e instanceof Error ? e.message : 'unknown'}`);
        return [];
      }
    })
  );

  const allNews = newsResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const newsStored = await storeNews(db, allNews);

  // Apply decay scoring
  await applyDecayScoring(db);

  // Record job status
  try {
    await db
      .prepare(
        `
      INSERT INTO cti_collection_jobs (source, status, items_collected, completed_at)
      VALUES ('full_collection', 'success', ?, ?)
    `
      )
      .bind(iocsStored + newsStored, new Date().toISOString())
      .run();
  } catch {
    // Non-critical
  }

  return {
    iocs_stored: iocsStored,
    news_stored: newsStored,
    sources_attempted: sourcesAttempted,
    sources_succeeded: sourcesSucceeded,
    errors,
    duration_ms: Date.now() - start,
  };
}

// ── Query helpers ──────────────────────────────────────────────────────

export interface IocStats {
  total_iocs: number;
  active_iocs: number; // decay_score > 0.5
  type_breakdown: Record<string, number>;
  source_breakdown: Record<string, number>;
  top_malware_families: Array<{ family: string; count: number }>;
  trending: Array<{ value: string; type: string; source: string; observations: number }>;
  recent_news: number;
  news_sources: Record<string, number>;
}

export async function getIocStats(db: D1Database): Promise<IocStats> {
  const [totalRes, activeRes, typeRes, sourceRes, familyRes, trendingRes, newsRes, newsSrcRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as n FROM cti_iocs').first(),
    db.prepare('SELECT COUNT(*) as n FROM cti_iocs WHERE decay_score > 0.5').first(),
    db.prepare('SELECT type, COUNT(*) as n FROM cti_iocs GROUP BY type ORDER BY n DESC').all(),
    db.prepare('SELECT source, COUNT(*) as n FROM cti_iocs GROUP BY source ORDER BY n DESC').all(),
    db
      .prepare(
        "SELECT malware_family as family, COUNT(*) as n FROM cti_iocs WHERE malware_family != '' GROUP BY malware_family ORDER BY n DESC LIMIT 10"
      )
      .all(),
    db
      .prepare(
        'SELECT value, type, source, observation_count as observations FROM cti_iocs WHERE observation_count > 1 ORDER BY observation_count DESC LIMIT 10'
      )
      .all(),
    db.prepare('SELECT COUNT(*) as n FROM cti_news').first(),
    db.prepare('SELECT source, COUNT(*) as n FROM cti_news GROUP BY source ORDER BY n DESC').all(),
  ]);

  const typeBreakdown: Record<string, number> = {};
  for (const r of typeRes.results) typeBreakdown[String(r.type)] = Number(r.n);

  const sourceBreakdown: Record<string, number> = {};
  for (const r of sourceRes.results) sourceBreakdown[String(r.source)] = Number(r.n);

  const topFamilies = familyRes.results.map((r) => ({ family: String(r.family), count: Number(r.n) }));
  const trending = trendingRes.results.map((r) => ({
    value: String(r.value),
    type: String(r.type),
    source: String(r.source),
    observations: Number(r.observations),
  }));

  const newsSources: Record<string, number> = {};
  for (const r of newsSrcRes.results) newsSources[String(r.source)] = Number(r.n);

  return {
    total_iocs: Number(totalRes?.n || 0),
    active_iocs: Number(activeRes?.n || 0),
    type_breakdown: typeBreakdown,
    source_breakdown: sourceBreakdown,
    top_malware_families: topFamilies,
    trending,
    recent_news: Number(newsRes?.n || 0),
    news_sources: newsSources,
  };
}
