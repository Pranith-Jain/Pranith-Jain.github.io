export interface CloakIndex {
  source: string;
  sourceUrl: string;
  license: string;
  author: string;
  replicatedAt: string;
  counts: { tactics: number; techniques: number; subtechniques: number; procedures: number };
  tacticIndex: Array<{
    id: number;
    name: string;
    techniqueCount: number;
    subtechniqueCount: number;
    procedureCount: number;
  }>;
}

export interface CloakTacticBody {
  id: number;
  name: string;
  description: string;
  techniqueCount: number;
  subtechniqueCount: number;
  procedureCount: number;
  techniques: Array<{
    id: number;
    name: string;
    type: string;
    subCount: number;
    procCount: number;
    subIndex: Array<{ id: number; name: string; type: string }>;
  }>;
}

export interface CloakTechniqueBody {
  id: number;
  name: string;
  description: string;
  type: string;
  tacticId: number;
  tacticName: string;
  subtechniques: Array<{
    id: number;
    name: string;
    description: string;
    type: string;
    procedures: Array<{ id: string; name: string; description: string }>;
  }>;
  procedures: Array<{ id: string; name: string; description: string }>;
}

const PREFIX = '/data/cloak';
const cache = new Map<string, unknown>();

function host(url: string) {
  return new URL(url, 'https://cloakeyframe').host;
}

async function fetchJSON<T>(path: string): Promise<T | null> {
  const cached = cache.get(path) as T | undefined;
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`https://${host(PREFIX)}${path}`, { headers: { host: host(PREFIX) } });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    cache.set(path, data);
    return data;
  } catch {
    return null;
  }
}

export async function getCloakIndex(): Promise<CloakIndex | null> {
  return fetchJSON<CloakIndex>(`${PREFIX}/index.json`);
}

export async function getCloakTactic(id: number): Promise<CloakTacticBody | null> {
  return fetchJSON<CloakTacticBody>(`${PREFIX}/tactics/${id}.json`);
}

export async function getCloakTechnique(id: number): Promise<CloakTechniqueBody | null> {
  return fetchJSON<CloakTechniqueBody>(`${PREFIX}/techniques/${id}.json`);
}

export function filterTactics(index: CloakIndex, opts: { q?: string } = {}): CloakIndex['tacticIndex'] {
  let list = index.tacticIndex;
  if (opts.q) {
    const ql = opts.q.toLowerCase();
    list = list.filter((t) => t.name.toLowerCase().includes(ql));
  }
  return list;
}

export function filterTechniques(
  tactic: CloakTacticBody,
  opts: { q?: string; type?: string } = {}
): CloakTacticBody['techniques'] {
  let list = tactic.techniques;
  if (opts.q) {
    const ql = opts.q.toLowerCase();
    list = list.filter((t) => t.name.toLowerCase().includes(ql));
  }
  if (opts.type) {
    const tl = opts.type.toLowerCase();
    list = list.filter((t) => t.type.toLowerCase() === tl);
  }
  return list;
}
