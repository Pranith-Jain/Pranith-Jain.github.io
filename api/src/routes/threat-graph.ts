import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, serviceUnavailable } from '../lib/api-error';
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

/**
 * A `graph_nodes` ⋈ `graph_edges` join row with every column aliased.
 *
 * Kept as a flat row type rather than a `GraphNode & GraphEdge` intersection
 * precisely because the two tables share column names — an intersection type
 * would collapse `id`/`confidence`/`first_seen`/`last_seen` to one field each
 * and hide the collision instead of preventing it.
 */
interface NeighborRow {
  n_id: string;
  n_type: NodeType;
  n_value: string;
  n_properties: string;
  n_first_seen: string;
  n_last_seen: string;
  n_confidence: number;
  n_sources: string;
  e_id: string;
  e_source_id: string;
  e_target_id: string;
  e_relationship: EdgeType;
  e_confidence: number;
  e_evidence: string;
  e_first_seen: string;
  e_last_seen: string;
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
 * Tolerant JSON parsing for the text columns (`properties`, `sources`,
 * `evidence`). These are written by `JSON.stringify` but a truncated write
 * or a manual D1 edit can leave malformed values; a throw here would take
 * down a whole graph read, so degrade to the empty value instead.
 */
function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (err) {
    logError('threat-graph parseJsonObject failed', err);
    return {};
  }
}

function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logError('threat-graph parseJsonArray failed', err);
    return [];
  }
}

/**
 * Column list for a node+edge join.
 *
 * `graph_nodes` and `graph_edges` both expose `id`, `first_seen`,
 * `last_seen` and `confidence`. Under `SELECT n.*, e.*` those names collide
 * and reading a row by name yields the *node* column for all four — so a
 * joined row silently reports the edge's confidence/timestamps as the node's.
 * Every column is aliased here so node and edge fields cannot be confused.
 */
