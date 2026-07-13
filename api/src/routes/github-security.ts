/**
 * `/api/v1/github-security` route.
 *
 * The recent-advisories listing (`?recent=true`) is the only high-traffic
 * consumer and is the one that hit Cloudflare's per-IP unauthenticated
 * rate limit (60 req/hr) when called live from the request path. It now
 * reads from a KV cache pre-warmed by the daily cron in
 * `worker/scheduled.ts` (see `syncGitHubAdvisories`). See
 * `lib/github-security-sync.ts` for the full rationale.
 *
 * The parameterized lookups (`?cve=`, `?ghsa=`, `?ecosystem=`, `?package=`,
 * `?q=`) are kept as live fetches: they're low-traffic (used by tool pages,
 * not the listing), and a per-`(cve, ghsa, package, ecosystem, q)` KV cache
 * is not worth the write quota. If a `GITHUB_TOKEN` is configured in the
 * worker, the authenticated 5,000 req/hr cap makes these live calls safe
 * for moderate traffic too.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import {
  gitHubSecurityRecentHandler,
  gitHubSecurityRecentMetaHandler,
  fetchRecentReviewedAdvisories,
  transformAdvisory,
  type GitHubSecurityResponse,
} from '../lib/github-security-sync';

interface GitHubSecurityAdvisory {
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

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const CACHE_TTL = 3600;
const API_TIMEOUT = 15000;

interface GitHubFetchResult {
  data: any;
  status: number;
  rateLimited: boolean;
}

async function githubRequest(endpoint: string, token?: string): Promise<GitHubFetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'pranithjain-dfir/1.0',
    accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
  try {
    const res = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers,
      signal: ctrl.signal,
    });
    if (res.ok) {
      try {
        return { data: await res.json(), status: res.status, rateLimited: false };
      } catch (_catchErr) {
        console.error('githubRequest failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        return { data: null, status: res.status, rateLimited: false };
      }
    }
    const rateLimited =
      res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' || (res.headers.get('x-ratelimit-resource') ?? '').length > 0);
    return { data: null, status: res.status, rateLimited };
  } finally {
    clearTimeout(timer);
  }
}

function buildResponse(
  advisories: GitHubSecurityAdvisory[],
  query: string,
  queryType: 'cve' | 'ghsa' | 'ecosystem' | 'package' | 'recent'
): GitHubSecurityResponse {
  return {
    total: advisories.length,
    advisories: advisories.slice(0, 50),
    query,
    query_type: queryType,
    timestamp: new Date().toISOString(),
  };
}

/** Live parameterized handler for ?cve= ?ghsa= ?ecosystem= ?package= ?q=.
 *  These are low-traffic; the daily cron doesn't pre-warm them. If we
 *  observe a rate-limit (status 403 + x-ratelimit-remaining=0) we surface
 *  a 429 with a useful error. */
export async function gitHubSecurityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (c.req.query('q') ?? '').trim();
  const cve = c.req.query('cve')?.trim()?.toUpperCase();
  const ghsa = c.req.query('ghsa')?.trim()?.toUpperCase();
  const ecosystem = c.req.query('ecosystem')?.trim()?.toLowerCase();
  const packageQuery = c.req.query('package')?.trim();
  const recent = c.req.query('recent') === 'true';

  // `?recent=true` is the high-traffic listing — delegate to the cron-
  // pre-warmed handler. (The page passes recent=true unconditionally.)
  if (recent && !cve && !ghsa && !ecosystem && !packageQuery && !query) {
    return gitHubSecurityRecentHandler(c);
  }

  if (!query && !cve && !ghsa && !ecosystem && !packageQuery && !recent) {
    return c.json({ error: 'missing query parameter (q, cve, ghsa, ecosystem, package, or recent=true)' }, 400);
  }

  const githubToken = c.env.GITHUB_TOKEN;

  try {
    let advisories: GitHubSecurityAdvisory[] = [];
    let queryType: 'cve' | 'ghsa' | 'ecosystem' | 'package' | 'recent' = 'package';
    const actualQuery = cve || ghsa || packageQuery || query;
    let lastStatus = 200;
    let rateLimited = false;

    if (recent) {
      // Recent listing (e.g. with another filter layered on top — keep
      // the live path for those; the cron-pre-warmed handler is the
      // default).
      queryType = 'recent';
      const r = await fetchRecentReviewedAdvisories(githubToken);
      if (!r.ok) {
        return c.json(
          {
            error: r.rateLimited
              ? 'GitHub Security API rate limit exceeded.'
              : `GitHub Security API returned ${r.status}.`,
            status: r.status,
            rate_limited: r.rateLimited,
          },
          r.rateLimited ? 429 : 502
        );
      }
      advisories = r.advisories ?? [];
    } else if (ghsa) {
      queryType = 'ghsa';
      const result = await githubRequest(`/advisories/${encodeURIComponent(ghsa)}`, githubToken);
      lastStatus = result.status;
      rateLimited = result.rateLimited;
      const data = result.data;
      if (data && !Array.isArray(data)) advisories = [transformAdvisory(data)];
    } else if (cve) {
      queryType = 'cve';
      const result = await githubRequest(`/advisories?cve_id=${encodeURIComponent(cve)}`, githubToken);
      lastStatus = result.status;
      rateLimited = result.rateLimited;
      const arr = Array.isArray(result.data) ? result.data : [];
      advisories = arr.map(transformAdvisory);
    } else if (ecosystem) {
      queryType = 'ecosystem';
      const result = await githubRequest(
        `/advisories?type=reviewed&ecosystem=${encodeURIComponent(ecosystem)}&per_page=50`,
        githubToken
      );
      lastStatus = result.status;
      rateLimited = result.rateLimited;
      const arr = Array.isArray(result.data) ? result.data : [];
      advisories = arr.map(transformAdvisory);
    } else if (packageQuery) {
      queryType = 'package';
      const result = await githubRequest(
        `/advisories?type=reviewed&affects=${encodeURIComponent(packageQuery)}&per_page=50`,
        githubToken
      );
      lastStatus = result.status;
      rateLimited = result.rateLimited;
      const arr = Array.isArray(result.data) ? result.data : [];
      advisories = arr.map(transformAdvisory);
    } else {
      queryType = 'package';
      const result = await githubRequest(
        `/advisories?type=reviewed&affects=${encodeURIComponent(query)}&per_page=50`,
        githubToken
      );
      lastStatus = result.status;
      rateLimited = result.rateLimited;
      const arr = Array.isArray(result.data) ? result.data : [];
      advisories = arr.map(transformAdvisory);
    }

    if (lastStatus !== 200) {
      const message = rateLimited
        ? 'GitHub Security API rate limit exceeded. Set GITHUB_TOKEN to raise the limit to 5,000 req/hr.'
        : `GitHub Security API returned ${lastStatus}.`;
      return c.json({ error: message, status: lastStatus, rate_limited: rateLimited }, rateLimited ? 429 : 502, {
        'Cache-Control': 'no-store',
      });
    }

    return c.json(buildResponse(advisories, actualQuery || '', queryType), 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json(
      {
        error: 'GitHub Security lookup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}

export { gitHubSecurityRecentMetaHandler };
