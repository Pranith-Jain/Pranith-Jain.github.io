import type { Context } from 'hono';
import type { Env } from '../env';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Entity Relationship Graph — global topology of threat-intel entities.
 *
 * Builds a graph from existing data sources (threat-intel CVEs, actor
 * timeline, IOC correlation, sectors) and returns nodes + edges for
 * interactive visualization.
 *
 * GET /api/v1/threat-intel/entity-graph?limit=100
 */

const KV_KEY = 'entity-graph:v1';
const KV_TTL = 4 * 3600;
const CACHE_TTL = 1800;

export type EntityType = 'cve' | 'actor' | 'ioc' | 'sector' | 'technique';

export interface EntityNode {
  id: string;
  type: EntityType;
  label: string;
  subtitle?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

export interface EntityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface EntityGraphResponse {
  nodes: EntityNode[];
  edges: EntityEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    by_type: Record<EntityType, number>;
  };
  generated_at: string;
}

// Internal data shapes from existing endpoints
interface CveEntry {
  cveId: string;
  cvssV3Score: number | null;
  cvssV3Severity: string | null;
  vendor: string | null;
  product: string | null;
  inKev: boolean;
  description: string;
}

interface ActorEntry {
  slug: string;
  display_name: string;
  posts_in_window: number;
  raas?: boolean;
  mitre?: { id: string; name: string; url: string } | null;
}

interface IocEntry {
  slug: string;
  family: string;
  category: string;
  aliases: string[];
  indicatorCount: number;
  mitreTechniques: string[];
}

let edgeSeq = 0;
function eid(src: string, tgt: string, label: string): string {
  return `e-${++edgeSeq}-${src}--${label}-->${tgt}`;
}

function addNode(map: Map<string, EntityNode>, node: EntityNode): void {
  if (!map.has(node.id)) map.set(node.id, node);
}

function addEdge(map: Map<string, EntityEdge>, source: string, target: string, label: string): void {
  const id = eid(source, target, label);
  if (!map.has(id)) map.set(id, { id, source, target, label });
}

