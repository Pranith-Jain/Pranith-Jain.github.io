import type { Context } from 'hono';
import type { Env } from '../env';
import {
  listCampaigns,
  getCampaignStats,
  listCampaignDomains,
  listChanges,
  listClusters,
  getCampaignIntel,
  type WebamonDim,
  type WebamonClusterSeverity,
} from '../lib/webamon-campaigns';

const CACHE_TTL = 300;

type Ctx = Context<{ Bindings: Env }>;

function notConfigured(c: Ctx): Response {
  return c.json({ error: 'not_configured', message: 'WEBAMON_API_KEY not set' }, 503);
}

function upstreamError(c: Ctx): Response {
  return c.json({ error: 'webamon upstream error', message: 'pro.webamon.com unreachable or rejected the key' }, 502);
}

function ok(c: Ctx, body: unknown): Response {
  return c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
}

function intParam(c: Ctx, name: string, max: number, dflt: number): number {
  const n = Number(c.req.query(name));
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.floor(n), max);
}

/* GET /api/v1/webamon/campaigns — tracked campaigns, sorted by 24h delta. */
export async function webamonCampaignsHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const body = await listCampaigns(c.env, {
    tag: c.req.query('tag') ?? undefined,
    search: c.req.query('search') ?? undefined,
    size: intParam(c, 'size', 100, 50),
    from: Number(c.req.query('from')) || 0,
    sortBy: c.req.query('sort_by') ?? 'delta_24h',
    order: c.req.query('order') ?? 'desc',
  });
  if (!body) return upstreamError(c);
  return ok(c, body);
}

/* GET /api/v1/webamon/campaigns/stats — global estate rollup. */
export async function webamonCampaignStatsHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const body = await getCampaignStats(c.env);
  if (!body) return upstreamError(c);
  return ok(c, body);
}

/* GET /api/v1/webamon/campaigns/:id/domains — a campaign's domains. */
export async function webamonCampaignDomainsHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'missing campaign id' }, 400);
  const body = await listCampaignDomains(c.env, id, {
    size: intParam(c, 'size', 500, 100),
    from: Number(c.req.query('from')) || 0,
  });
  if (!body) return upstreamError(c);
  return ok(c, body);
}

/* GET /api/v1/webamon/changes — per-campaign change events (the daily-digest feed). */
export async function webamonChangesHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const hasChangesRaw = c.req.query('has_changes');
  const body = await listChanges(c.env, {
    since: c.req.query('since') ?? undefined,
    campaignId: c.req.query('campaign_id') ?? undefined,
    dim: (c.req.query('dim') as WebamonDim | undefined) ?? undefined,
    hasChanges: hasChangesRaw === undefined ? undefined : hasChangesRaw === 'true' || hasChangesRaw === '1',
    size: intParam(c, 'size', 200, 100),
    from: Number(c.req.query('from')) || 0,
  });
  if (!body) return upstreamError(c);
  return ok(c, body);
}

/* GET /api/v1/webamon/clusters — emerging fingerprint clusters. */
export async function webamonClustersHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const body = await listClusters(c.env, {
    severity: (c.req.query('severity') as WebamonClusterSeverity | undefined) ?? undefined,
    fingerprintType: c.req.query('fingerprint_type') ?? undefined,
    size: intParam(c, 'size', 100, 50),
    from: Number(c.req.query('from')) || 0,
  });
  if (!body) return upstreamError(c);
  return ok(c, body);
}

/* GET /api/v1/webamon/campaign-intel — aggregated daily-brief digest. */
export async function webamonCampaignIntelHandler(c: Ctx): Promise<Response> {
  if (!c.env.WEBAMON_API_KEY) return notConfigured(c);
  const body = await getCampaignIntel(c.env, {
    since: c.req.query('since') ?? undefined,
    topCampaigns: intParam(c, 'top_campaigns', 50, 25),
    topClusters: intParam(c, 'top_clusters', 50, 25),
  });
  if (!body.ok) return upstreamError(c);
  return ok(c, body);
}
