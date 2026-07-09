import { lookupCve } from './cve-lookup';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { mitreGroupRef } from './ransomware-mitre-groups';
import { techniquesForGroup } from './ransomware-group-techniques';
import { RANSOMWARE_SLUGS } from './ransomware-slugs';

import { safeNullLog } from './safe-catch';

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MD5_RE = /^[a-f0-9]{32}$/i;
const SHA1_RE = /^[a-f0-9]{40}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export type GraphNodeType =
  | 'cve'
  | 'actor'
  | 'ransomware'
  | 'malware'
  | 'campaign'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'technique'
  | 'victim'
  | 'c2_framework'
  | 'product'
  | 'reference';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  /** Severity/risk for colouring — cvss, confidence, source_count etc. */
  weight?: number;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  seed: string;
  seed_type: GraphNodeType | null;
  generated_at: string;
  depth: number;
  truncated: boolean;
  warning?: string;
}

interface GraphAccum {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  visited: Set<string>;
}

let edgeSeq = 0;
function edgeId(src: string, tgt: string, label: string): string {
  return `e-${++edgeSeq}-${src}--${label}-->${tgt}`;
}

function addNode(acc: GraphAccum, node: GraphNode): void {
  if (!acc.nodes.has(node.id)) acc.nodes.set(node.id, node);
}

function addEdge(acc: GraphAccum, source: string, target: string, label: string): void {
  const id = edgeId(source, target, label);
  if (!acc.edges.has(id)) acc.edges.set(id, { id, source, target, label });
}

const MAX_NODES = 200;
const MAX_EDGES = 500;

function truncated(acc: GraphAccum): boolean {
  return acc.nodes.size >= MAX_NODES || acc.edges.size >= MAX_EDGES;
}

// ── Resolve ──────────────────────────────────────────────────────────────

