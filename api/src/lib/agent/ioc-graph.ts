/**
 * IOC relationship graph — extracts and visualizes connections between
 * IOCs, actors, CVEs, and techniques from investigation data.
 * Returns a graph structure for frontend rendering.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: 'ioc' | 'actor' | 'cve' | 'technique' | 'malware' | 'campaign';
  severity?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Extract a relationship graph from investigation steps.
 * Builds nodes for IOCs, actors, CVEs, techniques and edges for relationships.
 */
export function extractGraphFromSteps(
  steps: Array<{ results: Array<{ tool: string; data?: unknown; status: string }> }>
): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  function addNode(id: string, type: GraphNode['type'], label: string, severity?: string) {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, type, severity });
    }
  }

  function addEdge(
    source: string,
    target: string,
    relationship: string,
    confidence: GraphEdge['confidence'] = 'medium'
  ) {
    const key = `${source}->${target}:${relationship}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ source, target, relationship, confidence });
    }
  }

  for (const step of steps) {
    for (const result of step.results) {
      if (result.status !== 'ok' || !result.data) continue;
      const data = result.data as Record<string, unknown>;

      // Extract IOCs from reputation/enrichment results
      if (result.tool === 'check_ioc' || result.tool === 'enrich_ioc_deep') {
        const indicator = (data.indicator ?? data.query ?? '') as string;
        const verdict = (data.verdict ?? data.risk_level ?? '') as string;
        if (indicator) {
          addNode(indicator, 'ioc', indicator, verdict);
        }
        // Extract related domains/IPs
        const relatedDomains = (data.related_domains ?? data.co_hosted ?? []) as string[];
        for (const dom of relatedDomains.slice(0, 5)) {
          addNode(dom, 'ioc', dom);
          if (indicator) addEdge(indicator, dom, 'resolves_to');
        }
      }

      // Extract actors
      if (result.tool === 'enrich_actor' || result.tool === 'get_ransomware_group_profile') {
        const name = (data.name ?? data.actor_name ?? '') as string;
        if (name) {
          addNode(`actor:${name}`, 'actor', name);
          const aliases = (data.aliases ?? []) as string[];
          for (const alias of aliases.slice(0, 5)) {
            addNode(`actor:${alias}`, 'actor', alias);
            addEdge(`actor:${name}`, `actor:${alias}`, 'alias', 'high');
          }
          const malware = (data.malware ?? data.malware_families ?? []) as string[];
          for (const m of malware.slice(0, 5)) {
            addNode(`malware:${m}`, 'malware', m);
            addEdge(`actor:${name}`, `malware:${m}`, 'uses');
          }
        }
      }

      // Extract CVEs
      if (result.tool === 'lookup_cve') {
        const cveId = (data.cve_id ?? data.cve ?? '') as string;
        if (cveId) {
          addNode(cveId, 'cve', cveId, data.severity as string);
          const products = (data.affected_products ?? []) as string[];
          for (const p of products.slice(0, 3)) {
            addNode(`product:${p}`, 'ioc', p);
            addEdge(cveId, `product:${p}`, 'affects');
          }
        }
      }

      // Extract MITRE techniques
      if (data.techniques || data.mitre_techniques) {
        const techniques = (data.techniques ?? data.mitre_techniques ?? []) as Array<
          { id?: string; name?: string } | string
        >;
        for (const t of techniques.slice(0, 10)) {
          const id = typeof t === 'string' ? t : (t.id ?? '');
          const name = typeof t === 'string' ? t : (t.name ?? t.id ?? '');
          if (id) {
            addNode(`technique:${id}`, 'technique', name || id);
          }
        }
      }
    }
  }

  // Build edges between actors and IOCs found in the same investigation
  const actorNodes = [...nodes.values()].filter((n) => n.type === 'actor');
  const iocNodes = [...nodes.values()].filter((n) => n.type === 'ioc');
  if (actorNodes.length > 0 && iocNodes.length > 0) {
    // Connect first actor to first few IOCs as 'associated_with'
    for (const ioc of iocNodes.slice(0, 5)) {
      addEdge(actorNodes[0]!.id, ioc.id, 'associated_with', 'low');
    }
  }

  return { nodes: [...nodes.values()], edges };
}
