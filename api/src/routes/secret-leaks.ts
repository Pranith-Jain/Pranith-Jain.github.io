import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

const CACHE_TTL_SECONDS = 1800; // 30 min
const GITHUB_SEARCH_API = 'https://api.github.com/search/code';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Source = 'file' | 'commit';

interface LeakEntry {
  id: string;
  provider: string;
  redactedKey: string;
  repo: string;
  owner: string;
  file: string;
  severity: Severity;
  source: Source;
  timestamp: string;
  exposureScore: number;
  secretCount: number;
  url: string;
}

interface LeaderboardProvider {
  name: string;
  count: number;
  pct: number;
}

interface LeaderboardRepo {
  name: string;
  secrets: number;
  owner: string;
}

interface LeaderboardOwner {
  name: string;
  repos: number;
  totalSecrets: number;
}

interface SecretLeaksResponse {
  generated_at: string;
  total_scanned: number;
  total_secrets: number;
  total_repos: number;
  total_providers: number;
  leaks: LeakEntry[];
  severity_mix: Record<Severity, number>;
  leaderboard: {
    providers: LeaderboardProvider[];
    repos: LeaderboardRepo[];
    owners: LeaderboardOwner[];
  };
}

interface GitHubSearchItem {
  name: string;
  path: string;
  html_url: string;
  repository: {
    full_name: string;
    html_url: string;
    owner: { login: string };
  };
  score: number;
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

const SECRET_PATTERNS: Array<{
  pattern: string;
  provider: string;
  severity: Severity;
  extract: (line: string) => string | null;
}> = [
  {
    pattern: 'AKIA[0-9A-Z]{16}',
    provider: 'AWS Access Key',
    severity: 'critical',
    extract: (l) => {
      const m = l.match(/(AKIA[0-9A-Z]{16})/);
      return m && m[1] ? m[1].slice(0, 4) + '****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'ghp_[A-Za-z0-9]{36}',
    provider: 'GitHub PAT',
    severity: 'critical',
    extract: (l) => {
      const m = l.match(/(ghp_[A-Za-z0-9]{36})/);
      return m && m[1] ? m[1].slice(0, 7) + '****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'sk-[A-Za-z0-9]{48}',
    provider: 'OpenAI API Key',
    severity: 'high',
    extract: (l) => {
      const m = l.match(/(sk-[A-Za-z0-9]{48})/);
      return m && m[1] ? m[1].slice(0, 3) + '****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'sk_live_[0-9a-zA-Z]{24,}',
    provider: 'Stripe Secret',
    severity: 'critical',
    extract: (l) => {
      const m = l.match(/(sk_live_[0-9a-zA-Z]{24,})/);
      return m && m[1] ? m[1].slice(0, 10) + '****' : null;
    },
  },
  {
    pattern: 'xox[baprs]-[0-9A-Za-z-]{10,48}',
    provider: 'Slack Token',
    severity: 'high',
    extract: (l) => {
      const m = l.match(/(xox[baprs]-[0-9A-Za-z-]{10,48})/);
      return m && m[1] ? m[1].slice(0, 10) + '****' : null;
    },
  },
  {
    pattern: 'AIza[0-9A-Za-z_-]{35}',
    provider: 'Google API Key',
    severity: 'high',
    extract: (l) => {
      const m = l.match(/(AIza[0-9A-Za-z_-]{35})/);
      return m && m[1] ? m[1].slice(0, 4) + '****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}',
    provider: 'SendGrid Key',
    severity: 'critical',
    extract: (l) => {
      const m = l.match(/(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})/);
      return m && m[1] ? 'SG.****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'glpat-[A-Za-z0-9_-]{20}',
    provider: 'GitLab PAT',
    severity: 'critical',
    extract: (l) => {
      const m = l.match(/(glpat-[A-Za-z0-9_-]{20})/);
      return m ? 'glpat-****' : null;
    },
  },
  {
    pattern: 'key-[0-9a-zA-Z]{32}',
    provider: 'Mailgun Key',
    severity: 'high',
    extract: (l) => {
      const m = l.match(/(key-[0-9a-zA-Z]{32})/);
      return m && m[1] ? 'key-****' + m[1].slice(-4) : null;
    },
  },
  {
    pattern: 'sk-[A-Za-z0-9]{32,}',
    provider: 'Generic Secret Key',
    severity: 'medium',
    extract: (l) => {
      const m = l.match(/["']sk-[A-Za-z0-9]{32,}["']/);
      return m ? 'sk-****' : null;
    },
  },
];

function redact(line: string, pattern: { extract: (l: string) => string | null }): string | null {
  return pattern.extract(line);
}

function computeExposureScore(severity: Severity, isCommit: boolean): number {
  const base = severity === 'critical' ? 85 : severity === 'high' ? 70 : severity === 'medium' ? 50 : 35;
  return isCommit ? Math.min(100, base + 10) : base;
}

export async function secretLeaksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://secret-leaks-cache.internal/v4-perpage100-v2');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  const kvKey = 'secret-leaks:lastgood/v2';
  const ghToken = c.env.GITHUB_TOKEN;

  // KV last-good fallback — read before hitting GitHub API
  if (kv) {
    try {
      const lastGood = await kv.get(kvKey);
      if (lastGood) {
        const parsed = JSON.parse(lastGood) as SecretLeaksResponse;
        if (parsed.leaks && parsed.leaks.length > 0) {
          const res = new Response(lastGood, {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
              'x-cache': 'KV-LASTGOOD',
            },
          });
          // Re-cache in edge cache
          c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
          return res;
        }
      }
    } catch {
      /* continue to live fetch */
    }
  }

  const leaks: LeakEntry[] = [];
  const providerCounts: Record<string, number> = {};
  const repoSet = new Set<string>();
  const ownerSet = new Set<string>();
  const severityMix: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalScanned = 0;

  // Search GitHub for each secret pattern
  const searches = SECRET_PATTERNS.map(async (sp) => {
    try {
      const headers: Record<string, string> = {
        'user-agent': 'pranithjain-dfir/1.0',
        accept: 'application/vnd.github.v3+json',
      };
      if (ghToken) headers.authorization = `Bearer ${ghToken}`;

      const res = await fetchResilient(
        `${GITHUB_SEARCH_API}?q=${encodeURIComponent(sp.pattern + ' in:file language:yaml language:json language:py language:js language:ts')}&per_page=100&sort=indexed&order=desc`,
        { headers, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } } as RequestInit,
        { attempts: 2, timeoutMs: 8000 }
      );

      if (!res.ok) return;
      const data = (await res.json()) as GitHubSearchResponse;
      totalScanned += data.total_count;

      for (const item of data.items) {
        const redacted = sp.extract(item.name + ' ' + item.path) ?? '****';
        const isCommit = item.path.includes('commit') || item.path.endsWith('.patch');
        const owner = item.repository.owner.login;
        const repo = item.repository.full_name;

        repoSet.add(repo);
        ownerSet.add(owner);
        severityMix[sp.severity]++;
        providerCounts[sp.provider] = (providerCounts[sp.provider] || 0) + 1;

        leaks.push({
          id: `${sp.provider}-${item.repository.full_name}-${item.path}`.replace(/[^a-zA-Z0-9-]/g, '-'),
          provider: sp.provider,
          redactedKey: redacted,
          repo: repo.split('/')[1] ?? repo,
          owner,
          file: item.path,
          severity: sp.severity,
          source: isCommit ? 'commit' : 'file',
          timestamp: new Date().toISOString(),
          exposureScore: computeExposureScore(sp.severity, isCommit),
          secretCount: 1,
          url: item.html_url,
        });
      }
    } catch {
      // Skip failed pattern searches silently
    }
  });

  await Promise.allSettled(searches);

  // Sort by severity then exposure score
  const sevOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  leaks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.exposureScore - a.exposureScore);

  // Build leaderboards
  const providerEntries = Object.entries(providerCounts)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / Math.max(1, leaks.length)) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const repoCounts: Record<string, { count: number; owner: string }> = {};
  const ownerCounts: Record<string, { repos: Set<string>; total: number }> = {};

  for (const leak of leaks) {
    const rname = `${leak.owner}/${leak.repo}`;
    const existingRepo = repoCounts[rname] ?? { count: 0, owner: leak.owner };
    existingRepo.count++;
    repoCounts[rname] = existingRepo;
    const existingOwner = ownerCounts[leak.owner] ?? { repos: new Set<string>(), total: 0 };
    existingOwner.repos.add(leak.repo);
    existingOwner.total++;
    ownerCounts[leak.owner] = existingOwner;
  }

  const repoEntries = Object.entries(repoCounts)
    .map(([name, v]) => ({ name, secrets: v.count, owner: v.owner }))
    .sort((a, b) => b.secrets - a.secrets)
    .slice(0, 10);

  const ownerEntries = Object.entries(ownerCounts)
    .map(([name, v]) => ({ name, repos: v.repos.size, totalSecrets: v.total }))
    .sort((a, b) => b.totalSecrets - a.totalSecrets)
    .slice(0, 10);

  const response: SecretLeaksResponse = {
    generated_at: new Date().toISOString(),
    total_scanned: totalScanned,
    total_secrets: leaks.length,
    total_repos: repoSet.size,
    total_providers: Object.keys(providerCounts).length,
    leaks,
    severity_mix: severityMix,
    leaderboard: {
      providers: providerEntries,
      repos: repoEntries,
      owners: ownerEntries,
    },
  };

  // Cache in KV
  if (kv) {
    try {
      await kv.put(kvKey, JSON.stringify(response), { expirationTtl: 3600 });
    } catch {
      /* quota */
    }
  }

  const res = new Response(JSON.stringify(response), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(cacheKey, res.clone());
  return res;
}
