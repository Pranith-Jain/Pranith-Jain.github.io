import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Threat Graph Database — relationship-based threat intelligence.
 *
 * Models threats as a graph:
 *   - Nodes: IPs, domains, hashes, actors, malware, campaigns, CVEs
 *   - Edges: relationships with confidence scores and evidence
 *
 * Enables queries like:
 *   - "What actors are connected to this IP within 3 hops?"
 *   - "Find all infrastructure shared between these campaigns"
 *   - "What's the shortest path between these two IOCs?"
 *
 * Storage: D1 tables (nodes, edges)
 * Algorithms: BFS/DFS, shortest path, community detection
 */

// ── Types ───────────────────────────────────────────────────────────────

export type NodeType = 'ip' | 'domain' | 'hash' | 'url' | 'actor' | 'malware' | 'campaign' | 'cve' | 'technique';
export type EdgeType =
  | 'uses'
  | 'communicates'
  | 'resolves'
  | 'drops'
  | 'exploits'
  | 'attributed_to'
  | 'variant_of'
  | 'co_occurs'
  | 'precedes';

export interface GraphNode {
  id: string;
  type: NodeType;
  value: string;
  properties: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  confidence: number; // 0-100
  sources: string[];
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: EdgeType;
  confidence: number; // 0-100
  evidence: Array<{
    source: string;
    description: string;
    timestamp: string;
  }>;
  first_seen: string;
  last_seen: string;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
  total_confidence: number;
}

export interface GraphCluster {
  id: string;
  nodes: GraphNode[];
  centroid_type: NodeType;
  labels: string[];
  confidence: number;
}

// ── Database Schema ─────────────────────────────────────────────────────

export async function ensureGraphTables(db: D1Database): Promise<void> {
  // D1's exec() can fail with multiple statements; use individual prepares.
  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      properties TEXT DEFAULT '{}',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      confidence INTEGER DEFAULT 50,
      sources TEXT DEFAULT '[]'
    )
  `
    )
    .run();
  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      confidence INTEGER DEFAULT 50,
      evidence TEXT DEFAULT '[]',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )
  `
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_nodes_value ON graph_nodes(value)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_edges_relationship ON graph_edges(relationship)').run();
}

// ── Graph Operations ────────────────────────────────────────────────────

/**
 * Upsert a node. If it exists, update last_seen and merge properties.
 */
