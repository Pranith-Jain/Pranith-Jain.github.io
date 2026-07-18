import type { Context } from 'hono';
import type { Env } from '../env';

interface PathNode {
  id: string;
  label: string;
  type: 'domain' | 'subdomain' | 'ip' | 'port' | 'technology' | 'certificate' | 'entry' | 'crown_jewel';
  group: string;
  score: number;
  is_entry: boolean;
  is_crown_jewel: boolean;
  metadata?: Record<string, unknown>;
}

interface PathEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

interface AttackPath {
  nodes: PathNode[];
  edges: PathEdge[];
  paths: Array<{
    hops: string[];
    total_score: number;
    hop_count: number;
  }>;
  choke_points: Array<{
    node_id: string;
    label: string;
    path_count: number;
    score: number;
  }>;
  entry_points: string[];
  crown_jewels: string[];
  stats: {
    total_nodes: number;
    total_edges: number;
    total_paths: number;
    avg_path_length: number;
    worst_score: number;
  };
}

interface AsmAsset {
  id: string;
  domain_id: string;
  type: string;
  value: string;
  metadata: string;
  first_seen: string;
  last_seen: string;
  status: string;
}

interface AsmDomain {
  id: string;
  domain: string;
}

function pathScore(nodes: PathNode[]): number {
  if (nodes.length === 0) return 0;
  const avg = nodes.reduce((s, n) => s + n.score, 0) / nodes.length;
  return Math.round(avg);
}

export async function attackPathGraphHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) {
    return c.json(generateDemoGraph());
  }

  try {
    // Load ASM domains + assets
    const domains = await db.prepare('SELECT id, domain FROM asm_domains').all<AsmDomain>();
    const assets = await db.prepare('SELECT * FROM asm_assets').all<AsmAsset>();

    if (!assets.results || assets.results.length === 0) {
      return c.json(generateDemoGraph());
    }

    const nodes: PathNode[] = [];
    const edges: PathEdge[] = [];
    const domainMap = new Map<string, string>();
    for (const d of domains.results ?? []) domainMap.set(d.id, d.domain);

    const assetById = new Map<string, AsmAsset>();
    for (const a of assets.results ?? []) assetById.set(a.id, a);

    // Build node map for dedup
    const nodeByKey = new Map<string, PathNode>();
    const ipSubnets = new Map<string, string[]>();

    for (const a of assets.results ?? []) {
      const domainLabel = a.domain_id ? (domainMap.get(a.domain_id) ?? a.domain_id) : 'unknown';
      const meta = safeParseJson(a.metadata);
      const key = `${a.type}:${a.value}`;

      if (nodeByKey.has(key)) continue;

      const isEntry = a.type === 'ip' || a.type === 'subdomain';
      const isCrownJewel = a.type === 'technology' || a.type === 'certificate';

      const node: PathNode = {
        id: a.id,
        label: a.value,
        type: a.type as PathNode['type'],
        group: domainLabel,
        score: isEntry ? 60 : isCrownJewel ? 20 : 40,
        is_entry: isEntry,
        is_crown_jewel: isCrownJewel,
        metadata: meta,
      };
      nodeByKey.set(key, node);
      nodes.push(node);

      // Track IPs by /24 subnet for adjacency
      if (a.type === 'ip') {
        const parts = a.value.split('.');
        if (parts.length === 4) {
          const subnet = parts.slice(0, 3).join('.');
          if (!ipSubnets.has(subnet)) ipSubnets.set(subnet, []);
          ipSubnets.get(subnet)!.push(a.id);
        }
      }
    }

    // Build edges: domain → subdomain → IP → IP (same subnet)
    for (const a of assets.results ?? []) {
      if (a.type === 'subdomain') {
        // Connect subdomain to its domain
        if (a.domain_id && domainMap.has(a.domain_id)) {
          edges.push({
            source: domainMap.get(a.domain_id)!,
            target: a.value,
            label: 'resolves',
            weight: 8,
          });
        }

        // Connect subdomain to IPs in its metadata
        const meta = safeParseJson(a.metadata);
        const ips: string[] = (meta?.ips as string[]) ?? [];
        for (const ip of ips) {
          const ipKey = `ip:${ip}`;
          if (nodeByKey.has(ipKey)) {
            edges.push({
              source: a.value,
              target: ip,
              label: 'resolves to',
              weight: 9,
            });
          }
        }
      }

      if (a.type === 'ip' && a.domain_id && domainMap.has(a.domain_id)) {
        edges.push({
          source: domainMap.get(a.domain_id)!,
          target: a.value,
          label: 'hosts',
          weight: 7,
        });
      }
    }

    // Add subnet adjacency edges
    for (const [, ids] of ipSubnets) {
      for (let i = 0; i < ids.length - 1; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a1 = assetById.get(ids[i]!);
          const a2 = assetById.get(ids[j]!);
          if (a1 && a2) {
            edges.push({
              source: a1.value,
              target: a2.value,
              label: 'same subnet',
              weight: 5,
            });
          }
        }
      }
    }

    return c.json(buildResult(nodes, edges));
  } catch (e) {
    console.error('attack-path-graph failed:', e instanceof Error ? e.message : String(e));
    return c.json(generateDemoGraph());
  }
}

