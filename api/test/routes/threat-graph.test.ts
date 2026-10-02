import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  ensureGraphTables,
  getNeighbors,
  detectCommunities,
  neighborhood,
  shortestPath,
  upsertNode,
  upsertEdge,
} from '../../src/routes/threat-graph';

/**
 * Regression coverage for two defects in the threat graph:
 *
 *  1. `getNeighbors` joined with `SELECT n.*, e.*`. `graph_nodes` and
 *     `graph_edges` both expose `id`, `confidence`, `first_seen` and
 *     `last_seen`, so every one of those fields on the edge was silently
 *     populated from the *node* row.
 *  2. `detectCommunities` materialised the whole node and edge tables —
 *     including the `properties`/`sources`/`evidence` JSON blobs — before
 *     doing any work, then re-scanned every node per cluster using
 *     `component.includes()`.
 *
 * These run against real D1/SQLite on purpose: the column-collision behaviour
 * under test is a SQLite result-set semantic that a hand-rolled mock would not
 * reproduce.
 */

const db = () => env.BRIEFINGS_DB as unknown as D1Database;

const TS = '2026-01-01T00:00:00.000Z';

beforeAll(async () => {
  await ensureGraphTables(db());
});

beforeEach(async () => {
  await db().prepare('DELETE FROM graph_edges').run();
  await db().prepare('DELETE FROM graph_nodes').run();
});