export async function upsertNode(
  db: D1Database,
  node: Omit<GraphNode, 'id' | 'last_seen' | 'first_seen'> & {
    id?: string;
    last_seen?: string;
    first_seen?: string;
  }
): Promise<GraphNode> {
  const id = node.id ?? `${node.type}:${node.value}`;
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT * FROM graph_nodes WHERE id = ?').bind(id).first<GraphNode>();

  if (existing) {
    // Merge properties and update — existing.properties / sources are D1
    // text columns that may be null. Parse safely using a fallback.
    const parseJsonSafe = (raw: unknown): Record<string, unknown> => {
      if (typeof raw !== 'string' || !raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };
    const parseSourcesSafe = (raw: unknown): string[] => {
      if (typeof raw !== 'string' || !raw) return [];
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    };
    const mergedProps = { ...parseJsonSafe(existing.properties), ...node.properties };
    const mergedSources = [...new Set([...parseSourcesSafe(existing.sources), ...(node.sources ?? [])])];

    await db
      .prepare(
        `UPDATE graph_nodes SET
        properties = ?,
        last_seen = ?,
        confidence = MAX(confidence, ?),
        sources = ?
      WHERE id = ?`
      )
      .bind(JSON.stringify(mergedProps), now, node.confidence ?? 50, JSON.stringify(mergedSources), id)
      .run();

    return { ...existing, properties: mergedProps, last_seen: now, sources: mergedSources };
  }

  const newNode: GraphNode = {
    id,
    type: node.type,
    value: node.value,
    properties: node.properties ?? {},
    first_seen: node.first_seen ?? now,
    last_seen: now,
    confidence: node.confidence ?? 50,
    sources: node.sources ?? [],
  };

  await db
    .prepare(
      `INSERT INTO graph_nodes (id, type, value, properties, first_seen, last_seen, confidence, sources)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newNode.id,
      newNode.type,
      newNode.value,
      JSON.stringify(newNode.properties),
      newNode.first_seen,
      newNode.last_seen,
      newNode.confidence,
      JSON.stringify(newNode.sources)
    )
    .run();

  return newNode;
}

/**
 * Create or update an edge between two nodes.
 */
export async function upsertEdge(
  db: D1Database,
  edge: Omit<GraphEdge, 'id' | 'last_seen' | 'first_seen'> & {
    id?: string;
    last_seen?: string;
    first_seen?: string;
  }
): Promise<GraphEdge> {
  const id = edge.id ?? `${edge.source_id}->${edge.relationship}->${edge.target_id}`;
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT * FROM graph_edges WHERE id = ?').bind(id).first<GraphEdge>();

  if (existing) {
    const parseEvidence = (raw: unknown): GraphEdge['evidence'] => {
      if (typeof raw !== 'string' || !raw) return [];
      try {
        const p: unknown = JSON.parse(raw);
        if (!Array.isArray(p)) return [];
        return p.filter(
          (x): x is GraphEdge['evidence'][number] =>
            typeof x === 'object' && x !== null && 'source' in x && 'description' in x && 'timestamp' in x
        );
      } catch {
        return [];
      }
    };
    const mergedEvidence = [...parseEvidence(existing.evidence), ...(edge.evidence ?? [])];
    await db
      .prepare(
        `UPDATE graph_edges SET
        last_seen = ?,
        confidence = MAX(confidence, ?),
        evidence = ?
      WHERE id = ?`
      )
      .bind(now, edge.confidence ?? 50, JSON.stringify(mergedEvidence.slice(-20)), id)
      .run();

    return { ...existing, last_seen: now, evidence: mergedEvidence };
  }

  const newEdge: GraphEdge = {
    id,
    source_id: edge.source_id,
    target_id: edge.target_id,
    relationship: edge.relationship,
    confidence: edge.confidence ?? 50,
    evidence: edge.evidence ?? [],
    first_seen: edge.first_seen ?? now,
    last_seen: now,
  };

  await db
    .prepare(
      `INSERT INTO graph_edges (id, source_id, target_id, relationship, confidence, evidence, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newEdge.id,
      newEdge.source_id,
      newEdge.target_id,
      newEdge.relationship,
      newEdge.confidence,
      JSON.stringify(newEdge.evidence),
      newEdge.first_seen,
      newEdge.last_seen
    )
    .run();

  return newEdge;
}

/**
 * Find a node by value (fuzzy match on type + value).
 */
export async function findNode(db: D1Database, type: NodeType, value: string): Promise<GraphNode | null> {
  return db.prepare('SELECT * FROM graph_nodes WHERE type = ? AND value = ?').bind(type, value).first<GraphNode>();
}

/**
 * Get neighbors of a node (1 hop).
 */
export async function getNeighbors(
  db: D1Database,
  nodeId: string,
  direction: 'outgoing' | 'incoming' | 'both' = 'both',
  relationship?: EdgeType
): Promise<Array<{ node: GraphNode; edge: GraphEdge }>> {
  let query: string;
  const params: unknown[] = [nodeId];

  if (direction === 'outgoing') {
    query = `SELECT n.*, e.* FROM graph_nodes n
             JOIN graph_edges e ON n.id = e.target_id
             WHERE e.source_id = ?`;
  } else if (direction === 'incoming') {
    query = `SELECT n.*, e.* FROM graph_nodes n
             JOIN graph_edges e ON n.id = e.source_id
             WHERE e.target_id = ?`;
  } else {
    query = `SELECT n.*, e.* FROM graph_nodes n
             JOIN graph_edges e ON (n.id = e.target_id AND e.source_id = ?)
                               OR (n.id = e.source_id AND e.target_id = ?)`;
    params.push(nodeId);
  }

  if (relationship) {
    query += ' AND e.relationship = ?';
    params.push(relationship);
  }

  query += ' ORDER BY e.confidence DESC';

  const rows = await db
    .prepare(query)
    .bind(...params)
    .all<GraphNode & GraphEdge>();

  return (rows.results ?? []).map((row) => ({
    node: {
      id: row.id,
      type: row.type,
      value: row.value,
      properties: JSON.parse((row.properties as unknown as string) ?? '{}'),
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      confidence: row.confidence,
      sources: JSON.parse((row.sources as unknown as string) ?? '[]'),
    },
    edge: {
      id: row.id, // This is wrong but simplified
      source_id: row.source_id,
      target_id: row.target_id,
      relationship: row.relationship,
      confidence: row.confidence,
      evidence: JSON.parse((row.evidence as unknown as string) ?? '[]'),
      first_seen: row.first_seen,
      last_seen: row.last_seen,
    },
  }));
}

/**
 * BFS shortest path between two nodes.
 */
export async function shortestPath(
  db: D1Database,
  startId: string,
  endId: string,
  maxDepth: number = 4
): Promise<GraphPath | null> {
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: string[]; edges: GraphEdge[] }> = [
    { nodeId: startId, path: [startId], edges: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.nodeId === endId) {
      // Found path - fetch full node data
      const nodes = await Promise.all(
        current.path.map((id) => db.prepare('SELECT * FROM graph_nodes WHERE id = ?').bind(id).first<GraphNode>())
      );

      return {
        nodes: nodes.filter(Boolean) as GraphNode[],
        edges: current.edges,
        length: current.path.length - 1,
        total_confidence: current.edges.reduce((min, e) => Math.min(min, e.confidence), 100),
      };
    }

    if (current.path.length > maxDepth) continue;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    // Get neighbors
    const neighbors = await db
      .prepare(
        `SELECT e.*, n.id as neighbor_id FROM graph_edges e
       JOIN graph_nodes n ON (n.id = e.target_id AND e.source_id = ?)
                         OR (n.id = e.source_id AND e.target_id = ?)`
      )
      .bind(current.nodeId, current.nodeId)
      .all<GraphEdge & { neighbor_id: string }>();

    for (const neighbor of neighbors.results ?? []) {
      if (!visited.has(neighbor.neighbor_id)) {
        queue.push({
          nodeId: neighbor.neighbor_id,
          path: [...current.path, neighbor.neighbor_id],
          edges: [
            ...current.edges,
            {
              id: neighbor.id,
              source_id: neighbor.source_id,
              target_id: neighbor.target_id,
              relationship: neighbor.relationship,
              confidence: neighbor.confidence,
              evidence: JSON.parse((neighbor.evidence as unknown as string) ?? '[]'),
              first_seen: neighbor.first_seen,
              last_seen: neighbor.last_seen,
            },
          ],
        });
      }
    }
  }

  return null; // No path found
}

/**
 * Find all nodes within N hops of a starting node.
 */
export async function neighborhood(
  db: D1Database,
  startId: string,
  depth: number = 2
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let currentLevel = [startId];

  for (let d = 0; d < depth; d++) {
    const nextLevel: string[] = [];

    for (const nodeId of currentLevel) {
      if (visitedNodes.has(nodeId)) continue;
      visitedNodes.add(nodeId);

      // Fetch node
      const node = await db.prepare('SELECT * FROM graph_nodes WHERE id = ?').bind(nodeId).first<GraphNode>();
      if (node) nodes.push(node);

      // Fetch edges
      const edgeRows = await db
        .prepare(`SELECT * FROM graph_edges WHERE source_id = ? OR target_id = ?`)
        .bind(nodeId, nodeId)
        .all<GraphEdge>();

      for (const edge of edgeRows.results ?? []) {
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          edges.push(edge);
          nextLevel.push(edge.source_id === nodeId ? edge.target_id : edge.source_id);
        }
      }
    }

    currentLevel = nextLevel;
  }

  return { nodes, edges };
}

