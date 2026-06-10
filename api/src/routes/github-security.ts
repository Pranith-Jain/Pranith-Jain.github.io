import type { Context } from 'hono';
import type { Env } from '../env';

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

interface GitHubSecurityResponse {
  total: number;
  advisories: GitHubSecurityAdvisory[];
  query: string;
  query_type: 'cve' | 'ghsa' | 'ecosystem' | 'package';
  timestamp: string;
}

const CACHE_TTL = 3600;
const API_TIMEOUT = 15000;

const GITHUB_API_BASE = 'https://api.github.com';

async function githubRequest(endpoint: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    'User-Agent': 'pranithjain-dfir/1.0',
    accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    headers,
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  if (!res.ok) return null;
  return res.json();
}

export async function gitHubSecurityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (c.req.query('q') ?? '').trim();
  const cve = c.req.query('cve')?.trim()?.toUpperCase();
  const ghsa = c.req.query('ghsa')?.trim()?.toUpperCase();
  const ecosystem = c.req.query('ecosystem')?.trim()?.toLowerCase();
  const packageQuery = c.req.query('package')?.trim();

  const githubToken = c.env.GITHUB_TOKEN;

  if (!query && !cve && !ghsa && !ecosystem && !packageQuery) {
    return c.json({ error: 'missing query parameter (q, cve, ghsa, ecosystem, or package)' }, 400);
  }

  try {
    let advisories: GitHubSecurityAdvisory[] = [];
    let queryType: 'cve' | 'ghsa' | 'ecosystem' | 'package' = 'package';
    const actualQuery = cve || ghsa || packageQuery || query;

    if (ghsa) {
      queryType = 'ghsa';
      const data = await githubRequest(`/advisories/${encodeURIComponent(ghsa)}`, githubToken);
      // Single-advisory endpoint returns one object (not an array).
      if (data && !Array.isArray(data)) {
        advisories = [transformAdvisory(data)];
      }
    } else if (cve) {
      queryType = 'cve';
      // GET /advisories returns a BARE ARRAY of advisory objects.
      const data = await githubRequest(`/advisories?cve_id=${encodeURIComponent(cve)}`, githubToken);
      const arr = Array.isArray(data) ? data : [];
      advisories = arr.map(transformAdvisory);
    } else if (ecosystem) {
      queryType = 'ecosystem';
      const data = await githubRequest(
        `/advisories?type=reviewed&ecosystem=${encodeURIComponent(ecosystem)}&per_page=50`,
        githubToken
      );
      const arr = Array.isArray(data) ? data : [];
      advisories = arr.map(transformAdvisory);
    } else if (packageQuery) {
      queryType = 'package';
      const data = await githubRequest(
        `/advisories?type=reviewed&affects=${encodeURIComponent(packageQuery)}&per_page=50`,
        githubToken
      );
      const arr = Array.isArray(data) ? data : [];
      advisories = arr.map(transformAdvisory);
    } else {
      // Free-text keyword: query the reviewed GHSA list. `affects` filters by
      // affected package name, which is the most useful keyword match here.
      queryType = 'package';
      const data = await githubRequest(
        `/advisories?type=reviewed&affects=${encodeURIComponent(query)}&per_page=50`,
        githubToken
      );
      const arr = Array.isArray(data) ? data : [];
      advisories = arr.map(transformAdvisory);
    }

    const response: GitHubSecurityResponse = {
      total: advisories.length,
      advisories: advisories.slice(0, 50),
      query: actualQuery || '',
      query_type: queryType,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=1800',
    });
  } catch (err) {
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

function transformAdvisory(data: any): GitHubSecurityAdvisory {
  return {
    ghsa_id: data.ghsa_id || data.id || '',
    summary: data.summary || '',
    description: data.description || data.summary || '',
    severity: (data.severity || 'medium').toLowerCase(),
    identifiers: data.identifiers || [],
    // GitHub returns references as an array of plain URL strings. Older/object
    // shapes (`{ url }`) are tolerated for safety.
    references: (data.references || [])
      .map((r: any) => (typeof r === 'string' ? r : r?.url))
      .filter((u: any): u is string => typeof u === 'string' && u.length > 0),
    published_at: data.published_at || '',
    updated_at: data.updated_at || '',
    vulnerabilities: (data.vulnerabilities || []).map((v: any) => ({
      package: { ecosystem: v.package?.ecosystem || '', name: v.package?.name || '' },
      severity: v.severity || '',
      vulnerable_version_range: v.vulnerable_version_range || '',
      // Upstream exposes a single `first_patched_version` string; normalize to
      // the array shape our response contract advertises.
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