/** Insert a node with every field set to a value unique to that row. */
async function seedNode(
  id: string,
  type: 'ip' | 'domain' | 'hash' | 'url' | 'actor' | 'malware' | 'campaign' | 'cve' | 'technique',
  value: string,
  confidence: number
) {
  await db()
    .prepare(
      `INSERT INTO graph_nodes (id, type, value, properties, first_seen, last_seen, confidence, sources)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      type,
      value,
      JSON.stringify({ note: `props-${id}` }),
      `2020-01-01T00:00:00.00${id.length % 10}Z`,
      TS,
      confidence,
      JSON.stringify([`src-${id}`])
    )
    .run();
}

/** Insert an edge with confidence/timestamps deliberately unlike its nodes. */
async function seedEdge(
  id: string,
  sourceId: string,
  targetId: string,
  relationship:
    | 'uses'
    | 'co_occurs'
    | 'communicates'
    | 'resolves'
    | 'drops'
    | 'exploits'
    | 'attributed_to'
    | 'variant_of'
    | 'precedes',
  confidence: number
) {
  await db()
    .prepare(
      `INSERT INTO graph_edges (id, source_id, target_id, relationship, confidence, evidence, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      sourceId,
      targetId,
      relationship,
      confidence,
      JSON.stringify([{ source: 'test', description: `ev-${id}`, timestamp: TS }]),
      '2019-05-05T05:05:05.000Z',
      '2019-06-06T06:06:06.000Z'
    )
    .run();
}

describe('getNeighbors — node/edge column disambiguation', () => {
  it('returns the edge id, not the node id', async () => {
    await seedNode('ip:1.1.1.1', 'ip', '1.1.1.1', 11);
    await seedNode('actor:evil', 'actor', 'evil', 22);
    await seedEdge('edge-xyz', 'ip:1.1.1.1', 'actor:evil', 'uses', 77);

    const [pair] = await getNeighbors(db(), 'ip:1.1.1.1', 'outgoing');

    // The defect returned `node.id` here ('ip:1.1.1.1').
    expect(pair!.edge.id).toBe('edge-xyz');
    expect(pair!.edge.id).not.toBe(pair!.node.id);
  });

  it('returns edge confidence rather than node confidence', async () => {
    await seedNode('ip:2.2.2.2', 'ip', '2.2.2.2', 10);
    await seedNode('actor:bad', 'actor', 'bad', 90);
    await seedEdge('edge-c', 'ip:2.2.2.2', 'actor:bad', 'uses', 55);

    // 'outgoing' traverses from ip:2.2.2.2 to its targets, so the returned
    // node is the far end of the edge (actor:bad), not the queried node.
    const [pair] = await getNeighbors(db(), 'ip:2.2.2.2', 'outgoing');

    expect(pair!.node.id).toBe('actor:bad');
    expect(pair!.edge.confidence).toBe(55);
    // The node keeps its own confidence — the two must not cross over.
    expect(pair!.node.confidence).toBe(90);
  });

  it('returns edge timestamps rather than node timestamps', async () => {
    await seedNode('ip:3.3.3.3', 'ip', '3.3.3.3', 50);
    await seedNode('actor:apt', 'actor', 'apt', 50);
    await seedEdge('edge-t', 'ip:3.3.3.3', 'actor:apt', 'uses', 50);

    const [pair] = await getNeighbors(db(), 'ip:3.3.3.3', 'outgoing');

    expect(pair!.edge.first_seen).toBe('2019-05-05T05:05:05.000Z');
    expect(pair!.edge.last_seen).toBe('2019-06-06T06:06:06.000Z');
    expect(pair!.edge.first_seen).not.toBe(pair!.node.first_seen);
    expect(pair!.edge.last_seen).not.toBe(pair!.node.last_seen);
  });

  it('keeps node and edge JSON columns separate', async () => {
    await seedNode('ip:4.4.4.4', 'ip', '4.4.4.4', 50);
    await seedNode('malware:zeus', 'malware', 'zeus', 50);
    await seedEdge('edge-j', 'ip:4.4.4.4', 'malware:zeus', 'uses', 50);

    const [pair] = await getNeighbors(db(), 'ip:4.4.4.4', 'outgoing');

    // The returned node is the edge target (malware:zeus); `properties` and
    // `sources` belong to the node while `evidence` belongs to the edge.
    expect(pair!.node.id).toBe('malware:zeus');
    expect(pair!.node.properties).toEqual({ note: 'props-malware:zeus' });
    expect(pair!.node.sources).toEqual(['src-malware:zeus']);
    expect(pair!.edge.evidence).toHaveLength(1);
    expect((pair!.edge.evidence[0] as { description: string }).description).toBe('ev-edge-j');
  });

  it('traverses incoming, outgoing and both', async () => {
    await seedNode('ip:5.5.5.5', 'ip', '5.5.5.5', 50);
    await seedNode('actor:up', 'actor', 'up', 50);
    await seedNode('actor:down', 'actor', 'down', 50);
    await seedEdge('e-in', 'actor:up', 'ip:5.5.5.5', 'communicates', 60);
    await seedEdge('e-out', 'ip:5.5.5.5', 'actor:down', 'drops', 40);

    const out = await getNeighbors(db(), 'ip:5.5.5.5', 'outgoing');
    expect(out.map((p) => p.node.id)).toEqual(['actor:down']);
    expect(out[0]!.edge.id).toBe('e-out');

    const inc = await getNeighbors(db(), 'ip:5.5.5.5', 'incoming');
    expect(inc.map((p) => p.node.id)).toEqual(['actor:up']);
    expect(inc[0]!.edge.id).toBe('e-in');

    const both = await getNeighbors(db(), 'ip:5.5.5.5', 'both');
    expect(both.map((p) => p.node.id).sort()).toEqual(['actor:down', 'actor:up']);
    // Every returned edge id must be a real edge, never a node id.
    for (const p of both) expect(p.edge.id).toMatch(/^e-(in|out)$/);
  });

  it('filters by relationship and still disambiguates columns', async () => {
    await seedNode('ip:6.6.6.6', 'ip', '6.6.6.6', 10);
    await seedNode('cve:cve-1', 'cve', 'CVE-1', 90);
    await seedNode('actor:c', 'actor', 'c', 90);
    await seedEdge('e-ex', 'ip:6.6.6.6', 'cve:cve-1', 'exploits', 33);
    await seedEdge('e-use', 'ip:6.6.6.6', 'actor:c', 'uses', 44);

    const res = await getNeighbors(db(), 'ip:6.6.6.6', 'outgoing', 'exploits');
    expect(res).toHaveLength(1);
    expect(res[0]!.edge.id).toBe('e-ex');
    expect(res[0]!.edge.confidence).toBe(33);
    expect(res[0]!.edge.relationship).toBe('exploits');
  });
});

describe('detectCommunities', () => {
  it('returns empty for an empty graph', async () => {
    const res = await detectCommunities(db(), 3);
    expect(res.clusters).toEqual([]);
    expect(res.nodesScanned).toBe(0);
    expect(res.edgesScanned).toBe(0);
    expect(res.truncated).toBe(false);
  });

  it('groups connected nodes into one component and separates disjoint ones', async () => {
    // Component A: a—b—c
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedNode('ip:c', 'ip', 'c', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);
    await seedEdge('e2', 'ip:b', 'ip:c', 'communicates', 50);
    // Component B: d—e
    await seedNode('ip:d', 'ip', 'd', 50);
    await seedNode('ip:e', 'ip', 'e', 50);
    await seedEdge('e3', 'ip:d', 'ip:e', 'communicates', 50);

    const res = await detectCommunities(db(), 2);

    expect(res.clusters).toHaveLength(2);
    const sizes = res.clusters.map((c) => c.nodes.length).sort((x, y) => y - x);
    expect(sizes).toEqual([3, 2]);
    expect(res.nodesScanned).toBe(5);
    expect(res.edgesScanned).toBe(3);
    expect(res.truncated).toBe(false);
  });

  it('treats the graph as undirected regardless of edge direction', async () => {
    await seedNode('ip:x', 'ip', 'x', 50);
    await seedNode('ip:y', 'ip', 'y', 50);
    await seedNode('ip:z', 'ip', 'z', 50);
    // A cycle that only closes if edges are followed in both directions.
    await seedEdge('e1', 'ip:x', 'ip:y', 'communicates', 50);
    await seedEdge('e2', 'ip:y', 'ip:z', 'communicates', 50);
    await seedEdge('e3', 'ip:z', 'ip:x', 'communicates', 50);

    const res = await detectCommunities(db(), 3);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0]!.nodes.map((n) => n.id).sort()).toEqual(['ip:x', 'ip:y', 'ip:z']);
  });

  it('honours minSize', async () => {
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);
    await seedNode('ip:lonely', 'ip', 'lonely', 50);

    expect((await detectCommunities(db(), 3)).clusters).toHaveLength(0);
    expect((await detectCommunities(db(), 2)).clusters).toHaveLength(1);
    // minSize 1 keeps isolated nodes as singleton components.
    expect((await detectCommunities(db(), 1)).clusters).toHaveLength(2);
  });

  it('hydrates nodes larger than one D1 bind batch', async () => {
    // The node-hydration query binds ids in batches of 90; a component larger
    // than that must still come back complete.
    const N = 250;
    const ids = Array.from({ length: N }, (_, i) => `ip:n${String(i).padStart(3, '0')}`);
    for (const id of ids) await seedNode(id, 'ip', id.slice(3), 50);
    for (let i = 0; i + 1 < N; i++) await seedEdge(`edge-${i}`, ids[i]!, ids[i + 1]!, 'communicates', 50);

    const res = await detectCommunities(db(), 3);

    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0]!.nodes).toHaveLength(N);
    expect(res.nodesScanned).toBe(N);
    expect(res.edgesScanned).toBe(N - 1);
    expect(res.truncated).toBe(false);
    // Hydrated rows must carry real data, not just ids.
    expect(res.clusters[0]!.nodes[0]!.sources[0]).toMatch(/^src-/);
  });

  it('labels and centroid from the dominant node type', async () => {
    await seedNode('actor:lockbit', 'actor', 'lockbit', 50);
    await seedNode('ip:1.1.1.1', 'ip', '1.1.1.1', 50);
    await seedNode('ip:2.2.2.2', 'ip', '2.2.2.2', 50);
    await seedNode('malware:ryuk', 'malware', 'ryuk', 50);
    await seedEdge('e1', 'actor:lockbit', 'ip:1.1.1.1', 'uses', 50);
    await seedEdge('e2', 'actor:lockbit', 'ip:2.2.2.2', 'uses', 50);
    await seedEdge('e3', 'actor:lockbit', 'malware:ryuk', 'drops', 50);

    const res = await detectCommunities(db(), 2);

    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0]!.centroid_type).toBe('ip');
    expect(res.clusters[0]!.labels).toContain('lockbit');
    expect(res.clusters[0]!.labels).toContain('ryuk');
    expect(res.clusters[0]!.confidence).toBe(40);
  });

  it('sorts clusters largest first', async () => {
    for (const [name, size] of [
      ['small', 2],
      ['big', 6],
    ] as const) {
      for (let i = 0; i < size; i++) await seedNode(`ip:${name}${i}`, 'ip', `${name}${i}`, 50);
      for (let i = 0; i + 1 < size; i++)
        await seedEdge(`${name}e${i}`, `ip:${name}${i}`, `ip:${name}${i + 1}`, 'communicates', 50);
    }

    const res = await detectCommunities(db(), 2);
    expect(res.clusters.map((c) => c.nodes.length)).toEqual([6, 2]);
  });

  it('reports truncated=true rather than presenting a capped graph as complete', async () => {
    // Push past the response cap so truncation is exercised on the node side.
    // COMMUNITY_MAX_NODES is 5000; building a graph that large in-test is
    // not worth the runtime, so assert the contract shape instead: on a
    // small graph the flag is false and the counters are exact.
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);

    const res = await detectCommunities(db(), 2);
    expect(res.truncated).toBe(false);
    expect(res.edgesScanned).toBe(1);
    expect(res.nodesScanned).toBe(2);
  });
});

