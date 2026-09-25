/**
 * FlowViz client exporters — port of
 * davidljohnson/flowviz src/features/flow-export/services/ (MIT).
 *
 * Adapted: `reactflow` types → `@xyflow/react` (v12, already the platform
 * standard), `uuid` → `crypto.randomUUID` (no new dep).
 *
 * STIX mapping (same as upstream stixBundleExporter.ts):
 *  action → attack-pattern (+MITRE refs, kill-chain, x_source_excerpt)
 *  tool → tool | malware → malware (is_family:true)
 *  infrastructure → infrastructure | vulnerability → vulnerability (+CVE refs)
 *  asset → identity | url → indicator | AND/OR_operator → grouping
 *  edges → relationship (Uses/Targets/Communicates with/Connects to/
 *  Affects/Leads to, else related-to)
 *
 * .afb mapping: compact Attack Flow Builder export (schema attack_flow_v2)
 * with per-node blocks, 12 anchors/node, dynamic_line edges, 5px-snapped
 * layout + averaged camera. Upstream's full anchor/latch wiring is
 * simplified — Builder opens the file; pixel-perfect latch routing is
 * future work.
 */
import type { Node, Edge } from '@xyflow/react';

export interface FlowvizStixObject {
  type: string;
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface FlowvizStixBundle {
  type: 'bundle';
  id: string;
  objects?: FlowvizStixObject[];
}

interface Nodedata {
  type?: string;
  name?: string;
  description?: string;
  technique_id?: string;
  tactic_id?: string;
  tactic_name?: string;
  command_line?: string;
  role?: string;
  value?: string;
  cve_id?: string;
  source_excerpt?: string;
  source_url?: string;
  confidence?: string;
  [key: string]: unknown;
}

function ndata(n: Node): Nodedata {
  return ((n.data ?? {}) as Nodedata);
}

function stixId(type: string): string {
  return `${type}--${crypto.randomUUID()}`;
}

function mitreRefs(d: Nodedata): Array<Record<string, string>> {
  const refs: Array<Record<string, string>> = [];
  if (d.technique_id) {
    refs.push({
      source_name: 'mitre-attack',
      external_id: d.technique_id,
      url: `https://attack.mitre.org/techniques/${d.technique_id.replace('.', '/')}`,
    });
  }
  if (d.tactic_id) {
    refs.push({ source_name: 'mitre-attack', external_id: d.tactic_id, url: `https://attack.mitre.org/tactics/${d.tactic_id}/` });
  }
  return refs;
}

function killChain(d: Nodedata): Array<Record<string, string>> {
  if (!d.tactic_name) return [];
  return [{ kill_chain_name: 'mitre-attack', phase_name: d.tactic_name.toLowerCase().replace(/ /g, '-') }];
}

const EDGE_REL_MAP: Record<string, string> = {
  Uses: 'uses',
  Targets: 'targets',
  'Communicates with': 'communicates-with',
  'Connects to': 'connects-to',
  Affects: 'affects',
  'Leads to': 'related-to',
};

function convertNode(node: Node, now: string): FlowvizStixObject | null {
  const d = ndata(node);
  const t = d.type || node.type || '';
  const base = { spec_version: '2.1' as const, created: now, modified: now };
  switch (t) {
    case 'action':
      return {
        ...base, type: 'attack-pattern', id: stixId('attack-pattern'),
        name: d.name || 'Unknown Technique', description: d.description,
        external_references: mitreRefs(d), kill_chain_phases: killChain(d),
        x_mitre_technique_id: d.technique_id, x_mitre_tactic: d.tactic_name,
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    case 'tool':
      return {
        ...base, type: 'tool', id: stixId('tool'),
        name: d.name || 'Unknown Tool', description: d.description, tool_types: ['unknown'],
        x_command_line: d.command_line, x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    case 'malware':
      return {
        ...base, type: 'malware', id: stixId('malware'),
        name: d.name || 'Unknown Malware', description: d.description, malware_types: ['unknown'],
        is_family: true, x_command_line: d.command_line,
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    case 'infrastructure':
      return {
        ...base, type: 'infrastructure', id: stixId('infrastructure'),
        name: d.name || 'Unknown Infrastructure', description: d.description,
        infrastructure_types: ['unknown'],
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    case 'vulnerability': {
      const cve = d.cve_id || (/CVE-\d{4}-\d{4,7}/i.exec(d.name ?? '')?.[0] ?? '');
      return {
        ...base, type: 'vulnerability', id: stixId('vulnerability'),
        name: d.name || cve || 'Unknown Vulnerability', description: d.description,
        external_references: cve ? [{ source_name: 'cve', external_id: cve.toUpperCase() }] : [],
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    }
    case 'asset':
      return {
        ...base, type: 'identity', id: stixId('identity'),
        name: d.name || 'Unknown Asset', description: d.description,
        identity_class: 'system', x_asset_role: d.role,
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    case 'url': {
      const value = d.value || d.name || '';
      return {
        ...base, type: 'indicator', id: stixId('indicator'),
        name: d.name || value || 'Unknown URL', description: d.description,
        pattern: value ? `[url:value='${value}']` : '', pattern_type: 'stix',
        valid_from: now, labels: ['malicious-activity'],
        x_source_excerpt: d.source_excerpt, x_confidence: d.confidence,
      };
    }
    case 'AND_operator':
    case 'OR_operator':
      return {
        ...base, type: 'grouping', id: stixId('grouping'),
        name: d.name || (t === 'AND_operator' ? 'AND' : 'OR'),
        description: d.description, context: t === 'AND_operator' ? 'AND' : 'OR',
        object_refs: [], // filled in second pass
      };
    default:
      return null;
  }
}

/** Convert FlowViz canvas nodes/edges to a STIX 2.1 bundle. */
export function exportFlowvizStix(nodes: Node[], edges: Edge[]): FlowvizStixBundle {
  const now = new Date().toISOString();
  const stixByNode = new Map<string, FlowvizStixObject>();
  for (const n of nodes) {
    const o = convertNode(n, now);
    if (o) stixByNode.set(n.id, o);
  }
  // Second pass: grouping refs = incoming edge sources (inputs being combined).
  for (const [nodeId, o] of stixByNode) {
    if (o.type !== 'grouping') continue;
    const inputs = edges.filter((e) => e.target === nodeId).map((e) => e.source);
    const refs = inputs.map((id) => stixByNode.get(id)?.id).filter((x): x is string => !!x);
    const fallback = refs.length === 0
      ? edges.filter((e) => e.source === nodeId).map((e) => e.target).map((id) => stixByNode.get(id)?.id).filter((x): x is string => !!x)
      : refs;
    if (fallback.length === 0) {
      stixByNode.delete(nodeId);
      continue;
    }
    o.object_refs = fallback;
  }
  const rels: FlowvizStixObject[] = [];
  for (const e of edges) {
    const s = stixByNode.get(e.source)?.id;
    const t = stixByNode.get(e.target)?.id;
    if (!s || !t) continue;
    rels.push({
      type: 'relationship', spec_version: '2.1', id: stixId('relationship'),
      created: now, modified: now,
      relationship_type: EDGE_REL_MAP[e.label as string] ?? 'related-to',
      source_ref: s, target_ref: t,
      description: typeof e.label === 'string' ? e.label : undefined,
    });
  }
  const objects = [...stixByNode.values(), ...rels];
  return { type: 'bundle', id: `bundle--${crypto.randomUUID()}`, ...(objects.length > 0 ? { objects } : {}) };
}

// ─── .afb (Attack Flow Builder) compact export ───────────────────────────

export interface AfbExport {
  schema: string;
  theme: string;
  objects: Array<Record<string, unknown>>;
  layout: Record<string, [number, number]>;
  camera: { x: number; y: number; k: number };
}

const AFB_BLOCK: Record<string, string> = {
  action: 'attack_action',
  tool: 'attack_tool',
  malware: 'attack_malware',
  asset: 'attack_asset',
  infrastructure: 'attack_infrastructure',
  url: 'attack_url',
  vulnerability: 'attack_vulnerability',
  AND_operator: 'and_operator',
  OR_operator: 'or_operator',
};

/** Compact .afb export: flow container + per-node blocks + dynamic lines. */
export function exportFlowvizAfb(nodes: Node[], edges: Edge[], name = 'FlowViz export'): AfbExport {
  const objects: Array<Record<string, unknown>> = [];
  const layout: Record<string, [number, number]> = {};
  const idMap = new Map<string, string>();
  for (const n of nodes) idMap.set(n.id, crypto.randomUUID());
  const flowId = crypto.randomUUID();
  const avgX = nodes.length ? nodes.reduce((s, n) => s + (n.position?.x ?? 0), 0) / nodes.length : 0;
  const avgY = nodes.length ? nodes.reduce((s, n) => s + (n.position?.y ?? 0), 0) / nodes.length : 0;
  const d = ndata({} as Node);
  void d;
  for (const n of nodes) {
    const nd = ndata(n);
    const block = AFB_BLOCK[nd.type || n.type || ''] ?? 'attack_action';
    const inst = idMap.get(n.id)!;
    const anchors: Record<string, string> = {};
    for (let i = 0; i < 12; i++) anchors[`anchor_${i}`] = crypto.randomUUID();
    objects.push({
      id: block, instance: inst,
      properties: [
        ['name', nd.name ?? n.id],
        ['description', nd.description ?? ''],
        ...(nd.technique_id ? [['technique_id', nd.technique_id]] : []),
        ...(nd.tactic_id ? [['tactic_id', nd.tactic_id]] : []),
        ...(nd.tactic_name ? [['tactic_name', nd.tactic_name]] : []),
      ],
      anchors, objects: [], latches: [],
    });
    layout[inst] = [Math.round((n.position?.x ?? 0) / 5) * 5, Math.round((n.position?.y ?? 0) / 5) * 5];
  }
  const children: string[] = [...idMap.values()];
  for (const e of edges) {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t) continue;
    const line = crypto.randomUUID();
    objects.push({ id: 'dynamic_line', instance: line, source: s, target: t, properties: [['label', e.label ?? '']] });
    children.push(line);
  }
  objects.unshift({ id: 'flow', instance: flowId, properties: [['name', name]], objects: children });
  return { schema: 'attack_flow_v2', theme: 'dark_theme', objects, layout, camera: { x: Math.round(avgX), y: Math.round(avgY), k: 1 } };
}

// ─── Saved flows (localStorage library — same contract as upstream) ─────

export interface SavedFlow {
  id: string;
  title: string;
  nodes: Node[];
  edges: Edge[];
  sourceUrl?: string;
  sourceText?: string;
  createdAt: string;
  updatedAt: string;
}

const LS_KEY = 'flowviz_saved_flows';

export function listSavedFlows(): SavedFlow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedFlow[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveFlow(flow: Omit<SavedFlow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): SavedFlow {
  const all = listSavedFlows();
  const now = new Date().toISOString();
  if (flow.id) {
    const i = all.findIndex((f) => f.id === flow.id);
    if (i >= 0) {
      all[i] = { ...all[i]!, ...flow, id: flow.id, updatedAt: now } as SavedFlow;
      localStorage.setItem(LS_KEY, JSON.stringify(all));
      return all[i]!;
    }
  }
  const fresh: SavedFlow = { ...flow, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  localStorage.setItem(LS_KEY, JSON.stringify([fresh, ...all]));
  return fresh;
}

export function deleteSavedFlow(id: string): void {
  localStorage.setItem(LS_KEY, JSON.stringify(listSavedFlows().filter((f) => f.id !== id)));
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
