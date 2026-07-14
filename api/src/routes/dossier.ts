/**
 * Threat Dossier route.
 *
 * Produces a structured per-entity dossier with 5W+H analysis and
 * Diamond Model mapping — matching Exvora's "Threat Dossier" feature.
 *
 * Endpoints:
 *   POST /api/v1/dossier — generate dossier for a query (IOC, CVE, actor)
 *   GET  /api/v1/dossier/:type/:value — retrieve cached dossier
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound } from '../lib/api-error';
import { detectType } from '../lib/report/subject-resolver';
import { extractFiveW, type FiveW } from '../lib/fivew-extract';
import { buildDiamondModel, type DiamondModel, type ExtractedIoc } from '../lib/report-analyzer';

// ── Types ──────────────────────────────────────────────────────────────

interface DossierEntity {
  type: 'cve' | 'actor' | 'ip' | 'domain' | 'hash' | 'campaign' | 'ransomware' | 'generic';
  value: string;
  label: string;
}

interface EnrichmentResult {
  entity: DossierEntity;
  /** Raw enrichment data for 5W/H extraction. */
  rawText: string;
  sources: string[];
  scores?: {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    confidence: number;
    malicious?: boolean;
  };
}

interface DossierResponse {
  entity: DossierEntity;
  fiveW: FiveW | null;
  diamond: DiamondModel | null;
  enrichment: EnrichmentResult;
  generated_at: string;
  tlp: string;
}

// ── Route ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/dossier
 * Body: { query: string, queryType?: string }
 * Returns a structured dossier with 5W+H + Diamond Model.
 */
