/**
 * GitHub Security Advisories sync + read path.
 *
 * The root cause of the previous 401 on `/api/v1/github-security` was
 * the worker hitting GitHub's per-IP unauthenticated rate limit
 * (60 req/hr) on Cloudflare's shared egress IP. The fix is to stop
 * calling GitHub from the request path entirely: a daily cron
 * pre-warms KV at 02:30 UTC, the request handler reads from KV, and
 * the page shows "synced N hours ago" + any upstream error via the
 * meta endpoint.
 *
 * If a GITHUB_TOKEN secret is configured in the worker environment
 * (see wrangler.jsonc), the unauthenticated 60 req/hr cap is replaced
 * with the authenticated 5,000 req/hr cap. Even with a token, the
 * cron-driven design is still preferred: it keeps the public CDN
 * cache stable (no rate-limit-driven cache misses) and lets us
 * pre-compute the response shape in one place.
 *
 * Cold start: the SEED is empty, so the page shows "no advisories
 * yet, the next sync will populate this" until the first cron fires.
 * We never fabricate advisory data — an empty cache surfaces as an
 * empty list with the meta error explaining why.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

export interface GitHubSecurityAdvisory {
  ghsa_id: string;
  summary: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  identifiers: Array<{ type: string; value: string }>;
  references: string[];
  published_at: string;
  updated_at: string;
  vulnerabilities: Array<{
    package: { ecosystem: string; name: string };
    severity: string;
    vulnerable_version_range: string;
    patched_versions: string[];
  }>;
}

export interface GitHubSecurityResponse {
  total: number;
  advisories: GitHubSecurityAdvisory[];
  query: string;
  query_type: 'cve' | 'ghsa' | 'ecosystem' | 'package' | 'recent';
  timestamp: string;
}

export const GHSA_KV_KEY = 'ghsa:recent:v1';
export const GHSA_META_KV_KEY = 'ghsa:recent:meta:v1';
/** Cached list is valid for this long before the handler tries a
 *  background revalidation. 6h × 4 cron fires/day = up to 4
 *  upstream calls/day, well under the 60-req/hr unauthenticated
 *  budget even on shared Cloudflare egress. */
export const GHSA_FRESH_TTL_S = 60 * 60 * 6; // 6h
/** KV entries are kept this long even after they go stale, so a
 *  week-long GitHub outage still surfaces the last-known good list. */
export const GHSA_KV_TTL_S = 60 * 60 * 24 * 7; // 7d

/** Cold-start seed. Empty by design — we never fabricate advisory
 *  data. The page shows the empty state with a useful message
 *  until the first cron fires. */
export const GHSA_SEED: GitHubSecurityResponse = {
  total: 0,
  advisories: [],
  query: '',
  query_type: 'recent',
  timestamp: '1970-01-01T00:00:00.000Z',
};

interface GhsaMeta {
  source: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  upstreamStatus?: number;
  rateLimited?: boolean;
}

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

function ghsaHeaders(token?: string): Record<string, string> {
  return {
    'User-Agent': 'pranithjain-dfir/1.0',
    accept: 'application/vnd.github+json',
    // GitHub documents the explicit version header on every request;
    // the endpoint defaults to a rolling target otherwise, which can
    // break unexpectedly when GitHub ships a new API version.
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghsaFetch(
  endpoint: string,
  token?: string,
  timeoutMs = 15000
): Promise<{ status: number; body: any; rateLimited: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers: ghsaHeaders(token),
      signal: ctrl.signal,
      // No cf.cacheTtl/cacheEverything: the upstream fetch is private
      // and should always hit the live API. Per-colo caching of the
      // raw GitHub response would defeat rate-limit rotation across
      // Cloudflare's egress IPs.
    });
    if (res.ok) {
      try {
        return { status: res.status, body: await res.json(), rateLimited: false };
      } catch {
        // 200 with non-JSON body (rare; GitHub has shipped HTML error
        // pages behind a 200 in past incidents). Treat as non-OK so
        // the meta endpoint reports it.
        return { status: res.status, body: null, rateLimited: false };
      }
    }
    const rateLimited =
      res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' || (res.headers.get('x-ratelimit-resource') ?? '').length > 0);
    return { status: res.status, body: null, rateLimited };
  } finally {
    clearTimeout(timer);
  }
}