export async function entityGraphHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '150', 10) || 150, 500);

    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(`https://entity-graph.internal/v1?l=${limit}`);
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);

    const kv = c.env.KV_CACHE;

    // Try KV cache first
    if (kv) {
      try {
        const cached = await kv.get(KV_KEY, 'json');
        if (cached) {
          const resp = c.json(cached, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
          c.executionCtx.waitUntil(cache.put(cacheKey, resp.clone()));
          return resp;
        }
      } catch {
        /* miss */
      }
    }

    // Fetch data from existing internal endpoints via ASSETS binding
    const origin = new URL(c.req.url).origin;
    const [cvesRes, actorsRes, iocsRes] = await Promise.allSettled([
      fetchResilient(
        `${origin}/api/v1/threat-intel/cves?limit=${limit}`,
        { headers: { 'x-internal-agent': 'entity-graph' } },
        { attempts: 2, timeoutMs: 10_000 }
      ),
      fetchResilient(
        `${origin}/api/v1/threat-intel/actor-timeline`,
        { headers: { 'x-internal-agent': 'entity-graph' } },
        { attempts: 2, timeoutMs: 10_000 }
      ),
      fetchResilient(
        `${origin}/api/v1/threat-intel/iocs?limit=${limit}`,
        { headers: { 'x-internal-agent': 'entity-graph' } },
        { attempts: 2, timeoutMs: 10_000 }
      ),
    ]);

    const cves: CveEntry[] =
      cvesRes.status === 'fulfilled' && cvesRes.value.ok
        ? (((await cvesRes.value.json()) as { cves?: CveEntry[] }).cves ?? [])
        : [];
    const actorData =
      actorsRes.status === 'fulfilled' && actorsRes.value.ok
        ? ((await actorsRes.value.json()) as { groups?: ActorEntry[] })
        : { groups: [] };
    const actors: ActorEntry[] = actorData.groups ?? [];
    const iocData =
      iocsRes.status === 'fulfilled' && iocsRes.value.ok
        ? ((await iocsRes.value.json()) as { iocs?: IocEntry[] })
        : { iocs: [] };
    const iocs: IocEntry[] = iocData.iocs ?? [];

    const nodes = new Map<string, EntityNode>();
    const edges = new Map<string, EntityEdge>();

    // ── CVE nodes ──────────────────────────────────────────────────
    for (const cve of cves.slice(0, limit)) {
      addNode(nodes, {
        id: cve.cveId,
        type: 'cve',
        label: cve.cveId,
        subtitle: cve.vendor ? `${cve.vendor}${cve.product ? '/' + cve.product : ''}` : undefined,
        weight: cve.cvssV3Score ?? 0,
        data: { severity: cve.cvssV3Severity, kev: cve.inKev, vendor: cve.vendor, product: cve.product },
      });
    }

    // ── Actor nodes ────────────────────────────────────────────────
    for (const actor of actors.slice(0, 80)) {
      addNode(nodes, {
        id: `actor:${actor.slug}`,
        type: 'actor',
        label: actor.display_name,
        subtitle: actor.raas ? 'RaaS' : undefined,
        weight: actor.posts_in_window,
        data: { slug: actor.slug, raas: actor.raas, posts: actor.posts_in_window },
      });

      // Actor → Technique edges (from MITRE ref)
      if (actor.mitre) {
        const techId = `technique:${actor.mitre.id}`;
        addNode(nodes, {
          id: techId,
          type: 'technique',
          label: actor.mitre.name ?? actor.mitre.id,
          subtitle: actor.mitre.id,
        });
        addEdge(edges, `actor:${actor.slug}`, techId, 'uses');
      }
    }

    // ── IOC nodes + edges ──────────────────────────────────────────
    for (const ioc of iocs.slice(0, limit)) {
      const nodeId = `ioc:${ioc.slug}`;
      addNode(nodes, {
        id: nodeId,
        type: 'ioc',
        label: ioc.family,
        subtitle: ioc.category,
        weight: ioc.indicatorCount,
        data: { category: ioc.category, aliases: ioc.aliases, indicators: ioc.indicatorCount },
      });

      // IOC → Technique edges
      for (const tech of ioc.mitreTechniques.slice(0, 5)) {
        const techId = `technique:${tech}`;
        if (!nodes.has(techId)) {
          addNode(nodes, { id: techId, type: 'technique', label: tech });
        }
        addEdge(edges, nodeId, techId, 'uses');
      }
    }

    // ── Cross-entity edges ─────────────────────────────────────────
    // CVE → Actor: match CVE vendor/product against actor names
    for (const cve of cves.slice(0, limit)) {
      const cveLower = `${cve.vendor ?? ''} ${cve.product ?? ''}`.toLowerCase();
      for (const actor of actors.slice(0, 80)) {
        const actorLower = actor.display_name.toLowerCase();
        if (cveLower && actorLower && (cveLower.includes(actorLower) || actorLower.includes(cveLower))) {
          addEdge(edges, cve.cveId, `actor:${actor.slug}`, 'exploited_by');
        }
      }
    }

    // IOC → Actor: match IOC family against actor names/aliases
    for (const ioc of iocs.slice(0, limit)) {
      const iocLower = ioc.family.toLowerCase();
      const allNames = [iocLower, ...ioc.aliases.map((a) => a.toLowerCase())];
      for (const actor of actors.slice(0, 80)) {
        const actorLower = actor.display_name.toLowerCase();
        if (allNames.some((n) => n.includes(actorLower) || actorLower.includes(n))) {
          addEdge(edges, `ioc:${ioc.slug}`, `actor:${actor.slug}`, 'attributed_to');
        }
      }
    }

    // CVE → Sector: use KEV status + vendor as sector proxy
    const sectorMap: Record<string, string> = {
      microsoft: 'Technology',
      cisco: 'Technology',
      adobe: 'Technology',
      'palo alto': 'Technology',
      fortinet: 'Technology',
      checkpoint: 'Technology',
      oracle: 'Technology',
      vmware: 'Technology',
      healthcare: 'Healthcare',
      hospital: 'Healthcare',
      financial: 'Financial',
      bank: 'Financial',
      government: 'Government',
      energy: 'Energy',
      utility: 'Energy',
      manufacturing: 'Manufacturing',
    };
    for (const cve of cves.slice(0, limit)) {
      const vendor = (cve.vendor ?? '').toLowerCase();
      for (const [keyword, sector] of Object.entries(sectorMap)) {
        if (vendor.includes(keyword)) {
          const sectorId = `sector:${sector}`;
          if (!nodes.has(sectorId)) {
            addNode(nodes, { id: sectorId, type: 'sector', label: sector });
          }
          addEdge(edges, cve.cveId, sectorId, 'affects');
        }
      }
    }

    // Limit total nodes/edges
    const nodeList = [...nodes.values()].slice(0, limit * 2);
    const nodeIds = new Set(nodeList.map((n) => n.id));
    const edgeList = [...edges.values()]
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .slice(0, limit * 4);

    // Stats
    const byType: Record<EntityType, number> = { cve: 0, actor: 0, ioc: 0, sector: 0, technique: 0 };
    for (const n of nodeList) byType[n.type]++;

    const body: EntityGraphResponse = {
      nodes: nodeList,
      edges: edgeList,
      stats: { total_nodes: nodeList.length, total_edges: edgeList.length, by_type: byType },
      generated_at: new Date().toISOString(),
    };

    const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    if (kv) {
      c.executionCtx.waitUntil(
        (async () => {
          if (await shouldWriteLastGood('entity-graph')) {
            await kv.put(KV_KEY, JSON.stringify(body), { expirationTtl: KV_TTL });
          }
        })()
      );
    }
    return response;
  } catch (err) {
    console.error('entityGraphHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'entity graph failed' }, 500);
  }
}
