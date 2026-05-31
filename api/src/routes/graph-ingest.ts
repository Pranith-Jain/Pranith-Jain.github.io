import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import type { LiveIoc } from './live-iocs';
import { fetchTelegramFeed } from './telegram-feed';
import { fetchRansomwareRecent } from './ransomware-recent';
import {
  ingestMultipleFeedItems,
  ingestEntitiesNoEnsure,
  ingestEntities,
  extractIOCs,
  sourceConfidence,
  type FeedIngestItem,
  type ExtractedEntity,
  type IngestResult,
} from '../lib/graph-ingest';
import { ensureGraphTables, upsertNode, type NodeType } from './threat-graph';

type SourceName = 'ioc' | 'phishing' | 'telegram' | 'ransomware' | 'all';

/** Upsert nodes for a list of entities WITHOUT creating edges between them. */
async function upsertNodesOnly(
  db: D1Database,
  entities: ExtractedEntity[],
  source: string,
  evidence: { description: string; timestamp: string }
): Promise<IngestResult> {
  const result: IngestResult = { nodes_upserted: 0, edges_created: 0, errors: [] };
  const src = sourceConfidence(source);
  for (const ent of entities) {
    try {
      await upsertNode(db, {
        type: ent.type,
        value: ent.value,
        properties: { label: ent.label, source },
        first_seen: evidence.timestamp,
        confidence: Math.round((ent.confidence * src.reliability) / 100),
        sources: [src.source_name],
      });
      result.nodes_upserted++;
    } catch (e) {
      result.errors.push(`node(${ent.type}:${ent.value}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

async function ingestBulkIocs(db: D1Database, items: LiveIoc[], maxItems: number): Promise<IngestResult> {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const ioc of items.slice(0, maxItems)) {
    let nodeType: NodeType = 'domain';
    if (ioc.kind === 'ip') nodeType = 'ip';
    else if (ioc.kind === 'domain') nodeType = 'domain';
    else if (ioc.kind === 'hash') nodeType = 'hash';
    else if (ioc.kind === 'url') nodeType = 'url';
    else continue;

    const key = `${nodeType}:${ioc.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entities.push({ type: nodeType, value: ioc.value, label: ioc.value, confidence: 90 });
  }

  if (!entities.length) return { nodes_upserted: 0, edges_created: 0, errors: [] };
  return upsertNodesOnly(db, entities.slice(0, 18), 'threatfox', {
    description: 'ThreatFox IOC feed',
    timestamp: new Date().toISOString(),
  });
}

// ── Direct IOC source fetchers (bypasses the aggregated live-iocs handler) ──

function unq(s: string): string {
  return s.replace(/^["'\s]+|["'\s]+$/g, '');
}

async function parseThreatfoxCsv(csv: string): Promise<LiveIoc[]> {
  const items: LiveIoc[] = [];
  const lines = csv.split('\n');
  let headerFound = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!headerFound) {
      headerFound = true;
      continue;
    }
    const cols = trimmed.split(',').map(unq);
    if (cols.length < 6) continue;
    const iocValue = cols[2];
    const typeRaw = cols[3];
    const malware = cols[5];
    const alias = cols[6];
    let kind: 'ip' | 'domain' | 'hash' | 'url' | null = null;
    if (typeRaw === 'ipv4' || typeRaw === 'ip') kind = 'ip';
    else if (typeRaw === 'domain') kind = 'domain';
    else if (typeRaw === 'url') kind = 'url';
    else if (typeRaw === 'md5_hash' || typeRaw === 'sha256_hash') kind = 'hash';
    if (!kind || !iocValue) continue;
    items.push({
      value: iocValue,
      kind,
      source: 'threatfox',
      context: malware || alias || undefined,
      observed_at: new Date().toISOString(),
    });
  }
  return items;
}

async function ingestLiveIocs(db: D1Database): Promise<IngestResult> {
  try {
    const res = await fetch('https://threatfox.abuse.ch/export/csv/recent/', {
      headers: { 'user-agent': 'pranithjain-graph-ingest/1.0', accept: 'text/csv' },
    });
    if (!res.ok) return { nodes_upserted: 0, edges_created: 0, errors: [`live-iocs: threatfox HTTP ${res.status}`] };
    const csv = await res.text();
    const items = await parseThreatfoxCsv(csv);
    if (!items.length) return { nodes_upserted: 0, edges_created: 0, errors: ['live-iocs: no data'] };

    // Limit to 18 per batch to stay within 50-subrequest limit:
    // ensureGraphTables(6) + upsertNode(18 * 2) = 42, fits with margin.
    return ingestBulkIocs(db, items, 18);
  } catch (e) {
    return {
      nodes_upserted: 0,
      edges_created: 0,
      errors: [`live-iocs: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

async function ingestPhishingUrls(db: D1Database): Promise<IngestResult> {
  try {
    const res = await fetch('https://openphish.com/feed.txt', {
      headers: { 'user-agent': 'pranithjain-graph-ingest/1.0', accept: 'text/plain' },
    });
    if (!res.ok) return { nodes_upserted: 0, edges_created: 0, errors: [`phishing: openphish HTTP ${res.status}`] };
    const text = await res.text();
    const urls = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!urls.length) return { nodes_upserted: 0, edges_created: 0, errors: ['phishing: no data'] };

    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();
    for (const url of urls.slice(0, 20)) {
      const key = `url:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push({ type: 'url', value: url, label: url, confidence: 85 });
    }
    if (!entities.length) return { nodes_upserted: 0, edges_created: 0, errors: ['phishing: no entities'] };

    return upsertNodesOnly(db, entities, 'phishing', {
      description: 'Phishing URLs from OpenPhish/PhishTank',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return { nodes_upserted: 0, edges_created: 0, errors: [`phishing: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

async function ingestTelegram(db: D1Database, maxItems: number = 30): Promise<IngestResult> {
  try {
    const feed = await fetchTelegramFeed();
    if (!feed?.items?.length) {
      return { nodes_upserted: 0, edges_created: 0, errors: [] };
    }
    const items: FeedIngestItem[] = feed.items
      .slice(0, maxItems)
      .map((it: { title?: string; message?: string; link?: string; date?: string; source?: string }) => ({
        title: it.title ?? it.message ?? '',
        description: it.message ?? it.title ?? '',
        link: it.link ?? '',
        pubDate: it.date ?? new Date().toISOString(),
        source: 'telegram',
        source_url: it.link ?? '',
      }));
    return ingestMultipleFeedItems(db, items, 'Telegram', maxItems);
  } catch (e) {
    return { nodes_upserted: 0, edges_created: 0, errors: [`telegram: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

async function ingestRansomware(db: D1Database, env?: Env): Promise<IngestResult> {
  try {
    const { body, upstreamOk } = await fetchRansomwareRecent(env);
    if (!upstreamOk || !body?.victims?.length) {
      return { nodes_upserted: 0, edges_created: 0, errors: upstreamOk ? [] : ['ransomware upstream unreachable'] };
    }
    const aggregated: IngestResult = { nodes_upserted: 0, edges_created: 0, errors: [] };
    for (const victim of body.victims.slice(0, 5)) {
      const text = [victim.name, victim.notes, victim.group].filter(Boolean).join(' ');
      const entities = extractIOCs(text);
      if (!entities.length) continue;
      const r = await ingestEntitiesNoEnsure(db, entities, 'ransomware', {
        description: `Ransomware victim: ${victim.name}`,
        timestamp: victim.discovered || new Date().toISOString(),
      });
      aggregated.nodes_upserted += r.nodes_upserted;
      aggregated.edges_created += r.edges_created;
      aggregated.errors.push(...r.errors);
    }
    return aggregated;
  } catch (e) {
    return {
      nodes_upserted: 0,
      edges_created: 0,
      errors: [`ransomware: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

export async function runGraphIngest(
  db: D1Database,
  source: SourceName = 'all',
  env?: Env
): Promise<Record<string, IngestResult>> {
  // Ensure tables once so downstream calls can skip table checks.
  await ensureGraphTables(db);

  const results: Record<string, IngestResult> = {};

  if (source === 'all' || source === 'ioc') {
    results['ioc'] = await ingestLiveIocs(db);
  }
  if (source === 'all' || source === 'phishing') {
    results['phishing'] = await ingestPhishingUrls(db);
  }
  if (source === 'all' || source === 'telegram') {
    results['telegram'] = await ingestTelegram(db, 5);
  }
  if (source === 'all' || source === 'ransomware') {
    results['ransomware'] = await ingestRansomware(env);
  }

  return results;
}

export async function graphIngestManualHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const source = (c.req.query('source') ?? 'all') as SourceName;
  const validSources: SourceName[] = ['all', 'ioc', 'phishing', 'telegram', 'ransomware'];
  if (!validSources.includes(source)) {
    return c.json({ error: `invalid source. valid: ${validSources.join(', ')}` }, 400);
  }

  const startMs = Date.now();
  let results: Record<string, IngestResult>;
  try {
    results = await runGraphIngest(db, source, c.env);
  } catch (e) {
    return c.json(
      {
        ok: false,
        source,
        duration_ms: Date.now() - startMs,
        error: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
  const totalNodes = Object.values(results).reduce((s, r) => s + r.nodes_upserted, 0);
  const totalEdges = Object.values(results).reduce((s, r) => s + r.edges_created, 0);
  const totalErrors = Object.values(results).reduce((s, r) => s + r.errors.length, 0);

  return c.json({
    ok: true,
    source,
    duration_ms: Date.now() - startMs,
    total: { nodes_upserted: totalNodes, edges_created: totalEdges, errors: totalErrors },
    per_source: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [
        k,
        { nodes_upserted: v.nodes_upserted, edges_created: v.edges_created, errors: v.errors },
      ])
    ),
  });
}