export async function dossierHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let body: { query?: string; queryType?: string };
    try {
      body = await c.req.json();
    } catch (_catchErr) {
      console.error('dossierHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return badRequest(c, 'Invalid JSON body');
    }

    const query = body.query?.trim();
    if (!query) return badRequest(c, 'query is required');
    if (query.length > 500) return badRequest(c, 'query too long (max 500 chars)');

    const queryType = body.queryType ?? (detectType(query) as string);
    const entity = classifyEntity(query, queryType);

    // Early return for CVE — we can enrich directly from KV cache
    if (entity.type === 'cve') {
      return await buildCveDossier(c, entity);
    }

    // For other types, enrich via the agent DO or inline providers
    const enrichment = await enrichEntity(c, entity);
    if (!enrichment) {
      return c.json(buildMinimalDossier(entity, query, `No enrichment available for '${query}'`));
    }

    // Extract 5W+H from the enrichment text
    let fiveW: FiveW | null = null;
    try {
      const ai = c.env.AI;
      if (ai) {
        fiveW = await extractFiveW(enrichment.rawText, c.env);
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      // 5W extraction is best-effort
    }

    // Build Diamond Model from enrichment data
    const diamond = buildDiamondModelFromEnrichment(entity, enrichment, fiveW);

    return c.json({
      entity,
      fiveW,
      diamond,
      enrichment,
      generated_at: new Date().toISOString(),
      tlp: 'CLEAR',
    } satisfies DossierResponse);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/dossier/:type/:value — check KV cache for an existing dossier.
 */
export async function dossierGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const type = c.req.param('type');
  const value = c.req.param('value');
  if (!type || !value) return badRequest(c, 'type and value required');

  const kv = c.env.KV_CACHE;
  if (!kv) return notFound(c, 'KV cache not available');

  const cached = await kv.get(`dossier:${type}:${value}`, 'json').catch(() => null);
  if (!cached) return notFound(c, 'no cached dossier');

  return c.json(cached, 200, { 'Cache-Control': 'public, max-age=300' });
}

// ── Helpers ────────────────────────────────────────────────────────────

function classifyEntity(query: string, queryType: string): DossierEntity {
  const safe = queryType;
  const type = (['cve', 'actor', 'ip', 'domain', 'hash', 'campaign', 'ransomware'] as const).includes(
    safe as 'cve' | 'actor' | 'ip' | 'domain' | 'hash' | 'campaign' | 'ransomware'
  )
    ? (safe as DossierEntity['type'])
    : 'generic';

  return { type, value: query, label: query };
}

async function buildCveDossier(c: Context<{ Bindings: Env }>, entity: DossierEntity): Promise<Response> {
  const kv = c.env.KV_CACHE;
  const cached = kv ? await kv.get(`cve:${entity.value}`, 'json').catch<null>(() => null) : null;

  const data = (cached as Record<string, unknown>) ?? {};
  const cvss = data.cvss as Record<string, unknown> | undefined;
  const epss = data.epss as Record<string, unknown> | undefined;
  const kev = data.kev as Record<string, unknown> | undefined;

  const rawText = [
    `CVE: ${entity.value}`,
    cvss ? `CVSS: ${JSON.stringify(cvss)}` : '',
    epss ? `EPSS: ${JSON.stringify(epss)}` : '',
    kev ? `KEV: ${JSON.stringify(kev)}` : '',
    data.description ? `Description: ${data.description}` : '',
    data.vulncheck ? `VulnCheck: ${JSON.stringify(data.vulncheck)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let fiveW: FiveW | null = null;
  try {
    const ai = c.env.AI;
    if (ai) {
      fiveW = await extractFiveW(rawText, c.env);
    }
  } catch (_catchErr) {
    console.error('buildCveDossier failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    // best-effort
  }

  const entities: string[] = [];
  if (data.description) entities.push(`vulnerability: ${data.description}`);
  if (kev?.in_kev) entities.push('cisa_kev: listed');
  if ((data as Record<string, unknown>).exploit_poc) entities.push('poc: available');

  const iocs: ExtractedIoc[] = [
    {
      value: entity.value,
      kind: 'cve',
      confidence: 85,
      confidence_band: 'high',
      evidence: 'CVE identifier',
      source: 'report-text',
    },
  ];

  const diamond = buildDiamondModel({ actors: [], malware: [] }, [], iocs, fiveW, rawText);

  const enrichment: EnrichmentResult = {
    entity,
    rawText,
    sources: ['kv-cache'],
    scores: {
      severity:
        (((cvss as Record<string, unknown>)?.severity as string)?.toLowerCase() as
          'critical' | 'high' | 'medium' | 'low' | 'info') ?? 'medium',
      confidence: epss?.score ? Math.round(Number(epss.score) * 100) : 50,
      malicious: kev?.in_kev === true,
    },
  };

  const dossier: DossierResponse = {
    entity,
    fiveW,
    diamond,
    enrichment,
    generated_at: new Date().toISOString(),
    tlp: 'CLEAR',
  };

  // Cache for fast re-read
  if (kv) await kv.put(`dossier:cve:${entity.value}`, JSON.stringify(dossier), { expirationTtl: 7200 }).catch(() => {});

  return c.json(dossier);
}

async function enrichEntity(c: Context<{ Bindings: Env }>, entity: DossierEntity): Promise<EnrichmentResult | null> {
  const kv = c.env.KV_CACHE;
  const parts: string[] = [];
  const sources: string[] = [];

  // Try actor name lookup
  if (entity.type === 'actor' || entity.type === 'ransomware') {
    const actorKey = `actor:${entity.value}`;
    const cached = kv ? await kv.get(actorKey, 'json').catch<null>(() => null) : null;
    if (cached) {
      parts.push(JSON.stringify(cached));
      sources.push('actor-kv-cache');
    }
  }

  // Try unified search
  try {
    const searchRes = await fetch(
      `${c.env.SELF ? 'http://self' : ''}/api/v1/unified-search?q=${encodeURIComponent(entity.value)}&limit=5`,
      { headers: { 'x-internal-agent': 'true' } }
    );
    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { results?: unknown[] };
      if (searchData.results?.length) {
        parts.push(JSON.stringify(searchData.results.slice(0, 3)));
        sources.push('unified-search');
      }
    }
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }

  if (parts.length === 0) return null;

  return {
    entity,
    rawText: parts.join('\n---\n'),
    sources,
    scores: { severity: 'medium', confidence: 50 },
  };
}

function buildDiamondModelFromEnrichment(
  entity: DossierEntity,
  enrichment: EnrichmentResult,
  fiveW: FiveW | null
): DiamondModel | null {
  try {
    const iocs: ExtractedIoc[] = [
      {
        value: entity.value,
        kind:
          entity.type === 'ip' ? 'ip' : entity.type === 'domain' ? 'domain' : entity.type === 'hash' ? 'hash' : 'cve',
        confidence: 80,
        confidence_band: 'high',
        evidence: enrichment.sources.join(', '),
        source: 'report-text',
      },
    ];

    const actors: string[] = entity.type === 'actor' || entity.type === 'ransomware' ? [entity.value] : [];

    return buildDiamondModel({ actors, malware: [] }, [], iocs, fiveW, enrichment.rawText);
  } catch (_catchErr) {
    console.error(
      'buildDiamondModelFromEnrichment failed:',
      _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
    );
    return null;
  }
}

function buildMinimalDossier(entity: DossierEntity, query: string, note: string): DossierResponse {
  return {
    entity,
    fiveW: null,
    diamond: null,
    enrichment: {
      entity,
      rawText: note,
      sources: [],
      scores: { severity: 'info', confidence: 0 },
    },
    generated_at: new Date().toISOString(),
    tlp: 'CLEAR',
  };
}
