import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Graph-Based Campaign Auto-Detection
 *
 * Runs community detection on the threat graph to automatically identify
 * clusters of related IOCs that represent coordinated campaigns. Unlike
 * manual campaign tracking, this discovers campaigns from infrastructure
 * overlap, shared tooling, and temporal correlation.
 *
 * Algorithm:
 *   1. Load recent graph edges (last 30 days)
 *   2. Build adjacency list
 *   3. Run connected-components with edge-weight filtering
 *   4. Enrich clusters with actor/malware/CVE context
 *   5. Score clusters by coherence + novelty
 *   6. Return campaign candidates
 */

interface CampaignCluster {
  id: string;
  label: string;
  nodes: Array<{
    id: string;
    type: string;
    value: string;
    confidence: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
    confidence: number;
  }>;
  actors: string[];
  malware: string[];
  cves: string[];
  techniques: string[];
  sectors: string[];
  score: number;
  novelty: 'new' | 'evolving' | 'known';
  first_seen: string;
  last_seen: string;
  size: number;
  density: number;
  summary: string;
}

/**
 * Build adjacency list from recent graph edges.
 */
async function loadGraphEdges(
  db: D1Database,
  days: number
): Promise<{
  edges: Array<{ source_id: string; target_id: string; relationship: string; confidence: number }>;
  nodes: Map<string, { type: string; value: string; confidence: number }>;
}> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const [edgeRows, nodeRows] = await Promise.all([
    db
      .prepare(
        `SELECT source_id, target_id, relationship, confidence
         FROM graph_edges WHERE last_seen >= ? ORDER BY confidence DESC LIMIT 5000`
      )
      .bind(cutoff)
      .all<{ source_id: string; target_id: string; relationship: string; confidence: number }>(),
    db
      .prepare(`SELECT id, type, value, confidence FROM graph_nodes WHERE last_seen >= ?`)
      .bind(cutoff)
      .all<{ id: string; type: string; value: string; confidence: number }>(),
  ]);

  const nodes = new Map<string, { type: string; value: string; confidence: number }>();
  for (const n of nodeRows.results ?? []) {
    nodes.set(n.id, { type: n.type, value: n.value, confidence: n.confidence });
  }

  return { edges: edgeRows.results ?? [], nodes };
}

/**
 * Union-Find for connected components.
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    const rx = this.rank.get(px)!;
    const ry = this.rank.get(py)!;
    if (rx < ry) {
      this.parent.set(px, py);
    } else if (rx > ry) {
      this.parent.set(py, px);
    } else {
      this.parent.set(py, px);
      this.rank.set(px, rx + 1);
    }
  }

  components(): Map<string, string[]> {
    const comps = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!comps.has(root)) comps.set(root, []);
      comps.get(root)!.push(x);
    }
    return comps;
  }
}

/**
 * Detect campaigns from graph structure.
 */
