import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

const D3FEND_MATRIX_URL = 'https://d3fend.mitre.org/api/matrix.json';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h — D3FEND updates infrequently
const KV_PREFIX = 'd3fend-matrix:v1';

interface D3fendTechnique {
  id: string;
  d3fend_id: string;
  name: string;
  definition: string;
}

interface D3fendTactic {
  id: string;
  name: string;
  short_name: string;
  techniques: D3fendTechnique[];
}

interface D3fendMatrixResponse {
  generated_at: string;
  source: string;
  total_techniques: number;
  total_tactics: number;
  matrix: D3fendTactic[];
}

interface D3fendNode {
  '@id'?: string;
  'rdfs:label'?: string;
  'd3f:d3fend-id'?: string;
  'd3f:definition'?: string;
  children?: D3fendNode[];
}

const TACTIC_ORDER = ['Model', 'Harden', 'Detect', 'Isolate', 'Deceive', 'Evict', 'Restore'];

/**
 * Fetch the live D3FEND matrix from MITRE's public API and flatten the
 * hierarchical tactic/technique tree into a matrix shape compatible with the
 * ATT&CK navigator UI. D3FEND has 7 top-level tactics (Model/Harden/Detect/
 * Isolate/Deceive/Evict/Restore) but a 2nd-level sub-tactic (System Mapping,
 * Software Inventory, etc.) — we use the top-level tactic as the column.
 */
export async function d3fendMatrixHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://d3fend-matrix-cache.internal/v1');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  const kvKey = `${KV_PREFIX}:lastgood`;

  if (kv) {
    const stored = await kv.get(kvKey);
    if (stored) {
      return new Response(stored, {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
      });
    }
  }

  let data: D3fendNode[] | null = null;
  try {
    const res = await fetchResilient(
      D3FEND_MATRIX_URL,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      } as RequestInit,
      { attempts: 3, timeoutMs: 15000 }
    );
    if (res.ok) data = (await res.json()) as D3fendNode[];
  } catch {
    /* fall through */
  }

  if (!data || !Array.isArray(data)) {
    return c.json({ error: 'Failed to fetch D3FEND matrix' }, 502);
  }

  const matrix = parseD3fendMatrix(data);

  if (matrix.length === 0) {
    return c.json({ error: 'Failed to parse D3FEND matrix' }, 502);
  }

  const totalTechs = matrix.reduce((sum, t) => sum + t.techniques.length, 0);

  const response: D3fendMatrixResponse = {
    generated_at: new Date().toISOString(),
    source: 'MITRE D3FEND (d3fend.mitre.org) — live',
    total_techniques: totalTechs,
    total_tactics: matrix.length,
    matrix,
  };

  const json = JSON.stringify(response);

  if (kv) {
    try {
      await kv.put(kvKey, json, { expirationTtl: 7 * 24 * 60 * 60 });
    } catch {
      /* quota */
    }
  }

  const res = new Response(json, {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  await cache.put(cacheKey, res.clone());
  return res;
}

function parseD3fendMatrix(roots: D3fendNode[]): D3fendTactic[] {
  const out: D3fendTactic[] = [];
  for (const root of roots) {
    const tacticName = root['rdfs:label'] ?? tacticFromId(root['@id']);
    if (!tacticName) continue;
    const techniques: D3fendTechnique[] = [];
    collectTechniques(root, techniques);
    techniques.sort((a, b) => a.d3fend_id.localeCompare(b.d3fend_id));
    if (techniques.length > 0) {
      out.push({
        id: tacticIdFromName(tacticName),
        name: tacticName,
        short_name: tacticName.toLowerCase().replace(/\s+/g, '-'),
        techniques,
      });
    }
  }
  out.sort((a, b) => TACTIC_ORDER.indexOf(a.name) - TACTIC_ORDER.indexOf(b.name));
  return out;
}

function collectTechniques(node: D3fendNode, out: D3fendTechnique[]): void {
  if (node['d3f:d3fend-id'] && node['rdfs:label']) {
    out.push({
      id: idFromNodeId(node['@id'] ?? node['d3f:d3fend-id']),
      d3fend_id: node['d3f:d3fend-id'],
      name: node['rdfs:label'],
      definition: node['d3f:definition'] ?? '',
    });
  }
  if (node.children) {
    for (const child of node.children) collectTechniques(child, out);
  }
}

function idFromNodeId(raw: string): string {
  return raw.replace(/^d3f:/, '').replace(/[^A-Za-z0-9-]/g, '-');
}

function tacticFromId(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^d3f:(.+)$/);
  return m ? (m[1] ?? '').replace(/([A-Z])/g, ' $1').trim() : null;
}

function tacticIdFromName(name: string): string {
  return `D3-${name.toUpperCase().slice(0, 6)}`;
}