export interface ResolvedEntity {
  type: GraphNodeType;
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export function resolveSeed(query: string): ResolvedEntity | null {
  const q = query.trim();

  if (CVE_RE.test(q)) {
    return { type: 'cve', id: q.toUpperCase(), label: q.toUpperCase() };
  }

  if (IP_RE.test(q)) {
    return { type: 'ip', id: `ip:${q}`, label: q };
  }

  if (DOMAIN_RE.test(q)) {
    return { type: 'domain', id: `domain:${q}`, label: q };
  }

  if (MD5_RE.test(q)) return { type: 'hash', id: `hash:${q}`, label: q.substring(0, 16) + '…' };
  if (SHA1_RE.test(q)) return { type: 'hash', id: `hash:${q}`, label: q.substring(0, 16) + '…' };
  if (SHA256_RE.test(q)) return { type: 'hash', id: `hash:${q}`, label: q.substring(0, 16) + '…' };

  // Try actor aliases — exact match on canonical, slug, or any alias
  const ql = q.toLowerCase();
  for (const a of ACTOR_ALIASES) {
    if (a.slug === ql || a.canonical.toLowerCase() === ql || a.aliases.some((al) => al.toLowerCase() === ql)) {
      const isRansomware = RANSOMWARE_SLUGS.has(a.slug);
      return {
        type: isRansomware ? 'ransomware' : 'actor',
        id: `actor:${a.slug}`,
        label: a.canonical,
        data: { slug: a.slug, mitreId: a.mitreId, aliases: a.aliases },
      };
    }
  }

  // Fuzzy actor match — query is a substring of canonical or any alias
  for (const a of ACTOR_ALIASES) {
    if (a.canonical.toLowerCase().includes(ql) || a.aliases.some((al) => al.toLowerCase().includes(ql))) {
      const isRansomware = RANSOMWARE_SLUGS.has(a.slug);
      return {
        type: isRansomware ? 'ransomware' : 'actor',
        id: `actor:${a.slug}`,
        label: a.canonical,
        data: { slug: a.slug, mitreId: a.mitreId, aliases: a.aliases },
      };
    }
  }

  // Try ransomware group via mitreGroupRef
  const ref = mitreGroupRef(q);
  if (ref) {
    return {
      type: 'ransomware',
      id: `ransomware:${ref.id}`,
      label: ref.name,
      data: { mitreId: ref.id, url: ref.url },
    };
  }

  return null;
}

// ── Traversal helpers ────────────────────────────────────────────────────

async function expandCve(acc: GraphAccum, cveId: string, depth: number): Promise<void> {
  const nodeId = cveId;
  if (acc.visited.has(nodeId)) return;
  acc.visited.add(nodeId);

  // Async: CVE details (CVSS, KEV, products) — actor links come from
  // heuristic NVD/KEV scanning, not curated mappings.
  if (depth > 0 && !truncated(acc)) {
    const result = await safeNullLog('lookup-cve-relgraph', lookupCve(cveId));
    if (result?.ok) {
      const d = result.data;
      if (d.affected_products) {
        for (const product of d.affected_products.slice(0, 5)) {
          const pid = `product:${product}`;
          if (!acc.nodes.has(pid)) {
            addNode(acc, { id: pid, type: 'product', label: product });
          }
          addEdge(acc, nodeId, pid, 'affects');
          if (truncated(acc)) return;
        }
      }
      // Update the CVE node with enrichment
      const existing = acc.nodes.get(nodeId);
      if (existing) {
        existing.weight = d.cvss?.base_score;
        existing.subtitle = d.cvss ? `${d.cvss.severity} ${d.cvss.base_score}` : undefined;
        if (d.kev?.in_kev) existing.subtitle = (existing.subtitle ?? '') + ' [KEV]';
        existing.data = {
          ...(existing.data ?? {}),
          published: d.published,
          cvss: d.cvss,
          kev: d.kev,
          epss: d.epss,
        };
      }

      // Link actors from heuristic scan of CVE data
      if (d.actor_links) {
        for (const al of d.actor_links) {
          const aid = `actor:${al.slug}`;
          if (!acc.nodes.has(aid)) {
            const aAlias = ACTOR_ALIASES.find((a) => a.slug === al.slug);
            addNode(acc, {
              id: aid,
              type: 'actor',
              label: aAlias?.canonical ?? al.slug,
              data: { slug: al.slug, confidence: al.confidence },
            });
          }
          addEdge(acc, nodeId, aid, 'exploited by');
          if (truncated(acc)) return;
        }
      }
    }
  }
}

function expandActor(acc: GraphAccum, slug: string, label: string, isRansomware: boolean): void {
  const nodeId = `actor:${slug}`;
  if (acc.visited.has(nodeId)) return;
  acc.visited.add(nodeId);

  // MITRE techniques (for actors with mitreId)
  const alias = ACTOR_ALIASES.find((a) => a.slug === slug);
  if (alias?.mitreId) {
    const techniques = techniquesForGroup(alias.mitreId);
    for (const t of techniques) {
      const tid = `technique:${t.id}`;
      if (!acc.nodes.has(tid)) {
        addNode(acc, {
          id: tid,
          type: 'technique',
          label: `${t.id}: ${t.name}`,
          subtitle: t.tactic,
        });
      }
      addEdge(acc, nodeId, tid, 'uses');
      if (truncated(acc)) return;
    }

    // MITRE group reference
    const ref = mitreGroupRef(alias.mitreId);
    if (ref && !isRansomware) {
      const groupId = `mitre:${ref.id}`;
      if (!acc.nodes.has(groupId)) {
        addNode(acc, { id: groupId, type: 'technique', label: `${ref.id}: ${ref.name}` });
      }
      addEdge(acc, nodeId, groupId, 'attributed to');
      if (truncated(acc)) return;
    }
  }

  // Link to ransomware group if this actor is a ransomware operator
  if (isRansomware) {
    addNode(acc, {
      id: nodeId,
      type: 'ransomware',
      label,
      data: { slug, mitreId: alias?.mitreId },
    });
    acc.nodes.delete(nodeId);
    acc.nodes.set(`ransomware:${slug}`, {
      id: `ransomware:${slug}`,
      type: 'ransomware',
      label,
      data: { slug, mitreId: alias?.mitreId },
    });
  }
}

function expandRansomware(acc: GraphAccum, mitreId: string, _label: string): void {
  const nodeId = `ransomware:${mitreId}`;
  if (acc.visited.has(nodeId)) return;
  acc.visited.add(nodeId);

  // Techniques
  const techniques = techniquesForGroup(mitreId);
  for (const t of techniques) {
    const tid = `technique:${t.id}`;
    if (!acc.nodes.has(tid)) {
      addNode(acc, {
        id: tid,
        type: 'technique',
        label: `${t.id}: ${t.name}`,
        subtitle: t.tactic,
      });
    }
    addEdge(acc, nodeId, tid, 'uses');
    if (truncated(acc)) return;
  }

  // Find actor aliases that match this MITRE group
  const matchingActors = ACTOR_ALIASES.filter((a) => a.mitreId === mitreId);
  for (const a of matchingActors) {
    const aid = `actor:${a.slug}`;
    if (!acc.nodes.has(aid)) {
      addNode(acc, { id: aid, type: 'actor', label: a.canonical, data: { slug: a.slug } });
    }
    addEdge(acc, aid, nodeId, 'operates');
    if (truncated(acc)) return;
  }
}

function expandIoc(acc: GraphAccum, nodeId: string, type: GraphNodeType, value: string): void {
  if (acc.visited.has(nodeId)) return;
  acc.visited.add(nodeId);

  // For IPs: check if known C2 framework
  if (type === 'ip') {
    // The C2 tracker is async and fetches externally. For now, just label the node.
    // The frontend can trigger deeper expansion.
    addNode(acc, {
      id: nodeId,
      type: 'ip',
      label: value,
    });
  }
}

// ── Main builder ─────────────────────────────────────────────────────────

export async function buildGraph(query: string, depth: number = 1): Promise<GraphResponse> {
  const resolved = resolveSeed(query);
  if (!resolved) {
    return {
      nodes: [],
      edges: [],
      seed: query,
      seed_type: null,
      generated_at: new Date().toISOString(),
      depth,
      truncated: false,
      warning: `Could not resolve "${query}" to any known entity. Try a CVE ID, actor name, IP, domain, or hash.`,
    };
  }

  const acc: GraphAccum = {
    nodes: new Map(),
    edges: new Map(),
    visited: new Set(),
  };

  // Add seed node
  addNode(acc, {
    id: resolved.id,
    type: resolved.type,
    label: resolved.label,
    data: resolved.data,
  });

  // Expand based on seed type
  switch (resolved.type) {
    case 'cve':
      await expandCve(acc, resolved.id, depth);
      break;
    case 'actor': {
      const slug = (resolved.data as Record<string, unknown> | undefined)?.slug as string;
      expandActor(acc, slug, resolved.label, false);
      break;
    }
    case 'ransomware': {
      if (resolved.id.startsWith('actor:')) {
        const slug = (resolved.data as Record<string, unknown> | undefined)?.slug as string;
        const alias = ACTOR_ALIASES.find((a) => a.slug === slug);
        if (alias?.mitreId) {
          expandRansomware(acc, alias.mitreId, resolved.label);
        } else {
          expandActor(acc, slug, resolved.label, true);
        }
      } else if (resolved.id.startsWith('ransomware:')) {
        const mitreId = (resolved.data as Record<string, unknown> | undefined)?.mitreId as string;
        expandRansomware(acc, mitreId, resolved.label);
      }
      break;
    }
    case 'ip':
    case 'domain':
    case 'hash':
      expandIoc(acc, resolved.id, resolved.type, query);
      break;
  }

  const isTruncated = truncated(acc);

  return {
    nodes: [...acc.nodes.values()],
    edges: [...acc.edges.values()],
    seed: query,
    seed_type: resolved.type,
    generated_at: new Date().toISOString(),
    depth,
    truncated: isTruncated,
    ...(isTruncated
      ? { warning: 'Result was truncated — too many connections. Try a more specific query or depth=1.' }
      : {}),
  };
}