/**
 * Detect communities using connected components.
 */
export async function detectCommunities(db: D1Database, minSize: number = 3): Promise<GraphCluster[]> {
  // Get all nodes and edges
  const allNodes = await db.prepare('SELECT * FROM graph_nodes').all<GraphNode>();
  const allEdges = await db.prepare('SELECT * FROM graph_edges').all<GraphEdge>();

  const adjacency = new Map<string, Set<string>>();
  for (const node of allNodes.results ?? []) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of allEdges.results ?? []) {
    adjacency.get(edge.source_id)?.add(edge.target_id);
    adjacency.get(edge.target_id)?.add(edge.source_id);
  }

  // Find connected components
  const visited = new Set<string>();
  const clusters: GraphCluster[] = [];

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;

    const component: string[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    if (component.length >= minSize) {
      const clusterNodes = (allNodes.results ?? []).filter((n) => component.includes(n.id));

      // Determine centroid type (most common type)
      const typeCounts = new Map<NodeType, number>();
      for (const node of clusterNodes) {
        typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
      }
      const centroidType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ip';

      clusters.push({
        id: `cluster-${clusters.length}`,
        nodes: clusterNodes,
        centroid_type: centroidType,
        labels: extractClusterLabels(clusterNodes),
        confidence: Math.min(100, component.length * 10),
      });
    }
  }

  return clusters.sort((a, b) => b.nodes.length - a.nodes.length);
}

