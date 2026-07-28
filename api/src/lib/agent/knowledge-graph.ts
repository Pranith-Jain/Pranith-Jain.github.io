/**
 * Cross-investigation knowledge graph — aggregates entities (actors, malware,
 * CVEs, MITRE techniques, IOCs) and their relationships ACROSS investigations
 * into a growing, queryable knowledge base. Per-investigation graphs live in
 * ioc-graph.ts; this module persists the union over time.
 */

import type { GraphNode, GraphEdge, GraphData } from './ioc-graph';
import type { AgentStep } from './types';

/**
 * Build a knowledge graph from a single investigation's observer findings.
 * Pure and unit-tested. Relationships are inferred from co-occurrence within
 * the investigation (actor→uses→malware, actor→exploits→CVE, CVE→maps→MITRE).
 */
export function extractKnowledgeGraph(steps: AgentStep[]): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  const addNode = (id: string, type: GraphNode['type'], label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, type, label });
  };
  const addEdge = (
    source: string,
    target: string,
    relationship: string,
    confidence: GraphEdge['confidence'] = 'medium'
  ) => {
    const key = `${source}->${target}:${relationship}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ source, target, relationship, confidence });
    }
  };

  const actors = new Set<string>();
  const malware = new Set<string>();
  const cves = new Set<string>();
  const mitre = new Set<string>();
  const iocs = new Set<string>();
  for (const s of steps) {
    const f = s.observerFindings;
    if (!f) continue;
    for (const a of f.actors ?? []) if (a) actors.add(a);
    for (const m of f.malware ?? []) if (m) malware.add(m);
    for (const c of f.cves ?? []) if (c) cves.add(c.toUpperCase());
    for (const m of f.mitre ?? []) if (m) mitre.add(m.trim().toUpperCase());
    for (const i of f.iocs ?? []) if (i) iocs.add(i);
  }

  for (const a of actors) addNode(`actor:${a}`, 'actor', a);
  for (const m of malware) addNode(`malware:${m}`, 'malware', m);
  for (const c of cves) addNode(c, 'cve', c);
  for (const t of mitre) addNode(`technique:${t}`, 'technique', t);
  for (const i of iocs) addNode(i, 'ioc', i);

  const primaryActor = [...actors][0];
  if (primaryActor) {
    for (const m of malware) addEdge(`actor:${primaryActor}`, `malware:${m}`, 'uses', 'high');
    for (const c of cves) addEdge(`actor:${primaryActor}`, c, 'exploits', 'medium');
    for (const i of [...iocs].slice(0, 10)) addEdge(`actor:${primaryActor}`, i, 'associated_with', 'low');
  }
  for (const c of cves) {
    for (const t of mitre) addEdge(c, `technique:${t}`, 'maps_to', 'medium');
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * Upsert a knowledge graph into D1, incrementing observation counts so the
 * knowledge base reflects how often each entity/relationship is seen.
 */
export async function recordKnowledgeGraph(db: D1Database, graph: GraphData): Promise<void> {
  try {
    const now = new Date().toISOString();
    for (const n of graph.nodes) {
      await db
        .prepare(
          `INSERT INTO knowledge_entities (id, type, label, first_seen, last_seen, observations)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, observations=knowledge_entities.observations+1`
        )
        .bind(n.id, n.type, n.label, now, now)
        .run();
    }
    for (const e of graph.edges) {
      const id = `${e.source}|${e.target}|${e.relationship}`;
      await db
        .prepare(
          `INSERT INTO knowledge_edges (id, source, target, relationship, confidence, weight)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET weight=knowledge_edges.weight+1`
        )
        .bind(id, e.source, e.target, e.relationship, e.confidence)
        .run();
    }
  } catch (err) {
    console.error('recordKnowledgeGraph failed:', err);
  }
}

/** Read the aggregated knowledge graph (top entities by observation count). */
export async function getKnowledgeGraph(db: D1Database, limit = 100): Promise<GraphData> {
  try {
    const { results: nodeRows } = await db
      .prepare(`SELECT id, type, label, observations FROM knowledge_entities ORDER BY observations DESC LIMIT ?`)
      .bind(limit)
      .all<{ id: string; type: GraphNode['type']; label: string; observations: number }>();
    const nodeIds = new Set(nodeRows.map((n) => n.id));
    const { results: edgeRows } = await db
      .prepare(
        `SELECT source, target, relationship, confidence, weight FROM knowledge_edges ORDER BY weight DESC LIMIT ?`
      )
      .bind(limit * 2)
      .all<{
        source: string;
        target: string;
        relationship: string;
        confidence: GraphEdge['confidence'];
        weight: number;
      }>();

    const nodes: GraphNode[] = nodeRows.map((n) => ({ id: n.id, type: n.type, label: n.label }));
    // Only keep edges whose endpoints are both in the top-N nodes.
    const edges: GraphEdge[] = edgeRows
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relationship: e.relationship, confidence: e.confidence }));
    return { nodes, edges };
  } catch (err) {
    console.error('getKnowledgeGraph failed:', err);
    return { nodes: [], edges: [] };
  }
}