const NEIGHBOR_COLUMNS = `
  n.id AS n_id, n.type AS n_type, n.value AS n_value, n.properties AS n_properties,
  n.first_seen AS n_first_seen, n.last_seen AS n_last_seen,
  n.confidence AS n_confidence, n.sources AS n_sources,
  e.id AS e_id, e.source_id AS e_source_id, e.target_id AS e_target_id,
  e.relationship AS e_relationship, e.confidence AS e_confidence,
  e.evidence AS e_evidence, e.first_seen AS e_first_seen, e.last_seen AS e_last_seen
`;

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

  const existing = await db
    .prepare(
      'SELECT id, type, value, properties, first_seen, last_seen, confidence, sources FROM graph_nodes WHERE id = ?'
    )
    .bind(id)
    .first<GraphNode>();

  if (existing) {
    // Merge properties and update — existing.properties / sources are D1
    // text columns that may be null. Parse safely using a fallback.
    const parseJsonSafe = (raw: unknown): Record<string, unknown> => {
      if (typeof raw !== 'string' || !raw) return {};
      try {
        return JSON.parse(raw);
      } catch (_catchErr) {
        logError('upsertNode failed', _catchErr);
        return {};
      }
    };
    const parseSourcesSafe = (raw: unknown): string[] => {
      if (typeof raw !== 'string' || !raw) return [];
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch (_catchErr) {
        logError('upsertNode failed', _catchErr);
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

  const existing = await db
    .prepare(
      'SELECT id, source_id, target_id, relationship, confidence, evidence, first_seen, last_seen FROM graph_edges WHERE id = ?'
    )
    .bind(id)
    .first<GraphEdge>();

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
      } catch (_catchErr) {
        logError('upsertEdge failed', _catchErr);
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
  return db
    .prepare(
      'SELECT id, type, value, properties, first_seen, last_seen, confidence, sources FROM graph_nodes WHERE type = ? AND value = ?'
    )
    .bind(type, value)
    .first<GraphNode>();
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
    query = `SELECT ${NEIGHBOR_COLUMNS} FROM graph_nodes n
             JOIN graph_edges e ON n.id = e.target_id
             WHERE e.source_id = ?`;
  } else if (direction === 'incoming') {
    query = `SELECT ${NEIGHBOR_COLUMNS} FROM graph_nodes n
             JOIN graph_edges e ON n.id = e.source_id
             WHERE e.target_id = ?`;
  } else {
    query = `SELECT ${NEIGHBOR_COLUMNS} FROM graph_nodes n
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
    .all<NeighborRow>();

  return (rows.results ?? []).map((row) => ({
    node: {
      id: row.n_id,
      type: row.n_type,
      value: row.n_value,
      properties: parseJsonObject(row.n_properties),
      first_seen: row.n_first_seen,
      last_seen: row.n_last_seen,
      confidence: row.n_confidence,
      sources: parseJsonArray(row.n_sources) as string[],
    },
    edge: {
      id: row.e_id,
      source_id: row.e_source_id,
      target_id: row.e_target_id,
      relationship: row.e_relationship,
      confidence: row.e_confidence,
      evidence: parseJsonArray(row.e_evidence) as GraphEdge['evidence'],
      first_seen: row.e_first_seen,
      last_seen: row.e_last_seen,
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
  // Level-synchronous BFS with parent pointers.
  //
  // The previous version dequeued one node at a time and issued a query per
  // dequeue, so a well-connected start node expanded hundreds of nodes and
  // blew past the 50-subrequest free-plan ceiling on a public route. It also
  // carried a full `path` string[] and edge list on every queue entry and used
  // `queue.shift()`, which is O(n) per pop.
  //
  // Tracking only the parent per discovered node makes reconstruction trivial
  // and lets each level expand in batched queries. BFS still yields a
  // shortest path in hops.
  const parent = new Map<string, { prev: string; edge: GraphEdge } | null>([[startId, null]]);
  let frontier = [startId];

  const reconstruct = (): { nodeIds: string[]; edges: GraphEdge[] } => {
    const nodeIds: string[] = [];
    const pathEdges: GraphEdge[] = [];
    let cursor: string | null = endId;
    while (cursor !== null) {
      nodeIds.push(cursor);
      const step: { prev: string; edge: GraphEdge } | null = parent.get(cursor) ?? null;
      if (!step) break;
      pathEdges.push(step.edge);
      cursor = step.prev;
    }
    nodeIds.reverse();
    pathEdges.reverse();
    return { nodeIds, edges: pathEdges };
  };

  for (let d = 0; d < maxDepth; d++) {
    if (frontier.length === 0) break;

    const frontierSet = new Set(frontier);
    const nextFrontier: string[] = [];
    let reached = false;

    for (const edge of await fetchEdgesForNodes(db, frontier)) {
      const from = frontierSet.has(edge.source_id) ? edge.source_id : edge.target_id;
      const other = from === edge.source_id ? edge.target_id : edge.source_id;
      if (parent.has(other)) continue;

      parent.set(other, { prev: from, edge });
      if (other === endId) {
        reached = true;
        break;
      }
      nextFrontier.push(other);
    }

    if (reached) {
      const { nodeIds, edges: pathEdges } = reconstruct();
      const hydrated = await hydrateNodes(db, nodeIds);
      return {
        // Preserve path order rather than the batch's row order.
        nodes: nodeIds.map((id) => hydrated.find((n) => n.id === id)).filter((n): n is GraphNode => Boolean(n)),
        edges: pathEdges,
        length: pathEdges.length,
        total_confidence: pathEdges.reduce((min, e) => Math.min(min, e.confidence), 100),
      };
    }

    frontier = nextFrontier;
  }

  return null; // No path found
}

/**
 * Find all nodes within N hops of a starting node.
 */
/** Id batches for the two-sided edge lookup (`source_id IN (…) OR target_id IN (…)`). */
const EDGE_NODE_BATCH = 45;

/**
 * Fetch every edge incident to any node in `nodeIds`, in as few queries as
 * possible.
 *
 * Each id is bound twice (once per side of the OR), and D1 caps a statement
 * at 100 bound parameters, so batches are half the usual size.
 */
async function fetchEdgesForNodes(db: D1Database, nodeIds: string[]): Promise<GraphEdge[]> {
  const out: GraphEdge[] = [];
  for (let i = 0; i < nodeIds.length; i += EDGE_NODE_BATCH) {
    const batch = nodeIds.slice(i, i + EDGE_NODE_BATCH);
    const ph = batch.map(() => '?').join(',');
    const res = await db
      .prepare(
        `SELECT id, source_id, target_id, relationship, confidence, evidence, first_seen, last_seen
           FROM graph_edges
          WHERE source_id IN (${ph}) OR target_id IN (${ph})`
      )
      .bind(...batch, ...batch)
      .all<GraphEdge>();
    for (const row of res.results ?? []) {
      out.push({
        ...row,
        evidence: parseJsonArray(row.evidence) as GraphEdge['evidence'],
      });
    }
  }
  return out;
}

/**
 * Every node and edge within `depth` hops of `startId` (undirected).
 *
 * Batched breadth-first: each level costs two queries regardless of how wide
 * the frontier is, rather than two per node. The previous per-node version
 * issued `2 × frontier` queries per level, so a node of degree 20 at depth 3
 * cost ~800 D1 subrequests — far past the 50-subrequest free-plan ceiling,
 * on a public unauthenticated route. Depth 3 now costs at most
 * `2 × ceil(frontier / 45)` queries.
 *
 * Direction is not tracked per-edge: the neighbour is whichever endpoint is
 * not in the current frontier, which is equivalent for an undirected walk and
 * removes the need to know which node each row came from.
 */
export async function neighborhood(
  db: D1Database,
  startId: string,
  depth: number = 2
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }> {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let currentLevel = [startId];
  let truncated = false;

  for (let d = 0; d < depth; d++) {
    const frontier = currentLevel.filter((id) => !visitedNodes.has(id));
    if (frontier.length === 0) break;
    for (const id of frontier) visitedNodes.add(id);

    const frontierSet = new Set(frontier);
    nodes.push(...(await hydrateNodes(db, frontier)));

    const nextLevel: string[] = [];
    for (const edge of await fetchEdgesForNodes(db, frontier)) {
      if (visitedEdges.has(edge.id)) continue;
      visitedEdges.add(edge.id);
      edges.push(edge);
      const other = frontierSet.has(edge.source_id) ? edge.target_id : edge.source_id;
      if (!visitedNodes.has(other)) nextLevel.push(other);
    }

    if (nodes.length >= NEIGHBORHOOD_MAX_NODES) {
      truncated = true;
      break;
    }
    currentLevel = nextLevel;
  }

  return { nodes, edges, truncated };
}

/** Rows pulled per keyset page while scanning the graph for components. */
const COMMUNITY_SCAN_PAGE = 5_000;

/**
 * Hard ceiling on edges examined for community detection.
 *
 * Component search has to see the whole graph to be correct, so past this
 * point we return the best-effort answer and flag it rather than loading
 * unbounded rows into an isolate (Workers cap memory at 128 MB).
 */
const COMMUNITY_MAX_EDGES = 200_000;

/** Ceiling on nodes returned across all communities, to bound response size. */
const COMMUNITY_MAX_NODES = 5_000;

/** D1 allows 100 bound parameters per statement; leave headroom. */
const COMMUNITY_NODE_BATCH = 90;

/**
 * Ceiling on nodes returned by a `neighborhood()` walk.
 *
 * A hub node can have hundreds of neighbours, and each one contributes its own
 * rows to the response. Capped so one request cannot return an unbounded
 * payload; the flag is surfaced to the caller rather than silently trimming.
 */
const NEIGHBORHOOD_MAX_NODES = 1000;

/**
 * Detect communities as connected components.
 *
 * Memory-conscious by design: the previous version ran
 * `SELECT * FROM graph_nodes` and `SELECT * FROM graph_edges`, materialising
 * every row — including the `properties`, `sources` and `evidence` JSON blobs
 * — before doing any work, then re-scanned the entire node list per cluster
 * using `component.includes()` (quadratic). This version scans only the `id`
 * columns needed for traversal via keyset pagination, and hydrates full node
 * rows for the surviving clusters only.
 *
 * Returns the clusters plus scan counters so callers can report truncation
 * instead of presenting a partial answer as complete.
 */
export async function detectCommunities(
  db: D1Database,
  minSize: number = 3
): Promise<{
  clusters: GraphCluster[];
  nodesScanned: number;
  edgesScanned: number;
  truncated: boolean;
}> {
  // Seed adjacency from node ids so isolated nodes still form size-1
  // components (matching previous behaviour when minSize <= 1).
  const adjacency = new Map<string, Set<string>>();
  let lastNodeId = '';
  let nodesScanned = 0;
  for (;;) {
    const page = await db
      .prepare('SELECT id FROM graph_nodes WHERE id > ? ORDER BY id LIMIT ?')
      .bind(lastNodeId, COMMUNITY_SCAN_PAGE)
      .all<{ id: string }>();
    const rows = page.results ?? [];
    if (rows.length === 0) break;
    for (const row of rows) adjacency.set(row.id, new Set());
    nodesScanned += rows.length;
    lastNodeId = rows[rows.length - 1]!.id;
    if (rows.length < COMMUNITY_SCAN_PAGE) break;
  }

  // Add undirected adjacency from edges, streaming pages so the full edge
  // set is never resident at once.
  let lastEdgeId = '';
  let edgesScanned = 0;
  let truncated = false;
  for (;;) {
    const page = await db
      .prepare('SELECT id, source_id, target_id FROM graph_edges WHERE id > ? ORDER BY id LIMIT ?')
      .bind(lastEdgeId, COMMUNITY_SCAN_PAGE)
      .all<{ id: string; source_id: string; target_id: string }>();
    const rows = page.results ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      adjacency.get(row.source_id)?.add(row.target_id);
      adjacency.get(row.target_id)?.add(row.source_id);
    }
    edgesScanned += rows.length;
    if (edgesScanned >= COMMUNITY_MAX_EDGES) {
      truncated = true;
      break;
    }
    lastEdgeId = rows[rows.length - 1]!.id;
    if (rows.length < COMMUNITY_SCAN_PAGE) break;
  }

  // Connected components. Membership uses a Set, and the queue is indexed by
  // cursor rather than shift() to avoid repeated array re-allocation.
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;

    const component: string[] = [];
    const member = new Set<string>();
    const queue: string[] = [startId];

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      if (visited.has(current)) continue;
      visited.add(current);
      member.add(current);
      component.push(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    if (component.length >= minSize) components.push(component);
  }

  // Bound total response size across all communities.
  const clusters: GraphCluster[] = [];
  let nodesReturned = 0;
  const ordered = components.sort((a, b) => b.length - a.length);

  for (const component of ordered) {
    if (nodesReturned >= COMMUNITY_MAX_NODES) {
      truncated = true;
      break;
    }
    const room = COMMUNITY_MAX_NODES - nodesReturned;
    const ids = room >= component.length ? component : component.slice(0, room);
    truncated = truncated || ids.length < component.length;

    const clusterNodes = await hydrateNodes(db, ids);
    if (clusterNodes.length === 0) continue;

    nodesReturned += clusterNodes.length;

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

  return {
    clusters: clusters.sort((a, b) => b.nodes.length - a.nodes.length),
    nodesScanned,
    edgesScanned,
    truncated,
  };
}

/**
 * Fetch full node rows for a set of ids, batched to stay inside D1's
 * 100-bound-parameter ceiling.
 */
async function hydrateNodes(db: D1Database, ids: string[]): Promise<GraphNode[]> {
  const out: GraphNode[] = [];
  for (let i = 0; i < ids.length; i += COMMUNITY_NODE_BATCH) {
    const batch = ids.slice(i, i + COMMUNITY_NODE_BATCH);
    const placeholders = batch.map(() => '?').join(',');
    const res = await db
      .prepare(
        `SELECT id, type, value, properties, first_seen, last_seen, confidence, sources
           FROM graph_nodes WHERE id IN (${placeholders})`
      )
      .bind(...batch)
      .all<GraphNode>();
    for (const row of res.results ?? []) {
      out.push({
        ...row,
        properties: parseJsonObject(row.properties),
        sources: parseJsonArray(row.sources) as string[],
      });
    }
  }
  return out;
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
    return badRequest(c, 'valid value parameter required (max 500 chars)');
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

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
        // True when the walk hit the node cap — the neighbourhood below is a
        // subset, so callers must not present it as the node's full context.
        truncated: hood.truncated,
        max_nodes: NEIGHBORHOOD_MAX_NODES,
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
    return badRequest(c, 'Both "from" and "to" parameters required');
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

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
  if (!db) return serviceUnavailable(c, 'Database not configured');

  await ensureGraphTables(db);

  const minSize = parseInt(c.req.query('min_size') ?? '3');
  const result = await detectCommunities(db, minSize);

  return c.json(
    {
      communities: result.clusters,
      count: result.clusters.length,
      total_nodes: result.clusters.reduce((sum, c) => sum + c.nodes.length, 0),
      // Surface the scan budget: a truncated result is a subset of the real
      // graph and must not be read as a complete clustering.
      scan: {
        nodes_scanned: result.nodesScanned,
        edges_scanned: result.edgesScanned,
        truncated: result.truncated,
        max_edges: COMMUNITY_MAX_EDGES,
        max_nodes: COMMUNITY_MAX_NODES,
      },
    },
    200,
    { 'Cache-Control': 'public, max-age=120' }
  );
}

/** GET /api/v1/graph/stats — Graph statistics */
export async function graphStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

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
  if (!db) return serviceUnavailable(c, 'Database not configured');

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
      .prepare(
        `SELECT id, source_id, target_id, relationship, confidence, evidence, first_seen, last_seen FROM graph_edges WHERE source_id IN (${ph}) AND target_id IN (${ph})`
      )
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
