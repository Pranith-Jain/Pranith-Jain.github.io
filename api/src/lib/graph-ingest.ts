import type { D1Database } from '@cloudflare/workers-types';
import {
  upsertNode,
  upsertEdge,
  ensureGraphTables,
  type GraphNode,
  type NodeType,
  type EdgeType,
} from '../routes/threat-graph';
import { recordIocObservation } from '../routes/ioc-lifecycle';
import { extractEntities as resolveTextEntities } from './entity-resolution';
import type { EntityType } from './entity-resolution';
import { SOURCE_RELIABILITY_REGISTRY } from './confidence';

export interface ExtractedEntity {
  type: NodeType;
  value: string;
  label: string;
  confidence: number;
}

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_RE = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;
const SHA256_RE = /\b[a-f0-9]{64}\b/gi;
const SHA1_RE = /\b[a-f0-9]{40}\b/gi;
const MD5_RE = /\b[a-f0-9]{32}\b/gi;
const URL_RE = /https?:\/\/[^\s<>"']+/g;

function nodeToLifecycleType(t: NodeType): string | null {
  switch (t) {
    case 'ip':
      return 'ipv4';
    case 'domain':
      return 'domain';
    case 'url':
      return 'url';
    case 'hash':
      return 'hash';
    default:
      return null;
  }
}

function entityTypeToNodeType(t: EntityType): NodeType | null {
  switch (t) {
    case 'actor':
    case 'malware':
    case 'cve':
      return t;
    case 'ransomware':
      return 'actor';
    case 'ip':
      return 'ip';
    case 'domain':
      return 'domain';
    case 'hash':
      return 'hash';
    default:
      return null;
  }
}

export function extractIOCs(text: string): ExtractedEntity[] {
  const found: ExtractedEntity[] = [];
  const seen = new Set<string>();

  const add = (type: NodeType, value: string, confidence: number) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ type, value, label: value, confidence });
  };

  // IPs
  let m: RegExpExecArray | null;
  while ((m = IPV4_RE.exec(text)) !== null) {
    const octets = m[0].split('.').map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      add('ip', m[0], 80);
    }
  }

  // Domains (skip bare IPs already caught above)
  while ((m = DOMAIN_RE.exec(text)) !== null) {
    const d = m[0].toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(d)) continue;
    if (/^(example|localhost|test)\./.test(d)) continue;
    add('domain', d, 70);
  }

  // URLs
  while ((m = URL_RE.exec(text)) !== null) {
    add('url', m[0], 60);
  }

  // Hashes
  while ((m = SHA256_RE.exec(text)) !== null) add('hash', m[0].toLowerCase(), 90);
  while ((m = SHA1_RE.exec(text)) !== null) add('hash', m[0].toLowerCase(), 85);
  while ((m = MD5_RE.exec(text)) !== null) add('hash', m[0].toLowerCase(), 80);

  // Actor/ransomware/malware/CVE references via entity-resolution lib
  for (const er of resolveTextEntities(text)) {
    const nt = entityTypeToNodeType(er.type);
    if (nt && !seen.has(`${nt}:${er.id.toLowerCase()}`)) {
      add(nt, er.id, Math.round(er.confidence * 100));
    }
  }

  return found;
}

export interface SourceConfidence {
  reliability: number;
  source_name: string;
}

export function sourceConfidence(sourceId: string): SourceConfidence {
  const entry = SOURCE_RELIABILITY_REGISTRY[sourceId];
  if (!entry) return { reliability: 50, source_name: sourceId };

  const grades: Record<string, number> = { A: 95, B: 80, C: 60, D: 40, E: 20, F: 10 };
  return {
    reliability: grades[entry.reliability] ?? 50,
    source_name: entry.name,
  };
}

export interface IngestResult {
  nodes_upserted: number;
  edges_created: number;
  errors: string[];
}

export async function ingestEntities(
  db: D1Database,
  entities: ExtractedEntity[],
  source: string,
  evidence: { description: string; timestamp: string },
  relationship: EdgeType = 'co_occurs'
): Promise<IngestResult> {
  await ensureGraphTables(db);
  return ingestEntitiesNoEnsure(db, entities, source, evidence, relationship);
}