/** Single-advisory transformer — exported for reuse. */
export function transformAdvisory(data: any): GitHubSecurityAdvisory {
  return {
    ghsa_id: data.ghsa_id || data.id || '',
    summary: data.summary || '',
    description: data.description || data.summary || '',
    severity: (data.severity || 'medium').toLowerCase(),
    identifiers: data.identifiers || [],
    references: (data.references || [])
      .map((r: any) => (typeof r === 'string' ? r : r?.url))
      .filter((u: any): u is string => typeof u === 'string' && u.length > 0),
    published_at: data.published_at || '',
    updated_at: data.updated_at || '',
    vulnerabilities: (data.vulnerabilities || []).map((v: any) => ({
      package: { ecosystem: v.package?.ecosystem || '', name: v.package?.name || '' },
      severity: v.severity || '',
      vulnerable_version_range: v.vulnerable_version_range || '',
      patched_versions: Array.isArray(v.patched_versions)
        ? v.patched_versions
        : v.first_patched_version
          ? [
              typeof v.first_patched_version === 'string'
                ? v.first_patched_version
                : v.first_patched_version?.identifier,
            ].filter((x: any): x is string => typeof x === 'string')
          : [],
    })),
  };
}

/** Fetch the 100 most-recently-published reviewed advisories. */
export async function fetchRecentReviewedAdvisories(token?: string): Promise<{
  ok: boolean;
  advisories?: GitHubSecurityAdvisory[];
  status?: number;
  rateLimited?: boolean;
  error?: string;
}> {
  const result = await ghsaFetch('/advisories?type=reviewed&per_page=100&sort=published&direction=desc', token);
  if (!result.body) {
    return {
      ok: false,
      status: result.status,
      rateLimited: result.rateLimited,
      error: result.status === 200 ? 'upstream returned non-JSON body' : `upstream returned ${result.status}`,
    };
  }
  const arr = Array.isArray(result.body) ? result.body : [];
  return { ok: true, advisories: arr.map(transformAdvisory) };
}

export interface SyncResult {
  ok: boolean;
  total?: number;
  status?: number;
  rateLimited?: boolean;
  error?: string;
}

/** Cron entry point. Fetches the upstream list, writes to KV (with
 *  a content-equality guard so a free-tier write is only spent on a
 *  real change), and updates the meta key. */
export async function syncGitHubAdvisories(env: Env): Promise<SyncResult> {
  const token = env.GITHUB_TOKEN;
  const result = await fetchRecentReviewedAdvisories(token);
  const fetchedAt = new Date().toISOString();
  const meta: GhsaMeta = {
    source: GITHUB_API_BASE + '/advisories?type=reviewed&per_page=100&sort=published&direction=desc',
    fetchedAt,
    ok: result.ok,
  };
  if (!result.ok) {
    meta.error = result.error;
    meta.upstreamStatus = result.status;
    meta.rateLimited = result.rateLimited;
    if (env.KV_CACHE) {
      await env.KV_CACHE.put(GHSA_META_KV_KEY, JSON.stringify(meta), { expirationTtl: GHSA_KV_TTL_S });
    }
    return {
      ok: false,
      status: result.status,
      rateLimited: result.rateLimited,
      error: result.error,
    };
  }
  const advisories = (result.advisories ?? []).slice(0, 50);
  const payload: GitHubSecurityResponse = {
    total: advisories.length,
    advisories,
    query: '',
    query_type: 'recent',
    timestamp: fetchedAt,
  };
  if (env.KV_CACHE) {
    const body = JSON.stringify(payload);
    const existing = await env.KV_CACHE.get(GHSA_KV_KEY, 'text');
    if (existing !== body) {
      await env.KV_CACHE.put(GHSA_KV_KEY, body, { expirationTtl: GHSA_KV_TTL_S });
    }
    await env.KV_CACHE.put(GHSA_META_KV_KEY, JSON.stringify(meta), { expirationTtl: GHSA_KV_TTL_S });
  }
  return { ok: true, total: advisories.length };
}

