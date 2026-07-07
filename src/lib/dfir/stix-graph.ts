/**
 * Convert a STIX 2.1 bundle into react-flow nodes and edges.
 * Pure client-side. Supports the major SDOs plus `relationship` and `sighting` SROs.
 */

export type StixObjectType =
  | 'threat-actor'
  | 'intrusion-set'
  | 'malware'
  | 'attack-pattern'
  | 'indicator'
  | 'campaign'
  | 'vulnerability'
  | 'tool'
  | 'identity'
  | 'course-of-action'
  | 'report'
  | 'observed-data'
  | 'malware-analysis'
  | 'infrastructure'
  | 'location'
  | 'note'
  | 'opinion'
  | 'relationship'
  | 'sighting'
  | 'unknown';

export interface StixObject {
  id: string;
  type: string;
  name?: string;
  description?: string;
  labels?: string[];
  created?: string;
  modified?: string;
  pattern?: string;
  value?: string;
  // SRO fields
  source_ref?: string;
  target_ref?: string;
  relationship_type?: string;
  sighting_of_ref?: string;
  where_sighted_refs?: string[];
  observed_data_refs?: string[];
  [key: string]: unknown;
}

export interface StixBundle {
  type?: string;
  id?: string;
  spec_version?: string;
  objects: StixObject[];
}

export interface GraphNode {
  id: string;
  type: 'stixNode';
  position: { x: number; y: number };
  data: {
    id: string;
    label: string;
    stixType: StixObjectType;
    raw: StixObject;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

const SDO_TYPES: StixObjectType[] = [
  'threat-actor',
  'intrusion-set',
  'campaign',
  'malware',
  'attack-pattern',
  'tool',
  'indicator',
  'vulnerability',
  'identity',
  'course-of-action',
  'report',
  'observed-data',
  'malware-analysis',
  'infrastructure',
  'location',
  'note',
  'opinion',
];

export function classifyType(type: string): StixObjectType {
  return (
    SDO_TYPES.includes(type as StixObjectType)
      ? type
      : type === 'relationship' || type === 'sighting'
        ? type
        : 'unknown'
  ) as StixObjectType;
}

export function bundleStats(bundle: StixBundle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const obj of bundle.objects ?? []) {
    out[obj.type] = (out[obj.type] ?? 0) + 1;
  }
  return out;
}

/**
 * Lay out nodes in concentric clusters by SDO type. Uses a simple deterministic
 * radial layout so identical bundles always render the same way.
 */
export function bundleToGraph(bundle: StixBundle, filter?: Set<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const objs = (bundle.objects ?? []).filter((o) => o.id);
  const sdoObjs = objs.filter((o) => o.type !== 'relationship' && o.type !== 'sighting');
  const includeId = (id: string): boolean => {
    if (!filter || filter.size === 0) return true;
    const obj = objs.find((o) => o.id === id);
    return !!obj && filter.has(obj.type);
  };

  // Group SDOs by type for laying out in rings.
  const byType = new Map<string, StixObject[]>();
  for (const obj of sdoObjs) {
    if (filter && filter.size > 0 && !filter.has(obj.type)) continue;
    if (!byType.has(obj.type)) byType.set(obj.type, []);
    byType.get(obj.type)!.push(obj);
  }
  const types = [...byType.keys()].sort();

  // Each type cluster sits on its own concentric ring.
  const nodes: GraphNode[] = [];
  const ringSpacing = 280;
  types.forEach((t, i) => {
    const ring = byType.get(t)!;
    const r = ringSpacing * (i + 1);
    const angleStep = (2 * Math.PI) / Math.max(ring.length, 1);
    ring.forEach((obj, j) => {
      const angle = angleStep * j + (i * Math.PI) / 6; // offset each ring
      nodes.push({
        id: obj.id,
        type: 'stixNode',
        position: { x: Math.round(Math.cos(angle) * r), y: Math.round(Math.sin(angle) * r) },
        data: {
          id: obj.id,
          label: obj.name ?? obj.value ?? obj.id.split('--')[0]!,
          stixType: classifyType(obj.type),
          raw: obj,
        },
      });
    });
  });

  // Edges from relationship + sighting SROs.
  const edges: GraphEdge[] = [];
  for (const obj of objs) {
    if (obj.type === 'relationship' && obj.source_ref && obj.target_ref) {
      if (!includeId(obj.source_ref) || !includeId(obj.target_ref)) continue;
      edges.push({
        id: obj.id,
        source: obj.source_ref,
        target: obj.target_ref,
        label: obj.relationship_type,
      });
    } else if (obj.type === 'sighting' && obj.sighting_of_ref) {
      const targets = obj.where_sighted_refs ?? [];
      for (const t of targets) {
        if (!includeId(obj.sighting_of_ref) || !includeId(t)) continue;
        edges.push({
          id: `${obj.id}::${t}`,
          source: t,
          target: obj.sighting_of_ref,
          label: 'sighted',
          animated: true,
        });
      }
    }
  }

  return { nodes, edges };
}

export const STIX_TYPE_COLOR: Record<StixObjectType, string> = {
  'threat-actor': '#dc2626',
  'intrusion-set': '#dc2626',
  malware: '#ea580c',
  'attack-pattern': '#2563eb',
  indicator: '#0891b2',
  campaign: '#9333ea',
  vulnerability: '#ca8a04',
  tool: '#475569',
  identity: '#16a34a',
  'course-of-action': '#059669',
  report: '#475569',
  'observed-data': '#0891b2',
  'malware-analysis': '#ea580c',
  infrastructure: '#475569',
  location: '#16a34a',
  note: '#64748b',
  opinion: '#64748b',
  relationship: '#94a3b8',
  sighting: '#94a3b8',
  unknown: '#94a3b8',
};