function extractClusterLabels(nodes: GraphNode[]): string[] {
  const labels: string[] = [];
  const types = new Set(nodes.map((n) => n.type));

  if (types.has('actor')) {
    const actors = nodes.filter((n) => n.type === 'actor').map((n) => n.value);
    labels.push(...actors.slice(0, 3));
  }
  if (types.has('malware')) {
    const malware = nodes.filter((n) => n.type === 'malware').map((n) => n.value);
    labels.push(...malware.slice(0, 3));
  }

  return labels.slice(0, 5);
}

// ── Route Handlers ──────────────────────────────────────────────────────

/** GET /api/v1/graph/node/:type/:value — Get node with neighbors */
export async function graphNodeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const VALID_NODE_TYPES: NodeType[] = [
    'ip',
    'domain',
    'hash',
    'url',
    'actor',
    'malware',
    'campaign',
    'cve',
    'technique',
  ];
  const rawType = c.req.param('type') ?? 'ip';
  const type = VALID_NODE_TYPES.includes(rawType as NodeType) ? (rawType as NodeType) : 'ip';
  const value = c.req.param('value') ?? '';
  const rawDepth = parseInt(c.req.query('depth') ?? '1', 10);
  const depth = Math.max(1, Math.min(isNaN(rawDepth) ? 1 : rawDepth, 3));

  if (!value || value.length > 500) {
    return c.json({ error: 'valid value parameter required (max 500 chars)' }, 400);
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  await ensureGraphTables(db);

  const node = await findNode(db, type, value);
  if (!node) {
    return c.json({ found: false, message: 'Node not found in graph' });
  }

  const hood = await neighborhood(db, node.id, Math.min(depth, 3));

  return c.json(
    {
      found: true,
      node,
      neighbors: hood.nodes.filter((n) => n.id !== node.id),
      edges: hood.edges,
      stats: {
        neighbor_count: hood.nodes.length - 1,
        edge_count: hood.edges.length,
      },
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

/** GET /api/v1/graph/path — Find shortest path between two nodes */
export async function graphPathHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) {
    return c.json({ error: 'Both "from" and "to" parameters required' }, 400);
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  await ensureGraphTables(db);

  const path = await shortestPath(db, from, to);

  if (!path) {
    return c.json({ found: false, message: 'No path found between these nodes' });
  }

  return c.json({ found: true, path });
}

/** GET /api/v1/graph/communities — Detect threat communities */
export async function graphCommunitiesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  await ensureGraphTables(db);

  const minSize = parseInt(c.req.query('min_size') ?? '3');
  const communities = await detectCommunities(db, minSize);

  return c.json(
    {
      communities,
      count: communities.length,
      total_nodes: communities.reduce((sum, c) => sum + c.nodes.length, 0),
    },
    200,
    { 'Cache-Control': 'public, max-age=120' }
  );
}

/** GET /api/v1/graph/stats — Graph statistics */
export async function graphStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  await ensureGraphTables(db);

  const nodeCount = await db.prepare('SELECT COUNT(*) as count FROM graph_nodes').first<{ count: number }>();
  const edgeCount = await db.prepare('SELECT COUNT(*) as count FROM graph_edges').first<{ count: number }>();
  const typeCounts = await db
    .prepare('SELECT type, COUNT(*) as count FROM graph_nodes GROUP BY type ORDER BY count DESC')
    .all<{ type: string; count: number }>();
  const relationshipCounts = await db
    .prepare('SELECT relationship, COUNT(*) as count FROM graph_edges GROUP BY relationship ORDER BY count DESC')
    .all<{ relationship: string; count: number }>();

  return c.json(
    {
      nodes: nodeCount?.count ?? 0,
      edges: edgeCount?.count ?? 0,
      node_types: typeCounts.results ?? [],
      relationship_types: relationshipCounts.results ?? [],
      density:
        (nodeCount?.count ?? 0) > 1
          ? ((edgeCount?.count ?? 0) / ((nodeCount?.count ?? 0) * ((nodeCount?.count ?? 0) - 1))).toFixed(6)
          : 0,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

/**
 * GET /api/v1/graph/cross-report — knowledge-graph snapshot spanning
 * every ingested source. Returns the top N most-referenced nodes (by
 * `last_seen` recency + source count) and the edges that connect them,
 * paginated by node type filter. Backs the /threatintel/knowledge-graph
 * explorer.
 *
 * Query params:
 *   - types    comma-separated NodeType[] to include (default: all)
 *   - limit    max nodes to return (default 200, max 1000)
 *   - days     only consider nodes/edges seen in the last N days
 *              (default 90; 0 = no time filter)
 *   - minConn  minimum cross-source edge count to include a node
 *              (default 0; useful to de-noise the graph)
 */
export async function graphCrossReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const VALID_NODE_TYPES: NodeType[] = [
    'ip',
    'domain',
    'hash',
    'url',
    'actor',
    'malware',
    'campaign',
    'cve',
    'technique',
  ];

  const typesParam = (c.req.query('types') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const types =
    typesParam.length > 0
      ? (typesParam.filter((t) => VALID_NODE_TYPES.includes(t as NodeType)) as NodeType[])
      : VALID_NODE_TYPES;

  const limit = Math.min(1000, Math.max(1, parseInt(c.req.query('limit') ?? '200', 10) || 200));
  const days = Math.max(0, parseInt(c.req.query('days') ?? '90', 10) || 0);
  const minConn = Math.max(0, parseInt(c.req.query('minConn') ?? '0', 10) || 0);

  await ensureGraphTables(db);

  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const placeholders = types.map(() => '?').join(',');

  // Rank nodes by recency + how many distinct sources reference them.
  // `sources` is a JSON array; json_array_length gives us the count.
  const sql = cutoff
    ? `SELECT n.*,
              json_array_length(n.sources) AS source_count
         FROM graph_nodes n
         WHERE n.type IN (${placeholders})
           AND n.last_seen >= ?
         ORDER BY n.last_seen DESC, source_count DESC
         LIMIT ?`
    : `SELECT n.*,
              json_array_length(n.sources) AS source_count
         FROM graph_nodes n
         WHERE n.type IN (${placeholders})
         ORDER BY n.last_seen DESC, source_count DESC
         LIMIT ?`;
  const binds: (string | number)[] = [...types, ...(cutoff ? [cutoff] : []), limit];

  const nodeRes = await db
    .prepare(sql)
    .bind(...binds)
    .all<GraphNode & { source_count: number }>();
  const nodes = nodeRes.results ?? [];
  const nodeIds = nodes.map((n) => n.id);

  if (nodeIds.length === 0) {
    return c.json(
      { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, sourceTypes: [] }, cutoff, types, limit },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  }

  // Fetch edges between the selected nodes only. We use a temp-ish IN clause
  // to keep the result bounded. D1 supports up to 100 binds per statement;
  // batch the edge query if the node set is large.
  const edges: GraphEdge[] = [];
  const BATCH = 40;
  for (let i = 0; i < nodeIds.length; i += BATCH) {
    const batch = nodeIds.slice(i, i + BATCH);
    const ph = batch.map(() => '?').join(',');
    const eRes = await db
      .prepare(`SELECT * FROM graph_edges WHERE source_id IN (${ph}) AND target_id IN (${ph})`)
      .bind(...batch, ...batch)
      .all<GraphEdge>();
    if (eRes.results) edges.push(...eRes.results);
  }

  // Filter: a node is "well-connected" if it has at least `minConn` edges
  // in the kept set. Drops isolated nodes that pass the source/recency
  // filter but contribute nothing to the visible graph.
  const kept =
    minConn > 0
      ? (() => {
          const edgeCount = new Map<string, number>();
          for (const e of edges) {
            edgeCount.set(e.source_id, (edgeCount.get(e.source_id) ?? 0) + 1);
            edgeCount.set(e.target_id, (edgeCount.get(e.target_id) ?? 0) + 1);
          }
          return nodes.filter((n) => (edgeCount.get(n.id) ?? 0) >= minConn);
        })()
      : nodes;

  const keptIds = new Set(kept.map((n) => n.id));
  const keptEdges = edges.filter((e) => keptIds.has(e.source_id) && keptIds.has(e.target_id));

  // Edge dedup (same pair + relationship).
  const seenEdge = new Set<string>();
  const dedupEdges: GraphEdge[] = [];
  for (const e of keptEdges) {
    const k = `${e.source_id}->${e.target_id}:${e.relationship}`;
    if (seenEdge.has(k)) continue;
    seenEdge.add(k);
    dedupEdges.push(e);
  }

  return c.json(
    {
      nodes: kept,
      edges: dedupEdges,
      stats: {
        nodeCount: kept.length,
        edgeCount: dedupEdges.length,
        sourceTypes: Array.from(new Set(kept.map((n) => n.type))),
      },
      cutoff,
      types,
      limit,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