async function detectCampaigns(db: D1Database, days: number, minClusterSize: number): Promise<CampaignCluster[]> {
  const { edges, nodes } = await loadGraphEdges(db, days);

  if (edges.length === 0) return [];

  // Build connected components using Union-Find
  const uf = new UnionFind();
  for (const edge of edges) {
    if (edge.confidence >= 40) {
      // Only use edges with reasonable confidence
      uf.union(edge.source_id, edge.target_id);
    }
  }

  const components = uf.components();
  const clusters: CampaignCluster[] = [];

  for (const [root, memberIds] of components) {
    if (memberIds.length < minClusterSize) continue;

    // Collect nodes and edges for this cluster
    const clusterNodes = memberIds
      .map((id) => {
        const n = nodes.get(id);
        return n ? { id, type: n.type, value: n.value, confidence: n.confidence } : null;
      })
      .filter(Boolean) as CampaignCluster['nodes'];

    const memberSet = new Set(memberIds);
    const clusterEdges = edges
      .filter((e) => memberSet.has(e.source_id) && memberSet.has(e.target_id))
      .map((e) => ({
        source: e.source_id,
        target: e.target_id,
        relationship: e.relationship,
        confidence: e.confidence,
      }));

    // Extract context from cluster
    const actors = clusterNodes.filter((n) => n.type === 'actor').map((n) => n.value);
    const malware = clusterNodes.filter((n) => n.type === 'malware').map((n) => n.value);
    const cves = clusterNodes.filter((n) => n.type === 'cve').map((n) => n.value);
    const techniques = clusterNodes.filter((n) => n.type === 'technique').map((n) => n.value);

    // Calculate cluster density (edges / max possible edges)
    const maxEdges = (memberIds.length * (memberIds.length - 1)) / 2;
    const density = maxEdges > 0 ? clusterEdges.length / maxEdges : 0;

    // Score: combination of size, density, confidence, and context richness
    const avgConfidence = clusterNodes.reduce((sum, n) => sum + n.confidence, 0) / Math.max(clusterNodes.length, 1);
    const contextBonus = (actors.length > 0 ? 20 : 0) + (malware.length > 0 ? 15 : 0) + (cves.length > 0 ? 10 : 0);
    const score = Math.min(
      100,
      Math.round(density * 30 + avgConfidence * 0.3 + contextBonus + Math.min(memberIds.length, 20) * 1.5)
    );

    // Determine novelty
    let novelty: CampaignCluster['novelty'] = 'new';
    if (actors.length > 0 && malware.length > 0) novelty = 'known';
    else if (actors.length > 0 || malware.length > 0) novelty = 'evolving';

    // Find temporal bounds
    const firstSeen = clusterNodes.reduce((min, n) => {
      const node = nodes.get(n.id);
      return node ? (min < (n.id as string) ? min : n.id) : min;
    }, '');
    const lastSeen = new Date().toISOString();

    // Generate label
    const label =
      actors.length > 0
        ? `${actors[0]}${malware.length > 0 ? ` + ${malware[0]}` : ''} cluster`
        : malware.length > 0
          ? `${malware[0]} infrastructure cluster`
          : cves.length > 0
            ? `CVE-${cves[0]} exploitation cluster`
            : `IOC cluster #${clusters.length + 1}`;

    // Generate summary
    const parts: string[] = [];
    parts.push(`${memberIds.length} nodes, ${clusterEdges.length} edges`);
    if (actors.length > 0) parts.push(`actors: ${actors.slice(0, 3).join(', ')}`);
    if (malware.length > 0) parts.push(`malware: ${malware.slice(0, 3).join(', ')}`);
    if (cves.length > 0) parts.push(`CVEs: ${cves.slice(0, 3).join(', ')}`);
    parts.push(`density: ${(density * 100).toFixed(0)}%`);

    clusters.push({
      id: `campaign-${root.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}`,
      label,
      nodes: clusterNodes,
      edges: clusterEdges,
      actors,
      malware,
      cves,
      techniques,
      sectors: [],
      score,
      novelty,
      first_seen: firstSeen,
      last_seen,
      size: memberIds.length,
      density: Math.round(density * 100) / 100,
      summary: parts.join(' · '),
    });
  }

  // Sort by score descending
  clusters.sort((a, b) => b.score - a.score);
  return clusters;
}

/**
 * GET /api/v1/campaigns/detect — Auto-detect campaigns from graph.
 */
export async function campaignDetectHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const days = Math.min(parseInt(c.req.query('days') ?? '30', 10) || 30, 90);
  const minSize = Math.min(parseInt(c.req.query('minSize') ?? '3', 10) || 3, 20);

  try {
    const campaigns = await detectCampaigns(db, days, minSize);
    return c.json(
      {
        generated_at: new Date().toISOString(),
        parameters: { days, minSize },
        total: campaigns.length,
        campaigns,
      },
      200,
      { 'cache-control': 'public, max-age=300, stale-while-revalidate=1200' }
    );
  } catch (err) {
    console.error('campaign-detect error:', err);
    return c.json({ error: 'detection failed' }, 500);
  }
}

/**
 * GET /api/v1/campaigns/detect/:id — Get a specific detected campaign.
 */
export async function campaignDetectDetailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'missing id' }, 400);

  try {
    const campaigns = await detectCampaigns(db, 30, 2);
    const campaign = campaigns.find((camp) => camp.id === id);
    if (!campaign) return c.json({ error: 'campaign not found' }, 404);
    return c.json(campaign, 200, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    console.error('campaign-detect-detail error:', err);
    return c.json({ error: 'failed' }, 500);
  }
}