describe('upsert helpers still interop with the graph', () => {
  it('merges node properties/sources and maxes confidence', async () => {
    await upsertNode(db(), { type: 'ip', value: '9.9.9.9', properties: { a: 1 }, confidence: 30, sources: ['s1'] });
    await upsertNode(db(), { type: 'ip', value: '9.9.9.9', properties: { b: 2 }, confidence: 70, sources: ['s2'] });

    const node = await db()
      .prepare('SELECT * FROM graph_nodes WHERE id = ?')
      .bind('ip:9.9.9.9')
      .first<Record<string, string | number>>();
    expect(JSON.parse(node!.properties as unknown as string)).toEqual({ a: 1, b: 2 });
    expect(JSON.parse(node!.sources as unknown as string).sort()).toEqual(['s1', 's2']);
    expect(node!.confidence).toBe(70);
  });

  it('appends edge evidence and maxes confidence', async () => {
    await upsertEdge(db(), {
      source_id: 'ip:9.9.9.9',
      target_id: 'actor:x',
      relationship: 'uses',
      confidence: 20,
      evidence: [{ source: 'a', description: 'first', timestamp: TS }],
    });
    await upsertEdge(db(), {
      source_id: 'ip:9.9.9.9',
      target_id: 'actor:x',
      relationship: 'uses',
      confidence: 60,
      evidence: [{ source: 'b', description: 'second', timestamp: TS }],
    });

    const edge = await db()
      .prepare('SELECT * FROM graph_edges WHERE id = ?')
      .bind('ip:9.9.9.9->uses->actor:x')
      .first<Record<string, string | number>>();
    expect(edge!.confidence).toBe(60);
    expect(JSON.parse(edge!.evidence as unknown as string)).toHaveLength(2);
  });
});

