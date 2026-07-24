import type { Hono } from 'hono';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { RANSOMWARE_SLUGS } from '../lib/ransomware-slugs';
import { mitreGroupRef } from '../lib/ransomware-mitre-groups';

/**
 * Entity Relationship Graph — global topology of threat-intel entities.
 *
 * Builds a graph from CISA KEV data, actor aliases, and sector mappings.
 * Returns nodes + edges for interactive visualization.
 *
 * GET /api/v1/threat-intel/entity-graph?limit=150
 */

const KV_KEY = 'entity-graph:v2';
const KV_TTL = 4 * 3600;
const CACHE_TTL = 1800;

type EntityType = 'cve' | 'actor' | 'sector' | 'technique';

interface EntityNode {
  id: string;
  type: EntityType;
  label: string;
  subtitle?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

interface EntityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface EntityGraphResponse {
  nodes: EntityNode[];
  edges: EntityEdge[];
  stats: { total_nodes: number; total_edges: number; by_type: Record<EntityType, number> };
  generated_at: string;
}

interface KevEntry {
  cveId: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string;
  shortDescription: string;
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

async function loadTiMod() {
  return await import('../lib/threat-intel-manifest');
}

export function registerEntityGraphRoute(router: Hono<any>): void {
  router.get('/threat-intel/entity-graph', async (c: any) => {
    try {
      const limit = Math.min(parseInt(c.req.query('limit') ?? '150', 10) || 150, 500);

      const cache = (caches as unknown as { default: Cache }).default;
      const cacheKey = new Request(`https://entity-graph.internal/v2?l=${limit}`);
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, cached);

      const kv = c.env.KV_CACHE;

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

      // Load KEV data from manifest
      const mod = await loadTiMod();
      const _idx = await mod.loadTiIndex(c.env.ASSETS);
      const kev = await mod.loadKevSnapshot(c.env.ASSETS);

      const nodes = new Map<string, EntityNode>();
      const edges = new Map<string, EntityEdge>();

      // ── CVE nodes from KEV ────────────────────────────────────────
      const sectorMap: Record<string, string> = {
        microsoft: 'Technology',
        cisco: 'Technology',
        adobe: 'Technology',
        'palo alto': 'Technology',
        fortinet: 'Technology',
        oracle: 'Technology',
        vmware: 'Technology',
        google: 'Technology',
        apple: 'Technology',
        wordpress: 'Technology',
        linux: 'Technology',
        apache: 'Technology',
        openSSL: 'Technology',
        openssl: 'Technology',
        healthcare: 'Healthcare',
        hospital: 'Healthcare',
        financial: 'Financial',
        bank: 'Financial',
        government: 'Government',
        energy: 'Energy',
        utility: 'Energy',
        manufacturing: 'Manufacturing',
      };

      for (const entry of kev.slice(0, limit)) {
        const kevEntry = entry as KevEntry;
        addNode(nodes, {
          id: kevEntry.cveId,
          type: 'cve',
          label: kevEntry.cveId,
          subtitle: `${kevEntry.vendor}/${kevEntry.product}`,
          weight: 1,
          data: { vendor: kevEntry.vendor, product: kevEntry.product, dateAdded: kevEntry.dateAdded },
        });

        // CVE → Sector edges
        const vendor = kevEntry.vendor.toLowerCase();
        for (const [keyword, sector] of Object.entries(sectorMap)) {
          if (vendor.includes(keyword)) {
            const sectorId = `sector:${sector}`;
            addNode(nodes, { id: sectorId, type: 'sector', label: sector });
            addEdge(edges, kevEntry.cveId, sectorId, 'affects');
            break;
          }
        }
      }

      // ── Actor nodes ───────────────────────────────────────────────
      const actorLimit = Math.min(limit, 60);
      for (const alias of ACTOR_ALIASES.slice(0, actorLimit)) {
        const isRans = RANSOMWARE_SLUGS.has(alias.slug);
        const nodeId = `actor:${alias.slug}`;
        addNode(nodes, {
          id: nodeId,
          type: 'actor',
          label: alias.canonical,
          subtitle: isRans ? 'RaaS' : undefined,
          data: { slug: alias.slug, mitreId: alias.mitreId, aliases: alias.aliases },
        });

        // Actor → Technique edges
        if (alias.mitreId) {
          const ref = mitreGroupRef(alias.mitreId);
          const techLabel = ref?.name ?? alias.mitreId;
          const techId = `technique:${alias.mitreId}`;
          addNode(nodes, { id: techId, type: 'technique', label: techLabel, subtitle: alias.mitreId });
          addEdge(edges, nodeId, techId, 'uses');
        }
      }

      // ── Cross-entity edges: CVE → Actor via vendor/product match ──
      for (const entry of kev.slice(0, limit)) {
        const kevEntry = entry as KevEntry;
        const vendorProduct = `${kevEntry.vendor} ${kevEntry.product}`.toLowerCase();
        for (const alias of ACTOR_ALIASES.slice(0, 60)) {
          const actorName = alias.canonical.toLowerCase();
          if (vendorProduct.length > 3 && actorName.length > 3 && vendorProduct.includes(actorName)) {
            addEdge(edges, kevEntry.cveId, `actor:${alias.slug}`, 'exploited_by');
          }
        }
      }

      // Limit and assemble
      const nodeList = [...nodes.values()].slice(0, limit * 2);
      const nodeIds = new Set(nodeList.map((n) => n.id));
      const edgeList = [...edges.values()]
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .slice(0, limit * 4);

      const byType: Record<EntityType, number> = { cve: 0, actor: 0, sector: 0, technique: 0 };
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
  });
}
