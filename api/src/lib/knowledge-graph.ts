/**
 * Knowledge Graph builder — constructs a graph from Threat Intel data
 * (actors, CVEs, TTPs, campaigns) for visualization in ReactFlow.
 */

type GraphNodeType =
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

interface GraphNodeData {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
}

interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface GraphResponse {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  seed: string;
  seed_type: GraphNodeType | null;
  generated_at: string;
  depth: number;
  truncated: boolean;
}

const ACTOR_TTP_MAP: Record<string, string[]> = {
  apt28: ['T1566', 'T1059', 'T1053', 'T1071', 'T1583'],
  apt29: ['T1195', 'T1199', 'T1059', 'T1078', 'T1557'],
  lazarus: ['T1566', 'T1059', 'T1071', 'T1486', 'T1027'],
  apt41: ['T1190', 'T1059', 'T1053', 'T1560', 'T1071'],
  lockbit: ['T1486', 'T1490', 'T1059', 'T1078', 'T1027'],
  blackcat: ['T1486', 'T1059', 'T1078', 'T1560', 'T1027'],
  cl0p: ['T1486', 'T1195', 'T1059', 'T1078'],
  'volt-typhoon': ['T1078', 'T1059', 'T1053', 'T1027', 'T1090'],
};

const CVE_ACTOR_MAP: Record<string, string[]> = {
  'CVE-2023-34362': ['cl0p'],
  'CVE-2024-1709': ['lockbit', 'black-basta'],
  'CVE-2024-37085': ['akira'],
  'CVE-2023-4966': ['lockbit', 'black-basta'],
  'CVE-2024-23113': ['lazarus'],
};

const TECHNIQUE_NAMES: Record<string, string> = {
  T1566: 'Phishing',
  T1059: 'Command Execution',
  T1053: 'Scheduled Tasks',
  T1071: 'Application Layer Protocol',
  T1078: 'Valid Accounts',
  T1486: 'Data Encrypted for Impact',
  T1490: 'Inhibit System Recovery',
  T1195: 'Supply Chain Compromise',
  T1199: 'Trusted Relationship',
  T1583: 'Acquire Infrastructure',
  T1557: 'Adversary-in-the-Middle',
  T1560: 'Archive Collected Data',
  T1027: 'Obfuscated Files',
  T1090: 'Proxy',
  T1190: 'Exploit Public-Facing App',
};

function addNode(
  nodes: Map<string, GraphNodeData>,
  id: string,
  type: GraphNodeType,
  label: string,
  subtitle?: string
): void {
  if (!nodes.has(id)) nodes.set(id, { id, type, label, subtitle });
}

function addEdge(edges: GraphEdgeData[], id: string, source: string, target: string, label: string): void {
  if (!edges.some((e) => e.source === source && e.target === target && e.label === label)) {
    edges.push({ id, source, target, label });
  }
}

export function buildKnowledgeGraph(seed?: string, maxNodes = 80): GraphResponse {
  const nodes = new Map<string, GraphNodeData>();
  const edges: GraphEdgeData[] = [];

  for (const [actor, ttps] of Object.entries(ACTOR_TTP_MAP)) {
    addNode(nodes, actor, 'actor', actor.toUpperCase().replace('-', ' '));
    for (const ttp of ttps) {
      addNode(nodes, ttp, 'technique', TECHNIQUE_NAMES[ttp] ?? ttp, ttp);
      addEdge(edges, `${actor}-${ttp}`, actor, ttp, 'uses');
    }
  }

  for (const [cve, actors] of Object.entries(CVE_ACTOR_MAP)) {
    addNode(nodes, cve, 'cve', cve);
    for (const actor of actors) {
      addNode(nodes, actor, 'actor', actor.toUpperCase().replace('-', ' '));
      addEdge(edges, `${cve}-${actor}`, actor, cve, 'exploits');
    }
  }

  const campaigns = ['double-extortion', 'supply-chain-attacks', 'credential-stuffing'];
  for (const campaign of campaigns) {
    addNode(
      nodes,
      campaign,
      'campaign',
      campaign.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }
  addEdge(edges, 'de-lockbit', 'double-extortion', 'lockbit', 'employs');
  addEdge(edges, 'de-blackcat', 'double-extortion', 'blackcat', 'employs');
  addEdge(edges, 'sc-apt29', 'supply-chain-attacks', 'apt29', 'employs');
  addEdge(edges, 'sc-lazarus', 'supply-chain-attacks', 'lazarus', 'employs');

  const nodeList = Array.from(nodes.values());
  const seedLower = seed?.toLowerCase();
  const seedType: GraphNodeType | null = seedLower
    ? (nodeList.find((n) => n.id === seedLower || n.label.toLowerCase().includes(seedLower))?.type ?? null)
    : null;

  if (nodeList.length > maxNodes) nodeList.length = maxNodes;

  return {
    nodes: nodeList,
    edges: edges.filter((e) => nodeList.some((n) => n.id === e.source) && nodeList.some((n) => n.id === e.target)),
    seed: seed ?? 'all',
    seed_type: seedType,
    generated_at: new Date().toISOString(),
    depth: 2,
    truncated: nodeList.length >= maxNodes,
  };
}