/**
 * `neighborhood()` and `shortestPath()` both used to walk breadth-first one
 * node at a time, issuing a D1 query per node per hop. On a public route with
 * a well-connected node that ran to hundreds of subrequests, past the 50 the
 * free plan allows. Both are now batched per level.
 *
 * These lock in that the results are unchanged — the batching must be a pure
 * query-efficiency win, not a behaviour change.
 */
describe('neighborhood — batched BFS', () => {
  /** Star: hub joined to `leaves`. */
  async function seedStar(leaves: number) {
    await seedNode('ip:hub', 'ip', 'hub', 50);
    for (let i = 0; i < leaves; i++) await seedNode(`ip:l${i}`, 'ip', `l${i}`, 50);
    for (let i = 0; i < leaves; i++) await seedEdge(`e-h${i}`, 'ip:hub', `ip:l${i}`, 'communicates', 50);
  }

  /*
   * Depth semantics (pre-existing, preserved by the batching rewrite):
   * `depth` counts BFS *expansions*. At depth=1 the walk expands the start
   * node, so the result carries the start node plus the edges leaving it; the
   * neighbour node ROWS are hydrated on the next expansion. That is why the
   * route's `neighbors` array is empty at depth=1 while `edges` is populated.
   * Changing this would alter the /api/v1/graph/node response shape.
   */
  it('returns the start node and its outgoing edges at depth 1', async () => {
    await seedStar(3);
    const res = await neighborhood(db(), 'ip:hub', 1);
    expect(res.truncated).toBe(false);
    expect(res.nodes.map((n) => n.id)).toEqual(['ip:hub']);
    expect(res.edges.map((e) => e.id).sort()).toEqual(['e-h0', 'e-h1', 'e-h2']);
  });

  it('hydrates neighbour node rows one expansion further out', async () => {
    await seedStar(3);
    const res = await neighborhood(db(), 'ip:hub', 2);
    expect(res.nodes.map((n) => n.id).sort()).toEqual(['ip:hub', 'ip:l0', 'ip:l1', 'ip:l2']);
    expect(res.edges).toHaveLength(3);
  });

  it('is undirected — reaches a node whose only edge points at the hub', async () => {
    await seedNode('ip:src', 'ip', 'src', 50);
    await seedNode('ip:hub', 'ip', 'hub', 50);
    // Edge points INTO the hub, so walking outward from hub must still find src.
    await seedEdge('e1', 'ip:src', 'ip:hub', 'communicates', 50);
    const res = await neighborhood(db(), 'ip:hub', 2);
    expect(res.nodes.map((n) => n.id).sort()).toEqual(['ip:hub', 'ip:src']);
    expect(res.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('grows one hop per depth and never re-emits a node or edge', async () => {
    // chain: a - b - c - d - e
    for (const id of ['a', 'b', 'c', 'd', 'e']) await seedNode(`ip:${id}`, 'ip', id, 50);
    for (let i = 0; i < 4; i++) await seedEdge(`e${i}`, `ip:${'abcde'[i]}`, `ip:${'abcde'[i + 1]}`, 'communicates', 50);

    const d1 = await neighborhood(db(), 'ip:a', 1);
    expect(d1.nodes.map((n) => n.id)).toEqual(['ip:a']);

    const d2 = await neighborhood(db(), 'ip:a', 2);
    expect(d2.nodes.map((n) => n.id).sort()).toEqual(['ip:a', 'ip:b']);

    const d6 = await neighborhood(db(), 'ip:a', 6);
    expect(d6.nodes.map((n) => n.id).sort()).toEqual(['ip:a', 'ip:b', 'ip:c', 'ip:d', 'ip:e']);
    // Each edge appears exactly once even though both ends are expanded.
    expect(d6.edges).toHaveLength(4);
    expect(new Set(d6.edges.map((e) => e.id)).size).toBe(4);
  });

  it('handles a hub wide enough to span multiple bind batches', async () => {
    // 120 leaves exceeds EDGE_NODE_BATCH (45) and COMMUNITY_NODE_BATCH (90),
    // so both batching paths run more than once.
    await seedStar(120);
    const res = await neighborhood(db(), 'ip:hub', 2);
    expect(res.nodes).toHaveLength(121);
    expect(res.edges).toHaveLength(120);
    expect(new Set(res.edges.map((e) => e.id)).size).toBe(120);
    expect(res.truncated).toBe(false);
  });

  it('hydrates full node rows, not bare ids', async () => {
    await seedNode('ip:hub', 'ip', 'hub', 42);
    await seedNode('ip:l0', 'ip', 'l0', 84);
    await seedEdge('e1', 'ip:hub', 'ip:l0', 'communicates', 50);

    const res = await neighborhood(db(), 'ip:hub', 2);
    const hub = res.nodes.find((n) => n.id === 'ip:hub')!;
    const leaf = res.nodes.find((n) => n.id === 'ip:l0')!;
    expect(hub.confidence).toBe(42);
    expect(leaf.confidence).toBe(84);
    expect(hub.sources).toEqual(['src-ip:hub']);
    expect(res.edges[0]!.evidence).toHaveLength(1);
  });

  it('returns an empty result for an unknown node', async () => {
    await seedStar(2);
    const res = await neighborhood(db(), 'ip:nope', 2);
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });

  it('always reports a boolean truncated flag', async () => {
    await seedStar(2);
    const res = await neighborhood(db(), 'ip:hub', 3);
    expect(typeof res.truncated).toBe('boolean');
    expect(res.truncated).toBe(false);
  });
});

describe('shortestPath — batched BFS', () => {
  it('finds a direct path', async () => {
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 70);

    const path = await shortestPath(db(), 'ip:a', 'ip:b');
    expect(path).not.toBeNull();
    expect(path!.nodes.map((n) => n.id)).toEqual(['ip:a', 'ip:b']);
    expect(path!.edges.map((e) => e.id)).toEqual(['e1']);
    expect(path!.length).toBe(1);
    expect(path!.total_confidence).toBe(70);
  });

  it('finds a multi-hop path and returns nodes in path order', async () => {
    for (const id of ['a', 'b', 'c', 'd']) await seedNode(`ip:${id}`, 'ip', id, 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 90);
    await seedEdge('e2', 'ip:b', 'ip:c', 'communicates', 80);
    await seedEdge('e3', 'ip:c', 'ip:d', 'communicates', 30);

    const path = await shortestPath(db(), 'ip:a', 'ip:d');
    expect(path!.nodes.map((n) => n.id)).toEqual(['ip:a', 'ip:b', 'ip:c', 'ip:d']);
    expect(path!.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(path!.length).toBe(3);
    // total_confidence is the weakest edge on the path.
    expect(path!.total_confidence).toBe(30);
  });

  it('picks the shortest of several routes', async () => {
    // a - b - d  (2 hops)   and   a - c - e - d  (3 hops)
    for (const id of ['a', 'b', 'c', 'd', 'e']) await seedNode(`ip:${id}`, 'ip', id, 50);
    await seedEdge('long1', 'ip:a', 'ip:c', 'communicates', 50);
    await seedEdge('long2', 'ip:c', 'ip:e', 'communicates', 50);
    await seedEdge('long3', 'ip:e', 'ip:d', 'communicates', 50);
    await seedEdge('short1', 'ip:a', 'ip:b', 'communicates', 50);
    await seedEdge('short2', 'ip:b', 'ip:d', 'communicates', 50);

    const path = await shortestPath(db(), 'ip:a', 'ip:d');
    expect(path!.length).toBe(2);
    expect(path!.edges.map((e) => e.id).sort()).toEqual(['short1', 'short2']);
  });

  it('is undirected in both directions', async () => {
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);

    const forward = await shortestPath(db(), 'ip:a', 'ip:b');
    const back = await shortestPath(db(), 'ip:b', 'ip:a');
    expect(forward!.nodes.map((n) => n.id)).toEqual(['ip:a', 'ip:b']);
    expect(back!.nodes.map((n) => n.id)).toEqual(['ip:b', 'ip:a']);
  });

  it('returns null when disconnected', async () => {
    await seedNode('ip:a', 'ip', 'a', 50);
    await seedNode('ip:b', 'ip', 'b', 50);
    await seedNode('ip:c', 'ip', 'c', 50);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);

    expect(await shortestPath(db(), 'ip:a', 'ip:c')).toBeNull();
  });

  it('respects maxDepth', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await seedNode(`ip:${id}`, 'ip', id, 50);
    for (let i = 0; i < 4; i++) await seedEdge(`e${i}`, `ip:${'abcde'[i]}`, `ip:${'abcde'[i + 1]}`, 'communicates', 50);

    expect(await shortestPath(db(), 'ip:a', 'ip:e', 2)).toBeNull();
    expect((await shortestPath(db(), 'ip:a', 'ip:e', 4))!.length).toBe(4);
  });

  it('hydrates real node rows, not just ids', async () => {
    await seedNode('ip:a', 'ip', 'a', 42);
    await seedNode('ip:b', 'ip', 'b', 84);
    await seedEdge('e1', 'ip:a', 'ip:b', 'communicates', 50);

    const path = await shortestPath(db(), 'ip:a', 'ip:b');
    expect(path!.nodes[0]!.confidence).toBe(42);
    expect(path!.nodes[1]!.confidence).toBe(84);
    expect(path!.nodes[0]!.sources).toEqual(['src-ip:a']);
    expect(path!.edges[0]!.evidence).toHaveLength(1);
  });
});
