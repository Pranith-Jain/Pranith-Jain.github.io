import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

const A3M_URL = 'https://www.cyberriskevaluator.com/A3M_Matrix_Agentic_AI_Attack_Matrix.html';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h — A3M changes infrequently
const KV_PREFIX = 'a3m-matrix:v1';

interface A3mTechnique {
  id: string;
  name: string;
}

interface A3mTactic {
  id: string;
  name: string;
  short_name: string;
  techniques: A3mTechnique[];
}

interface A3mMatrixResponse {
  generated_at: string;
  source: string;
  total_techniques: number;
  total_tactics: number;
  matrix: A3mTactic[];
}

/**
 * Scrape the live A3M Matrix HTML and parse it into a tactic/technique tree.
 * A3M's HTML is a single page with `.col` (tactic) elements containing `.card`
 * (technique) children. Each card has a `.tid` (e.g. "AAT-1001") and `.tname`.
 *
 * The 4-digit id encodes the tactic (first digit) and sequence — e.g. AAT-1xxx
 * is Reconnaissance / Initial Access, AAT-2xxx is Resource Development /
 * Execution / Lateral Movement / Collection / Exfiltration, AAT-3xxx is
 * AI Attack Staging. We derive the tactic from the second digit group of the
 * id prefix.
 */
export async function a3mMatrixHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://a3m-matrix-cache.internal/v1');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  const kvKey = `${KV_PREFIX}:lastgood`;

  // Try KV first
  if (kv) {
    const stored = await kv.get(kvKey);
    if (stored) {
      return new Response(stored, {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
      });
    }
  }

  let html = '';
  try {
    const res = await fetchResilient(
      A3M_URL,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/html' },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      } as RequestInit,
      { attempts: 3, timeoutMs: 15000 }
    );
    if (res.ok) html = await res.text();
  } catch {
    /* fall through */
  }

  if (!html) {
    return c.json({ error: 'Failed to fetch A3M Matrix' }, 502);
  }

  const matrix = parseA3mHtml(html);

  if (matrix.length === 0) {
    return c.json({ error: 'Failed to parse A3M Matrix HTML' }, 502);
  }

  const totalTechs = matrix.reduce((sum, t) => sum + t.techniques.length, 0);

  const response: A3mMatrixResponse = {
    generated_at: new Date().toISOString(),
    source: 'A3M Matrix (cyberriskevaluator.com) — live',
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

function parseA3mHtml(html: string): A3mTactic[] {
  const matrix: A3mTactic[] = [];
  // Match each `.col` section block
  const colRegex = /<section class="col" aria-label="([^"]+)">([\s\S]*?)<\/section>/g;
  let colMatch: RegExpExecArray | null;
  while ((colMatch = colRegex.exec(html)) !== null) {
    const tacticName = colMatch[1]?.trim() ?? '';
    const colBody = colMatch[2] ?? '';
    const tacticId = tacticIdFromName(tacticName);
    const techniques: A3mTechnique[] = [];
    const cardRegex = /<div class="tid">([A-Z]{3}-(\d{4}))<\/div>\s*<div class="tname">([^<]+)<\/div>/g;
    let cardMatch: RegExpExecArray | null;
    while ((cardMatch = cardRegex.exec(colBody)) !== null) {
      const id = cardMatch[1] ?? '';
      const name = (cardMatch[3] ?? '').trim();
      if (id && name) techniques.push({ id, name });
    }
    techniques.sort((a, b) => a.id.localeCompare(b.id));
    if (tacticName)
      matrix.push({
        id: tacticId,
        name: tacticName,
        short_name: tacticName.toLowerCase().replace(/\s+/g, '-'),
        techniques,
      });
  }
  // A3M kill-chain order: recon → resource-dev → initial-access → ai-model-access → execution → persistence → priv-esc → stealth → defense-impairment → cred-access → discovery → lat-move → collection → ai-attack-staging → c2 → exfil → impact
  const order = [
    'reconnaissance',
    'resource-development',
    'initial-access',
    'ai-model-access',
    'execution',
    'persistence',
    'privilege-escalation',
    'stealth',
    'defense-impairment',
    'credential-access',
    'discovery',
    'lateral-movement',
    'collection',
    'ai-attack-staging',
    'command-and-control',
    'exfiltration',
    'impact',
  ];
  matrix.sort((a, b) => order.indexOf(a.short_name) - order.indexOf(b.short_name));
  return matrix;
}

function tacticIdFromName(name: string): string {
  return `TA${name
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 6)
    .toUpperCase()
    .padStart(6, 'X')}`;
}
