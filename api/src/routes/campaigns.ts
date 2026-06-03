import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';

/**
 * Campaign persistence — KV-backed save / list / detail / delete for
 * AI-generated threat-campaign briefs.
 *
 * Storage layout:
 *   campaign:{id}        → full campaign JSON
 *   campaigns:index      → JSON array of {id, name, confidence, generated_at, actor, sector}
 *
 * The index is the source of truth for listing. Per-campaign reads bypass
 * the index and go directly to `campaign:{id}` so a stale index never
 * surfaces a 404. A failed write to the index is logged but does not block
 * the campaign save — the campaign still exists, just won't appear in
 * /threatintel/campaigns until the next successful index rebuild.
 *
 * IDs are caller-supplied via crypto.randomUUID() server-side at save
 * time. No write paths accept caller IDs (prevents collision games).
 */

const INDEX_KEY = 'campaigns:index';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CampaignDoc {
  campaign_name: string;
  summary: string;
  actor_context: string;
  kill_chain: Array<{ phase: string; description: string }>;
  mitre_techniques: Array<{ id: string; name: string; rationale: string }>;
  hunting_hypotheses: string[];
  detection_opportunities: string[];
  iocs_to_pivot: string[];
  confidence: 'low' | 'medium' | 'high';
  caveats: string[];
}

interface CampaignInput {
  actor?: string;
  sector?: string;
  ttps?: string;
  notes?: string;
  iocs?: string[];
}

interface SavedCampaign {
  id: string;
  saved_at: string;
  generated_at: string;
  model_used: string;
  input: CampaignInput;
  campaign: CampaignDoc;
}

interface IndexEntry {
  id: string;
  name: string;
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
  saved_at: string;
  actor: string;
  sector: string;
  ioc_count: number;
  mitre_count: number;
}

async function readIndex(kv: KVNamespace): Promise<IndexEntry[]> {
  try {
    const raw = await kv.get(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(kv: KVNamespace, entries: IndexEntry[]): Promise<void> {
  await kv.put(INDEX_KEY, JSON.stringify(entries));
}

// Per-colo Cache API fronts for the public read handlers. Writes (admin-only)
// purge same-colo so the operator sees changes immediately; other colos
// refresh within the response max-age. readIndex stays KV-direct for mutations.
function campaignsCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}
const listCacheReq = (): Request => new Request('https://campaigns-cache.internal/v1/list');
const detailCacheReq = (id: string): Request => new Request(`https://campaigns-cache.internal/v1/detail/${id}`);
async function invalidateCampaignCaches(id?: string): Promise<void> {
  const cache = campaignsCache();
  await cache.delete(listCacheReq()).catch(() => {});
  if (id) await cache.delete(detailCacheReq(id)).catch(() => {});
}

function indexEntryFor(saved: SavedCampaign): IndexEntry {
  return {
    id: saved.id,
    name: saved.campaign.campaign_name,
    confidence: saved.campaign.confidence,
    generated_at: saved.generated_at,
    saved_at: saved.saved_at,
    actor: saved.input.actor ?? '',
    sector: saved.input.sector ?? '',
    ioc_count: saved.input.iocs?.length ?? 0,
    mitre_count: saved.campaign.mitre_techniques.length,
  };
}

function validateCampaignBody(body: unknown): SavedCampaign | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const campaign = b.campaign;
  if (!campaign || typeof campaign !== 'object') return { error: 'missing campaign object' };
  const c = campaign as Record<string, unknown>;
  if (typeof c.campaign_name !== 'string' || !c.campaign_name.trim()) {
    return { error: 'campaign.campaign_name required' };
  }
  // Trust the server's prior validator — campaign-generator returns a
  // schema-validated doc. We re-cast rather than re-validate every field.
  const input = (b.input as CampaignInput | undefined) ?? {};
  return {
    id: crypto.randomUUID(),
    saved_at: new Date().toISOString(),
    generated_at: typeof b.generated_at === 'string' ? b.generated_at : new Date().toISOString(),
    model_used: typeof b.model_used === 'string' ? b.model_used : 'unknown',
    input,
    campaign: campaign as CampaignDoc,
  };
}

export async function saveCampaignHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not configured' }, 500);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const validated = validateCampaignBody(body);
  if ('error' in validated) return c.json(validated, 400);

  await kv.put(`campaign:${validated.id}`, JSON.stringify(validated));

  try {
    const index = await readIndex(kv);
    index.unshift(indexEntryFor(validated));
    // Cap at 200 so the index stays small and a single bad import can't
    // grow it unbounded. Older entries remain readable by direct ID lookup.
    await writeIndex(kv, index.slice(0, 200));
  } catch (err) {
    console.warn('campaigns: index write failed (campaign still saved)', err);
  }
  await invalidateCampaignCaches(validated.id);

  return c.json({ id: validated.id, saved_at: validated.saved_at }, 201, { 'cache-control': 'no-store' });
}

export async function listCampaignsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ items: [], count: 0, error: 'KV not configured' });
  const cache = campaignsCache();
  const req = listCacheReq();
  const hit = await cache.match(req).catch(() => null);
  if (hit) return new Response(hit.body, hit);
  const index = await readIndex(kv);
  const resp = c.json({ items: index, count: index.length, generated_at: new Date().toISOString() }, 200, {
    'cache-control': 'public, max-age=30',
  });
  c.executionCtx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

export async function getCampaignHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not configured' }, 500);
  const id = c.req.param('id') ?? '';
  if (!ID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  const cache = campaignsCache();
  const req = detailCacheReq(id);
  const hit = await cache.match(req).catch(() => null);
  if (hit) return new Response(hit.body, hit);
  const raw = await kv.get(`campaign:${id}`);
  if (!raw) return c.json({ error: 'campaign not found' }, 404);
  try {
    const resp = c.json(JSON.parse(raw), 200, { 'cache-control': 'public, max-age=300' });
    c.executionCtx.waitUntil(cache.put(req, resp.clone()));
    return resp;
  } catch {
    return c.json({ error: 'corrupted campaign record' }, 500);
  }
}

export async function deleteCampaignHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not configured' }, 500);
  const id = c.req.param('id') ?? '';
  if (!ID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  await kv.delete(`campaign:${id}`);
  try {
    const index = await readIndex(kv);
    await writeIndex(
      kv,
      index.filter((e) => e.id !== id)
    );
  } catch (err) {
    console.warn('campaigns: index delete failed', err);
  }
  await invalidateCampaignCaches(id);
  return c.json({ ok: true, id }, 200);
}
