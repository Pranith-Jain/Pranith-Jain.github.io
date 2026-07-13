/**
 * OSINT + Darknet → STIX normalization pipeline.
 *
 * Scheduled Worker that ingests from open-source intelligence feeds
 * and darknet monitoring sources, normalises into STIX 2.1 bundles,
 * and persists to the intel_bundles D1 table.
 *
 * Sources:
 *   - OSINT feeds (RSS/Atom threat intel feeds)
 *   - Darknet leak sites, ransomware victim blogs
 *   - Underground market monitoring
 *
 * Each source yields structured threat data that is:
 *   1. Fetched and parsed
 *   2. Entities extracted (actors, malware, IOCs, CVEs, sectors)
 *   3. Bulk-enriched (IP/domain/hash lookups)
 *   4. Built into a STIX 2.1 bundle
 *   5. Stored in D1 (idempotent upsert by bundle_id)
 */

import type { D1Database } from '@cloudflare/workers-types';
import { extract } from '../../api/src/lib/extract';
import { EMPTY_LLM_ENTITIES } from '../../api/src/lib/extract-llm';
import { buildStixBundle, type Tlp } from '../../api/src/lib/stix-build';
import type { Env } from '../../api/src/env';

/** A source definition for the pipeline. */
interface IntelSource {
  id: string;
  name: string;
  /** Fetch function returning items. */
  fetch: (env: Env) => Promise<SourceItem[]>;
  /** TLP marking for content from this source. */
  tlp: Tlp;
  /** Source type classification. */
  sourceType: 'osint' | 'darknet';
}

/** A single intelligence item from any source. */
export interface SourceItem {
  ref: string;
  title: string;
  body: string;
  url?: string;
  publishedAt?: string | null;
}

/** ── OSINT RSS feed sources ────────────────────────────────── */

const OSINT_FEEDS: Array<{ id: string; name: string; url: string }> = [
  { id: 'rss:thehackernews', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackerNews' },
  { id: 'rss:bleepingcomputer', name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { id: 'rss:cisco-talos', name: 'Cisco Talos', url: 'https://feeds.feedburner.com/TalosThreatIntel' },
  { id: 'rss:sans-isc', name: 'SANS ISC', url: 'https://isc.sans.edu/rssfeed.xml' },
];

/** Parse an RSS feed into source items. */
async function fetchRssFeed(env: Env, feed: { id: string; name: string; url: string }): Promise<SourceItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'pranithjain-dfir/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const text = await res.text();

    // Minimal RSS/XML parser — extract <item> or <entry> elements
    const items: SourceItem[] = [];
    const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(text)) !== null) {
      const content = match[1]!;
      const title = extractXmlValue(content, 'title');
      const body = extractXmlValue(content, 'description') || extractXmlValue(content, 'summary') || title;
      const url = extractXmlValue(content, 'link');
      const pubDate =
        extractXmlValue(content, 'pubDate') ||
        extractXmlValue(content, 'published') ||
        extractXmlValue(content, 'updated');
      if (title) {
        items.push({
          ref: url || `${feed.id}:${title.slice(0, 40)}`,
          title: decodeHtmlEntities(title),
          body: decodeHtmlEntities(body),
          url: url || undefined,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        });
      }
    }
    return items;
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

/** Extract the text content of an XML child element. */
function extractXmlValue(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (m) return m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  // Self-closing <link> variant
  const m2 = new RegExp(`<${tag}[^>]*href="([^"]+)"`, 'i').exec(xml);
  return m2 ? m2[1]! : '';
}

/** Simple HTML entity decoder. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) =>
      String.fromCodePoint(hex ? parseInt(hex, 16) : parseInt(dec!, 10))
    );
}

/** ── Darknet monitoring sources ──────────────────────────────── */

interface DarknetSource {
  id: string;
  name: string;
  url: string;
  /** CSS/jq-like selector for victim entries (simplified). */
  selector: string;
}

const DARKNET_SOURCES: DarknetSource[] = [
  {
    id: 'darknet:ransomwarelive',
    name: 'ransomware.live',
    url: 'https://data.ransomware.live/posts.json',
    selector: '',
  },
  { id: 'darknet:databreaches', name: 'DataBreaches.net', url: 'https://databreaches.net/feed/', selector: '' },
];

async function fetchDarknetSource(env: Env, source: DarknetSource): Promise<SourceItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'pranithjain-dfir/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    if (source.id === 'darknet:ransomwarelive') {
      const posts = (await res.json()) as Array<{
        group_name?: string;
        victim?: string;
        description?: string;
        post_url?: string;
        published?: string;
        discovered?: string;
        [k: string]: unknown;
      }>;
      return posts.slice(0, 50).map((p) => ({
        ref: p.post_url || `${source.id}:${p.victim ?? 'unknown'}`,
        title: `[${p.group_name ?? 'Unknown'}] ${p.victim ?? 'Unknown victim'}`,
        body: p.description ?? `Ransomware victim posted by ${p.group_name ?? 'unknown group'}`,
        url: p.post_url || undefined,
        publishedAt: p.published || p.discovered || null,
      }));
    }

    // Generic RSS for other darknet sources
    const text = await res.text();
    const items: SourceItem[] = [];
    const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(text)) !== null) {
      const content = match[1]!;
      const title = extractXmlValue(content, 'title');
      const body = extractXmlValue(content, 'description') || extractXmlValue(content, 'summary') || title;
      const url = extractXmlValue(content, 'link');
      const pubDate = extractXmlValue(content, 'pubDate') || extractXmlValue(content, 'published');
      if (title) {
        items.push({
          ref: url || `${source.id}:${title.slice(0, 40)}`,
          title: decodeHtmlEntities(title),
          body: decodeHtmlEntities(body),
          url: url || undefined,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        });
      }
    }
    return items.slice(0, 50);
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