/** Read the cached list from KV. Returns the SEED if no cache exists. */
export async function readCachedRecentAdvisories(env: Env): Promise<{
  payload: GitHubSecurityResponse;
  ageSeconds: number;
  ok: boolean;
  meta: GhsaMeta | null;
}> {
  const kv = env.KV_CACHE;
  if (!kv) {
    return { payload: GHSA_SEED, ageSeconds: Infinity, ok: false, meta: null };
  }
  const raw = await kv.get(GHSA_KV_KEY, 'text');
  if (!raw) {
    return { payload: GHSA_SEED, ageSeconds: Infinity, ok: false, meta: null };
  }
  let meta: GhsaMeta | null = null;
  try {
    meta = (await kv.get(GHSA_META_KV_KEY, 'json')) as GhsaMeta | null;
  } catch {
    /* ignore */
  }
  let payload: GitHubSecurityResponse;
  try {
    payload = JSON.parse(raw) as GitHubSecurityResponse;
  } catch {
    return { payload: GHSA_SEED, ageSeconds: Infinity, ok: false, meta };
  }
  const ts = Date.parse(payload.timestamp);
  const ageSeconds = Number.isNaN(ts) ? Infinity : Math.max(0, (Date.now() - ts) / 1000);
  return { payload, ageSeconds, ok: meta?.ok ?? true, meta };
}

/** HTTP handler. Always reads from KV; only triggers a background
 *  revalidation when the cache is stale. */
export async function gitHubSecurityRecentHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { payload, ageSeconds, ok, meta } = await readCachedRecentAdvisories(c.env);

  // Fresh hit → serve directly. No upstream call.
  if (ok && ageSeconds < GHSA_FRESH_TTL_S) {
    return c.json(payload, 200, {
      'Cache-Control': `public, max-age=${Math.max(60, Math.floor(GHSA_FRESH_TTL_S - ageSeconds))}`,
    });
  }

  // Stale-or-missing but we have a payload from a prior sync.
  // Revalidate in the background; the user still gets the cached
  // list now.
  if (payload.total > 0) {
    const exec = c.executionCtx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (exec?.waitUntil) {
      exec.waitUntil(syncGitHubAdvisories(c.env).catch(() => undefined));
    }
    return c.json({ ...payload, stale: true, meta }, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  }

  // Cold start (no cron has fired yet). Try a foreground sync so the
  // first visitor pays the upstream-call cost; everyone else reads
  // from cache after that.
  const sync = await syncGitHubAdvisories(c.env);
  if (sync.ok) {
    const fresh = await readCachedRecentAdvisories(c.env);
    return c.json(fresh.payload, 200, { 'Cache-Control': `public, max-age=${GHSA_FRESH_TTL_S}` });
  }
  return c.json(
    {
      error: sync.rateLimited
        ? 'GitHub Security API rate limit exceeded (60 req/hr unauthenticated). Set GITHUB_TOKEN in the worker environment to raise the limit to 5,000 req/hr.'
        : `GitHub Security API returned ${sync.status ?? 'unknown'}.`,
      status: sync.status,
      rate_limited: sync.rateLimited,
      meta,
    },
    sync.rateLimited ? 429 : 502,
    { 'Cache-Control': 'no-store' }
  );
}

/** Meta endpoint so the page can show "synced N hours ago" + any
 *  upstream error without parsing the body. */
export async function gitHubSecurityRecentMetaHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { payload, ageSeconds, ok, meta } = await readCachedRecentAdvisories(c.env);
  return c.json(
    {
      ok,
      total: payload.total,
      ageSeconds: Math.floor(ageSeconds),
      fetchedAt: payload.timestamp,
      meta,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
