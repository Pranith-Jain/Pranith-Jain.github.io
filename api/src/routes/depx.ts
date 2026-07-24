import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * depx-style supply-chain intelligence feed.
 *
 * Fetches the malicious package directory from ossf/malicious-packages
 * and returns it in a depx-style feed format with ecosystem breakdown,
 * package counts, and advisory details.
 *
 * GET /api/v1/depx/feed?ecosystem=npm&limit=50
 * GET /api/v1/depx/feed/check?ecosystem=npm&package=lodash
 * GET /api/v1/depx/feed/stats
 */

const GH_API = 'https://api.github.com/repos/ossf/malicious-packages';
const OSV_API = 'https://api.osv.dev/v1/query';
const CACHE_TTL_SECONDS = 3600;
const KV_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;

const ECOSYSTEMS = ['npm', 'pypi', 'rubygems', 'maven', 'go', 'crates.io'] as const;
type Ecosystem = (typeof ECOSYSTEMS)[number];

interface PackageEntry {
  name: string;
  ecosystem: string;
  ossf_url: string;
}

interface FeedResponse {
  schema_version: string;
  command: string;
  data: {
    total: number;
    ecosystem_filter: string | null;
    entries: PackageEntry[];
    ecosystem_breakdown: Record<string, number>;
    source: string;
    source_url: string;
  };
  timestamp: string;
  upstream_error?: string;
  stale?: boolean;
}

export async function depxFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const ecosystemFilter = c.req.query('ecosystem') as Ecosystem | null;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500);

    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(`https://depx-feed.internal/v2?e=${ecosystemFilter ?? 'all'}&l=${limit}`);
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);

    const kv = c.env.KV_CACHE;
    const kvKey = `depx:feed:v2:${ecosystemFilter ?? 'all'}`;
    const ghToken = c.env.GITHUB_TOKEN;

    const ecosystemsToFetch = ecosystemFilter ? [ecosystemFilter] : [...ECOSYSTEMS];
    const allEntries: PackageEntry[] = [];
    const ecoBreakdown: Record<string, number> = {};
    let upstreamError: string | null = null;

    // Fetch package listings in parallel
    const results = await Promise.allSettled(
      ecosystemsToFetch.map(async (eco) => {
        const res = await fetchResilient(
          `${GH_API}/contents/osv/malicious/${eco}`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'pranithjain-depx/1.0',
              ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
            },
          },
          { attempts: 2, timeoutMs: 10_000 }
        );
        if (!res.ok) return { eco, entries: [] as PackageEntry[], error: `github ${res.status}` };
        const raw = (await res.json()) as Array<{ name: string; type: string; html_url: string }>;
        const entries = raw
          .filter((e) => e.type === 'dir' && e.name && !e.name.startsWith('.'))
          .slice(0, limit)
          .map((e) => ({
            name: e.name,
            ecosystem: eco,
            ossf_url:
              e.html_url ??
              `https://github.com/ossf/malicious-packages/tree/main/osv/malicious/${eco}/${encodeURIComponent(e.name)}`,
          }));
        return { eco, entries, error: null };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allEntries.push(...r.value.entries);
        if (r.value.entries.length > 0) ecoBreakdown[r.value.eco] = r.value.entries.length;
        if (r.value.error) upstreamError = r.value.error;
      }
    }

    if (allEntries.length === 0 && upstreamError) {
      // Try KV last-good
      if (kv) {
        try {
          const stale = await kv.get(kvKey);
          if (stale) {
            const staleBody = JSON.parse(stale) as FeedResponse;
            return c.json({ ...staleBody, upstream_error: upstreamError, stale: true }, 200, {
              'Cache-Control': 'public, max-age=300',
            });
          }
        } catch {
          /* fall through */
        }
      }
      return c.json({ error: upstreamError }, 502);
    }

    const body: FeedResponse = {
      schema_version: '1',
      command: 'feed',
      data: {
        total: allEntries.length,
        ecosystem_filter: ecosystemFilter,
        entries: allEntries.slice(0, limit),
        ecosystem_breakdown: ecoBreakdown,
        source: 'ossf/malicious-packages',
        source_url: 'https://github.com/ossf/malicious-packages',
      },
      timestamp: new Date().toISOString(),
    };

    const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    if (kv) {
      c.executionCtx.waitUntil(
        (async () => {
          if (await shouldWriteLastGood('depx:feed')) {
            await kv.put(kvKey, JSON.stringify(body), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
          }
        })()
      );
    }
    return response;
  } catch (err) {
    console.error('depxFeedHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'feed failed' }, 500);
  }
}

/**
 * GET /api/v1/depx/feed/stats — ecosystem breakdown
 */