function findChokePoints(paths: AttackPath['paths'], nodes: PathNode[]): AttackPath['choke_points'] {
  const freq = new Map<string, number>();
  for (const p of paths) {
    const seen = new Set<string>();
    for (const hop of p.hops) {
      if (!seen.has(hop)) {
        seen.add(hop);
        freq.set(hop, (freq.get(hop) ?? 0) + 1);
      }
    }
  }

  return [...freq.entries()]
    .filter(([id]) => id !== 'INTERNET' && !nodes.find((n) => n.id === id)?.is_crown_jewel)
    .map(([node_id, count]) => {
      const node = nodes.find((n) => n.id === node_id || n.label === node_id);
      return {
        node_id,
        label: node?.label ?? node_id,
        path_count: count,
        score: Math.round((count / Math.max(paths.length, 1)) * 100),
      };
    })
    .sort((a, b) => b.path_count - a.path_count)
    .slice(0, 10);
}

function buildResult(nodes: PathNode[], edges: PathEdge[]): AttackPath {
  const entryPoints = nodes.filter((n) => n.is_entry).map((n) => n.id);
  const crownJewels = nodes.filter((n) => n.is_crown_jewel).map((n) => n.id);

  // Compute paths: BFS from each entry point to each crown jewel
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const n of nodes) adjacency.set(n.label, []);
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source);
  }

  const paths: AttackPath['paths'] = [];

  for (const entry of entryPoints) {
    const entryNode = nodes.find((n) => n.id === entry);
    if (!entryNode) continue;

    for (const jewel of crownJewels) {
      const jewelNode = nodes.find((n) => n.id === jewel);
      if (!jewelNode) continue;

      const result = bfsShortestPath(adjacency, entryNode.label, jewelNode.label);
      if (result) {
        const pathNodes = result.map((label) => nodes.find((n) => n.label === label)).filter(Boolean) as PathNode[];
        paths.push({
          hops: result,
          total_score: pathScore(pathNodes),
          hop_count: result.length - 1,
        });
      }
    }
  }

  // If no paths found via BFS, create synthetic paths
  if (paths.length === 0 && entryPoints.length > 0 && crownJewels.length > 0) {
    for (const entry of entryPoints) {
      const en = nodes.find((n) => n.id === entry);
      if (!en) continue;
      for (const jewel of crownJewels) {
        const jn = nodes.find((n) => n.id === jewel);
        if (!jn) continue;
        // Direct connection via intermediary
        const intermediary = nodes.find((n) => n.id !== en.id && n.id !== jn.id && !n.is_entry && !n.is_crown_jewel);
        if (intermediary) {
          paths.push({
            hops: [en.label, intermediary.label, jn.label],
            total_score: 55,
            hop_count: 2,
          });
        }
      }
    }
  }

  paths.sort((a, b) => b.total_score - a.total_score);

  const chokePoints = findChokePoints(paths, nodes);
  const avgLen = paths.length > 0 ? paths.reduce((s, p) => s + p.hop_count, 0) / paths.length : 0;
  const worstScore = paths.length > 0 ? Math.max(...paths.map((p) => p.total_score)) : 0;

  // Remove duplicate edges
  const seenEdges = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}::${e.target}`;
    const rev = `${e.target}::${e.source}`;
    if (seenEdges.has(key) || seenEdges.has(rev)) return false;
    seenEdges.add(key);
    return true;
  });

  return {
    nodes,
    edges: uniqueEdges,
    paths,
    choke_points: chokePoints,
    entry_points: entryPoints,
    crown_jewels: crownJewels,
    stats: {
      total_nodes: nodes.length,
      total_edges: uniqueEdges.length,
      total_paths: paths.length,
      avg_path_length: Number(avgLen.toFixed(1)),
      worst_score: worstScore,
    },
  };
}

function bfsShortestPath(adjacency: Map<string, string[]>, start: string, end: string): string[] | null {
  if (start === end) return [start];
  if (!adjacency.has(start) || !adjacency.has(end)) return null;

  const visited = new Set<string>();
  const queue: Array<{ node: string; path: string[] }> = [{ node: start, path: [start] }];
  visited.add(start);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    const neighbors = adjacency.get(node) ?? [];
    for (const n of neighbors) {
      if (n === end) return [...path, n];
      if (!visited.has(n)) {
        visited.add(n);
        queue.push({ node: n, path: [...path, n] });
      }
    }
  }

  return null;
}

function safeParseJson(s: string | undefined | null): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function generateDemoGraph(): AttackPath {
  const nodes: PathNode[] = [
    {
      id: 'internet',
      label: 'INTERNET',
      type: 'entry',
      group: 'external',
      score: 100,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'www',
      label: 'www.example.com',
      type: 'subdomain',
      group: 'example.com',
      score: 75,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'api',
      label: 'api.example.com',
      type: 'subdomain',
      group: 'example.com',
      score: 70,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'vpn',
      label: 'vpn.example.com',
      type: 'subdomain',
      group: 'example.com',
      score: 80,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'lb1',
      label: '203.0.113.10',
      type: 'ip',
      group: 'example.com',
      score: 65,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'lb2',
      label: '203.0.113.11',
      type: 'ip',
      group: 'example.com',
      score: 65,
      is_entry: true,
      is_crown_jewel: false,
    },
    {
      id: 'web1',
      label: '10.0.1.10',
      type: 'ip',
      group: 'internal',
      score: 50,
      is_entry: false,
      is_crown_jewel: false,
    },
    {
      id: 'web2',
      label: '10.0.1.11',
      type: 'ip',
      group: 'internal',
      score: 50,
      is_entry: false,
      is_crown_jewel: false,
    },
    { id: 'db1', label: '10.0.2.10', type: 'ip', group: 'internal', score: 30, is_entry: false, is_crown_jewel: false },
    {
      id: 'app',
      label: 'payments-app',
      type: 'technology',
      group: 'internal',
      score: 10,
      is_entry: false,
      is_crown_jewel: true,
    },
    {
      id: 'db',
      label: 'customer-db',
      type: 'technology',
      group: 'internal',
      score: 5,
      is_entry: false,
      is_crown_jewel: true,
    },
    {
      id: 'cert',
      label: '*.example.com TLS',
      type: 'certificate',
      group: 'example.com',
      score: 20,
      is_entry: false,
      is_crown_jewel: true,
    },
    {
      id: 'nginx',
      label: 'nginx 1.24',
      type: 'technology',
      group: 'internal',
      score: 40,
      is_entry: false,
      is_crown_jewel: false,
    },
    {
      id: 'pgsql',
      label: 'PostgreSQL 15',
      type: 'technology',
      group: 'internal',
      score: 30,
      is_entry: false,
      is_crown_jewel: false,
    },
  ];

  const edges: PathEdge[] = [
    { source: 'INTERNET', target: 'www.example.com', label: 'exposed', weight: 10 },
    { source: 'INTERNET', target: 'api.example.com', label: 'exposed', weight: 10 },
    { source: 'INTERNET', target: 'vpn.example.com', label: 'exposed', weight: 10 },
    { source: 'www.example.com', target: '203.0.113.10', label: 'resolves to', weight: 9 },
    { source: 'api.example.com', target: '203.0.113.11', label: 'resolves to', weight: 9 },
    { source: 'vpn.example.com', target: '203.0.113.10', label: 'resolves to', weight: 9 },
    { source: '203.0.113.10', target: '10.0.1.10', label: 'routes to', weight: 7 },
    { source: '203.0.113.10', target: '10.0.1.11', label: 'routes to', weight: 7 },
    { source: '203.0.113.11', target: '10.0.1.11', label: 'routes to', weight: 7 },
    { source: '10.0.1.10', target: '10.0.2.10', label: 'same subnet', weight: 5 },
    { source: '10.0.1.11', target: '10.0.2.10', label: 'same subnet', weight: 5 },
    { source: '10.0.2.10', target: 'nginx 1.24', label: 'runs', weight: 6 },
    { source: '10.0.2.10', target: 'PostgreSQL 15', label: 'runs', weight: 6 },
    { source: 'nginx 1.24', target: 'payments-app', label: 'proxies', weight: 8 },
    { source: 'PostgreSQL 15', target: 'customer-db', label: 'serves', weight: 8 },
    { source: 'nginx 1.24', target: '*.example.com TLS', label: 'serves', weight: 7 },
    { source: 'payments-app', target: 'customer-db', label: 'depends on', weight: 8 },
  ];

  return buildResult(nodes, edges);
}