/** Same as ingestEntities but skips ensureGraphTables (caller must have called it). */
export async function ingestEntitiesNoEnsure(
  db: D1Database,
  entities: ExtractedEntity[],
  source: string,
  evidence: { description: string; timestamp: string },
  relationship: EdgeType = 'co_occurs'
): Promise<IngestResult> {
  const result: IngestResult = { nodes_upserted: 0, edges_created: 0, errors: [] };
  const src = sourceConfidence(source);

  const upserted: GraphNode[] = [];
  for (const ent of entities) {
    try {
      const node = await upsertNode(db, {
        type: ent.type,
        value: ent.value,
        properties: { label: ent.label, source },
        first_seen: evidence.timestamp,
        confidence: Math.round((ent.confidence * src.reliability) / 100),
        sources: [src.source_name],
      });
      upserted.push(node);
      result.nodes_upserted++;

      // Track IOC in lifecycle table (skip non-IOC types like actor, malware, cve)
      const lifecycleType = nodeToLifecycleType(ent.type);
      if (lifecycleType) {
        recordIocObservation(db, ent.value, lifecycleType, node.confidence, [src.source_name]).catch(() => {});
      }
    } catch (e) {
      result.errors.push(`node(${ent.type}:${ent.value}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (let i = 0; i < upserted.length; i++) {
    const a = upserted[i];
    if (!a) continue;
    for (let j = i + 1; j < upserted.length; j++) {
      const b = upserted[j];
      if (!b) continue;
      try {
        const edgeConfidence = Math.min(a.confidence, b.confidence);
        await upsertEdge(db, {
          source_id: a.id,
          target_id: b.id,
          relationship,
          confidence: edgeConfidence,
          evidence: [
            {
              source: src.source_name,
              description: evidence.description,
              timestamp: evidence.timestamp,
            },
          ],
          first_seen: evidence.timestamp,
        });
        result.edges_created++;
      } catch (e) {
        result.errors.push(`edge(${a.id}->${b.id}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return result;
}

export interface FeedIngestItem {
  title: string;
  description?: string;
  link: string;
  pubDate: string;
  source: string;
  source_url: string;
}

export async function ingestFeedItem(db: D1Database, item: FeedIngestItem, sourceKey: string): Promise<IngestResult> {
  const text = [item.title, item.description].filter(Boolean).join(' ');
  const entities = extractIOCs(text);
  if (entities.length === 0) {
    return { nodes_upserted: 0, edges_created: 0, errors: [] };
  }
  return ingestEntities(db, entities, sourceKey, {
    description: item.title.slice(0, 200),
    timestamp: item.pubDate || new Date().toISOString(),
  });
}

export async function ingestMultipleFeedItems(
  db: D1Database,
  items: FeedIngestItem[],
  sourceKey: string,
  maxItems: number = 50
): Promise<IngestResult> {
  const aggregated: IngestResult = { nodes_upserted: 0, edges_created: 0, errors: [] };
  const batch = items.slice(0, maxItems);
  for (const item of batch) {
    const r = await ingestFeedItem(db, item, sourceKey);
    aggregated.nodes_upserted += r.nodes_upserted;
    aggregated.edges_created += r.edges_created;
    aggregated.errors.push(...r.errors);
  }
  return aggregated;
}

export interface BreachIngestItem {
  email?: string;
  domain?: string;
  password?: string;
  source: string;
  timestamp: string;
}

export async function ingestBreachData(db: D1Database, item: BreachIngestItem): Promise<IngestResult> {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  if (item.domain && !seen.has(`domain:${item.domain.toLowerCase()}`)) {
    seen.add(`domain:${item.domain.toLowerCase()}`);
    entities.push({ type: 'domain', value: item.domain.toLowerCase(), label: item.domain, confidence: 95 });
  }

  if (item.email) {
    const domain = item.email.split('@')[1];
    if (domain && !seen.has(`domain:${domain.toLowerCase()}`)) {
      seen.add(`domain:${domain.toLowerCase()}`);
      entities.push({ type: 'domain', value: domain.toLowerCase(), label: domain, confidence: 90 });
    }
  }

  if (entities.length < 2) {
    return { nodes_upserted: 0, edges_created: 0, errors: [] };
  }

  return ingestEntities(db, entities, 'breach', {
    description: `breach data from ${item.source}`,
    timestamp: item.timestamp,
  });
}

export async function ingestIocCheckData(
  db: D1Database,
  iocValue: string,
  iocType: string,
  results: Array<{ source: string; malicious: boolean; description: string }>,
  timestamp: string
): Promise<IngestResult> {
  const nodeType = iocType as NodeType;
  const entities: ExtractedEntity[] = [{ type: nodeType, value: iocValue, label: iocValue, confidence: 100 }];

  for (const r of results) {
    if (r.malicious) {
      entities.push({
        type: 'malware',
        value: `ioc-hunt:${r.source.toLowerCase().replace(/\s+/g, '-')}`,
        label: `Flagged by ${r.source}`,
        confidence: 70,
      });
    }
  }

  if (entities.length < 2) {
    return { nodes_upserted: 0, edges_created: 0, errors: [] };
  }

  return ingestEntities(
    db,
    entities,
    'ioc-check',
    {
      description: results
        .map((r) => r.description)
        .join('; ')
        .slice(0, 300),
      timestamp,
    },
    'communicates'
  );
}