export async function depxFeedStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request('https://depx-feed.internal/v2/stats');
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);

    const ghToken = c.env.GITHUB_TOKEN;
    const results = await Promise.allSettled(
      ECOSYSTEMS.map(async (eco): Promise<{ eco: string; count: number }> => {
        const res = await fetchResilient(
          `${GH_API}/contents/osv/malicious/${eco}`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'pranithjain-depx/1.0',
              ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
            },
          },
          { attempts: 2, timeoutMs: 10_000 }
        );
        if (!res.ok) return { eco, count: 0 };
        const raw = (await res.json()) as Array<{ type: string }>;
        return { eco, count: raw.filter((e) => e.type === 'dir').length };
      })
    );

    const ecosystems = results
      .filter((r): r is PromiseFulfilledResult<{ eco: string; count: number }> => r.status === 'fulfilled')
      .map((r) => ({ ecosystem: r.value.eco, total: r.value.count }))
      .sort((a, b) => b.total - a.total);

    const totalAdvisories = ecosystems.reduce((n, e) => n + e.total, 0);

    const body = {
      schema_version: '1',
      data: { ecosystems, total_advisories: totalAdvisories },
      timestamp: new Date().toISOString(),
    };

    const response = c.json(body, 200, { 'Cache-Control': 'public, max-age=3600' });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('depxFeedStatsHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'stats failed' }, 500);
  }
}

/**
 * GET /api/v1/depx/feed/check?ecosystem=npm&package=lodash — package verdict
 */
export async function depxCheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let ecosystem: string;
    let packageName: string;

    const ref = c.req.query('ref');
    if (ref) {
      const parts = ref.split(':');
      if (parts.length !== 2) return c.json({ error: 'invalid ref; expected ecosystem:package' }, 400);
      ecosystem = (parts[0] ?? '').toLowerCase();
      packageName = parts[1] ?? '';
    } else {
      ecosystem = (c.req.query('ecosystem') ?? '').toLowerCase();
      packageName = (c.req.query('package') ?? '').trim();
    }

    if (!ecosystem || !packageName) return c.json({ error: 'missing params' }, 400);

    const ghToken = c.env.GITHUB_TOKEN;
    const osvEco = ecosystem.toUpperCase();

    const [ossfResult, osvResult] = await Promise.all([
      fetchResilient(
        `${GH_API}/contents/osv/malicious/${encodeURIComponent(ecosystem)}/${encodeURIComponent(packageName)}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'pranithjain-depx/1.0',
            ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
          },
        },
        { attempts: 2, timeoutMs: 8_000 }
      )
        .then(async (r) => {
          if (!r.ok) return { found: false, advisories: [] as Array<{ id: string; summary: string }> };
          const entries = (await r.json()) as Array<{ name: string; type: string }>;
          return {
            found: true,
            advisories: entries
              .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
              .map((e) => ({ id: e.name.replace('.json', ''), summary: `Malicious: ${packageName}` })),
          };
        })
        .catch(() => ({ found: false, advisories: [] as Array<{ id: string; summary: string }> })),

      fetch(OSV_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: { name: packageName, ecosystem: osvEco } }),
        signal: AbortSignal.timeout(8000),
      })
        .then(async (r) => {
          if (!r.ok)
            return {
              vulns: [] as Array<{
                id: string;
                summary?: string;
                modified?: string;
                published?: string;
                withdrawn?: string;
              }>,
            };
          return (await r.json()) as {
            vulns: Array<{ id: string; summary?: string; modified?: string; published?: string; withdrawn?: string }>;
          };
        })
        .catch(() => ({
          vulns: [] as Array<{
            id: string;
            summary?: string;
            modified?: string;
            published?: string;
            withdrawn?: string;
          }>,
        })),
    ]);

    const allAdvisories = [
      ...ossfResult.advisories.map((a) => ({ ...a, source: 'ossf' as const })),
      ...osvResult.vulns
        .filter((v) => !v.withdrawn)
        .map((v) => ({ id: v.id, summary: v.summary ?? `Vulnerability in ${packageName}`, source: 'osv' as const })),
    ];

    const isMalicious = allAdvisories.some((a) => a.id.startsWith('MAL-'));
    const verdict = isMalicious ? 'malicious' : allAdvisories.length > 0 ? 'clean' : 'unknown';
    const confidence = isMalicious ? 'high' : allAdvisories.length > 0 ? 'medium' : 'low';

    const registryUrls: Record<string, string> = {
      npm: 'https://www.npmjs.com/package/',
      pypi: 'https://pypi.org/project/',
      go: 'https://pkg.go.dev/',
      maven: 'https://mvnrepository.com/artifact/',
      rubygems: 'https://rubygems.org/gems/',
      'crates.io': 'https://crates.io/crates/',
    };

    return c.json(
      {
        schema_version: '1',
        command: 'check',
        data: {
          ref: `${ecosystem}:${packageName}`,
          purl: `pkg:${ecosystem}/${packageName}`,
          verdict,
          confidence,
          ids: allAdvisories.map((a) => a.id),
          package_ecosystem: ecosystem,
          package_name: packageName,
          registry_url: `${registryUrls[ecosystem] ?? ''}${packageName}`,
          advisories: allAdvisories,
        },
        timestamp: new Date().toISOString(),
      },
      200,
      { 'Cache-Control': 'public, max-age=3600' }
    );
  } catch (err) {
    console.error('depxCheckHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'check failed' }, 500);
  }
}