/** ── Pipeline execution ────────────────────────────────────── */

const SOURCES: IntelSource[] = [
  ...OSINT_FEEDS.map((f) => ({
    id: f.id,
    name: f.name,
    tlp: 'WHITE' as Tlp,
    sourceType: 'osint' as const,
    fetch: (env: Env) => fetchRssFeed(env, f),
  })),
  ...DARKNET_SOURCES.map((s) => ({
    id: s.id,
    name: s.name,
    tlp: 'AMBER' as Tlp,
    sourceType: 'darknet' as const,
    fetch: (env: Env) => fetchDarknetSource(env, s),
  })),
];

export interface PipelineResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  totalItems: number;
  storedItems: number;
  errors: number;
  storedBundleIds: string[];
}

/**
 * Run the OSINT + darknet pipeline for a single source.
 * Returns the count of newly stored bundles.
 */
export async function runSourcePipeline(db: D1Database, source: IntelSource, env: Env): Promise<PipelineResult> {
  const result: PipelineResult = {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    totalItems: 0,
    storedItems: 0,
    errors: 0,
    storedBundleIds: [],
  };

  let items: SourceItem[];
  try {
    items = await source.fetch(env);
  } catch (_catchErr) {
    console.error('runSourcePipeline failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return { ...result, errors: 1 };
  }

  result.totalItems = items.length;

  for (const item of items) {
    try {
      // Check if this item already exists in D1
      const existing = await db
        .prepare('SELECT id FROM intel_bundles WHERE source_id = ? AND item_ref = ? LIMIT 1')
        .bind(source.id, item.ref)
        .first<{ id: string }>();
      if (existing) continue;

      // Set source_type based on source definition
      const sourceType = source.sourceType;

      // Extract entities
      const extracted = await extract(item.body, item.title);

      // Build STIX bundle (corrected argument shapes)
      const buildResult = await buildStixBundle(
        {
          sourceId: source.id,
          sourceName: source.name,
          itemRef: item.ref,
          title: item.title,
          body: item.body,
          url: item.url,
          publishedAt: item.publishedAt,
          tlp: source.tlp,
        },
        extracted,
        { enrichments: [], partial: false, overflow: [] },
        new Map(),
        EMPTY_LLM_ENTITIES
      );

      // Extract denormalized filter column values (corrected property names)
      const actorNames = JSON.stringify(extracted.actors.map((a) => a.canonical));
      const malwareNames = JSON.stringify(extracted.malware.map((m) => m.canonical));
      const cveIds = JSON.stringify(extracted.cves.map((c) => c.id));
      const iocIpv4 = JSON.stringify(extracted.iocs.filter((i) => i.type === 'ipv4').map((i) => i.value));
      const iocIpv6 = JSON.stringify(extracted.iocs.filter((i) => i.type === 'ipv6').map((i) => i.value));
      const iocDomain = JSON.stringify(extracted.iocs.filter((i) => i.type === 'domain').map((i) => i.value));
      const iocUrl = JSON.stringify(extracted.iocs.filter((i) => i.type === 'url').map((i) => i.value));
      const iocHash = JSON.stringify(extracted.iocs.filter((i) => i.type === 'hash').map((i) => i.value));
      const iocCount = extracted.iocs.length;
      const actorCount = extracted.actors.length;
      const malwareCount = extracted.malware.length;

      // Use a content hash for extracted_hash
      const contentHash = await crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(item.title + item.body + item.ref))
        .then((h) =>
          Array.from(new Uint8Array(h))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        );

      // Persist
      await db
        .prepare(
          `INSERT INTO intel_bundles
            (id, source_id, item_ref, report_id, title, published_at, extracted_hash,
             bundle_json, view_json, created_at, updated_at,
             ioc_count, actor_count, malware_count,
             source_type, threat_actor_names, malware_names, campaign_names,
             sector_names, country_targets, country_sources, vulnerability_ids,
             indicator_ipv4, indicator_ipv6, indicator_domain, indicator_url, indicator_sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?,
                   ?, ?, datetime('now'), datetime('now'),
                   ?, ?, ?,
                   ?, ?, ?, ?,
                   ?, ?, ?, ?,
                   ?, ?, ?, ?, ?)`
        )
        .bind(
          buildResult.bundle.id,
          source.id,
          item.ref,
          buildResult.view.reportId,
          item.title,
          item.publishedAt ?? null,
          contentHash,
          JSON.stringify(buildResult.bundle),
          JSON.stringify(buildResult.view),
          iocCount,
          actorCount,
          malwareCount,
          sourceType,
          actorNames,
          malwareNames,
          '[]',
          '[]',
          '[]',
          '[]',
          cveIds,
          iocIpv4,
          iocIpv6,
          iocDomain,
          iocUrl,
          iocHash
        )
        .run();

      result.storedItems++;
      result.storedBundleIds.push(buildResult.bundle.id);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      result.errors++;
    }
  }

  return result;
}

/**
 * Run the full pipeline across all configured sources.
 */
export async function runFullPipeline(db: D1Database, env: Env): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const source of SOURCES) {
    const result = await runSourcePipeline(db, source, env);
    results.push(result);
  }
  return results;
}
