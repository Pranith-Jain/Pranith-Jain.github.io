import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Detection-rule registry: aggregates metadata + recent commits for the major
 * open-source detection rule repos. Surfaces "what's new in detections" without
 * needing a GitHub token (uses unauthenticated metadata + commits.atom RSS).
 *
 * Cached 1 h in Cache API. Source list intentionally curated; ad-hoc additions
 * should go through the existing feeds proxy allow-list.
 */

const CACHE_KEY = 'https://detection-rules-cache.internal/v2-dlp';
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 10_000;

interface SourceConfig {
  id: string;
  label: string;
  repo: string; // owner/name
  type: 'Sigma' | 'YARA' | 'Elastic' | 'Splunk SPL' | 'KQL' | 'Suricata' | 'DLP';
  description: string;
  rules_path: string; // path within the repo where rules live (for direct browse link)
  homepage?: string;
}

const SOURCES: SourceConfig[] = [
  {
    id: 'sigma',
    label: 'SigmaHQ/sigma',
    repo: 'SigmaHQ/sigma',
    type: 'Sigma',
    description:
      'Generic signature format. Thousands of cross-platform detection rules covering Windows, Linux, cloud, and proxy logs.',
    rules_path: 'rules',
  },
  {
    id: 'signature-base',
    label: 'Neo23x0/signature-base',
    repo: 'Neo23x0/signature-base',
    type: 'YARA',
    description:
      "Florian Roth's signature base. The de-facto YARA rule reference for malware, webshells, and post-exploitation tooling.",
    rules_path: 'yara',
  },
  {
    id: 'elastic-rules',
    label: 'elastic/detection-rules',
    repo: 'elastic/detection-rules',
    type: 'Elastic',
    description: 'Elastic SIEM detection rules with full MITRE ATT&CK mapping. TOML format, very actively maintained.',
    rules_path: 'rules',
  },
  {
    id: 'splunk-content',
    label: 'splunk/security_content',
    repo: 'splunk/security_content',
    type: 'Splunk SPL',
    description: 'Splunk Enterprise Security Content Update detections. SPL queries with MITRE mapping.',
    rules_path: 'detections',
  },
  {
    id: 'sentinel',
    label: 'Azure/Azure-Sentinel',
    repo: 'Azure/Azure-Sentinel',
    type: 'KQL',
    description: 'Microsoft Sentinel detection rules in KQL. The largest open-source KQL detection collection.',
    rules_path: 'Detections',
  },
  {
    id: 'emerging-threats',
    label: 'EmergingThreats / Suricata',
    repo: 'OISF/suricata',
    type: 'Suricata',
    description:
      'Suricata IDS engine. Pair with the open ET ruleset at rules.emergingthreats.net/open/ for live detection content.',
    rules_path: 'rules',
    homepage: 'https://rules.emergingthreats.net/open/',
  },
  {
    id: 'gitleaks',
    label: 'gitleaks/gitleaks',
    repo: 'gitleaks/gitleaks',
    type: 'DLP',
    description:
      'Open-source secrets detection. Default ruleset (config/gitleaks.toml) covers ~150 secret types — AWS, GCP, Azure, GitHub, Stripe, JWT, PEM, etc.',
    rules_path: 'config',
    homepage: 'https://gitleaks.io',
  },
  {
    id: 'trufflehog',
    label: 'trufflesecurity/trufflehog',
    repo: 'trufflesecurity/trufflehog',
    type: 'DLP',
    description:
      'Secret-scanning engine with hundreds of detectors and live verification. Detector definitions live under pkg/detectors/ — one per credential type.',
    rules_path: 'pkg/detectors',
    homepage: 'https://trufflesecurity.com',
  },
  {
    id: 'secrets-patterns-db',
    label: 'mazen160/secrets-patterns-db',
    repo: 'mazen160/secrets-patterns-db',
    type: 'DLP',
    description:
      'Curated pattern database for secret detection (~1600 regexes). Use as a corpus for building DLP scanners or supplementing gitleaks.',
    rules_path: 'db',
  },
  {
    id: 'detect-secrets',
    label: 'Yelp/detect-secrets',
    repo: 'Yelp/detect-secrets',
    type: 'DLP',
    description:
      'Pre-commit-friendly secret scanner with pluggable detectors. Useful as a CI gate for the patterns gitleaks already covers, with different tuning trade-offs.',
    rules_path: 'detect_secrets/plugins',
  },
];

interface RecentCommit {
  source_id: string;
  source_label: string;
  type: string;
  title: string;
  author: string;
  link: string;
  pubDate: string;
}

interface SourceEntry {
  id: string;
  label: string;
  repo: string;
  type: string;
  description: string;
  rules_path: string;
  homepage?: string;
  // From GitHub API
  stars?: number;
  forks?: number;
  pushed_at?: string;
  default_branch?: string;
  open_issues?: number;
  // Direct links
  repo_url: string;
  rules_url: string;
  commits_url: string;
}

interface DetectionRulesResponse {
  generated_at: string;
  sources: SourceEntry[];
  recent_commits: RecentCommit[];
  /** Sources that returned 429 / 403-with-zero-quota — their meta/commits in this response are stale or empty, not authoritative. Empty array on a healthy response. */
  rate_limited_sources?: string[];
}

interface GhRepo {
  stargazers_count?: number;
  forks_count?: number;
  pushed_at?: string;
  default_branch?: string;
  open_issues_count?: number;
}

// Aggregator-style 429 handling: GitHub anonymous API caps at 60/hr per IP.
// We can't fail the whole response if one repo gets rate-limited, but we
// SHOULD surface which ones did so the UI can show "n/a (rate limited)"
// instead of "0 stars" implying an empty repo.
type FetchResult<T> = { value: T; rate_limited: boolean };

async function fetchRepoMeta(repo: string): Promise<FetchResult<GhRepo | null>> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'pranithjain-dfir/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });
    if (res.status === 429 || res.status === 403) {
      // GitHub returns 403 with a `x-ratelimit-remaining: 0` header when
      // the unauthenticated quota is exhausted — treat both as rate-limit.
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (res.status === 429 || remaining === '0') return { value: null, rate_limited: true };
    }
    if (!res.ok) return { value: null, rate_limited: false };
    return { value: (await res.json()) as GhRepo, rate_limited: false };
  } catch {
    return { value: null, rate_limited: false };
  }
}

async function fetchRecentCommits(source: SourceConfig): Promise<FetchResult<RecentCommit[]>> {
  const url = `https://github.com/${source.repo}/commits.atom`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) pranithjain-dfir/1.0 Safari/537.36',
        accept: 'application/atom+xml, application/xml',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });
    if (res.status === 429) return { value: [], rate_limited: true };
    if (!res.ok) return { value: [], rate_limited: false };
    const body = await res.text();
    const out: RecentCommit[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(body)) !== null && out.length < 8) {
      const inner = m[1];
      const title = (inner.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
        .trim()
        .slice(0, 200);
      const link = inner.match(/<link[^>]*href=["']([^"']+)/)?.[1] ?? '';
      const author = inner.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? '';
      const updated = inner.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() ?? '';
      if (!title) continue;
      out.push({
        source_id: source.id,
        source_label: source.label,
        type: source.type,
        title,
        author,
        link,
        pubDate: updated,
      });
    }
    return { value: out, rate_limited: false };
  } catch {
    return { value: [], rate_limited: false };
  }
}

export async function detectionRulesHandler(c: Context<{ Bindings: Env }>) {
  const cache = caches.default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'x-cache': 'HIT',
      },
    });
  }

  // Parallel fan-out: meta + commits per source. Track rate-limited
  // sources separately so the response can flag degraded fields rather
  // than silently misrepresenting them as zero.
  const results = await Promise.all(
    SOURCES.map(async (source) => {
      const [metaResult, commitsResult] = await Promise.all([fetchRepoMeta(source.repo), fetchRecentCommits(source)]);
      const meta = metaResult.value;
      const entry: SourceEntry = {
        id: source.id,
        label: source.label,
        repo: source.repo,
        type: source.type,
        description: source.description,
        rules_path: source.rules_path,
        homepage: source.homepage,
        stars: meta?.stargazers_count,
        forks: meta?.forks_count,
        pushed_at: meta?.pushed_at,
        default_branch: meta?.default_branch,
        open_issues: meta?.open_issues_count,
        repo_url: `https://github.com/${source.repo}`,
        rules_url: `https://github.com/${source.repo}/tree/${meta?.default_branch ?? 'main'}/${source.rules_path}`,
        commits_url: `https://github.com/${source.repo}/commits/${meta?.default_branch ?? 'main'}`,
      };
      return {
        entry,
        commits: commitsResult.value,
        rate_limited: metaResult.rate_limited || commitsResult.rate_limited,
        source_id: source.id,
      };
    })
  );

  const sources: SourceEntry[] = results.map((r) => r.entry);
  const recentCommits: RecentCommit[] = results
    .flatMap((r) => r.commits)
    .sort((a, b) => {
      const da = new Date(a.pubDate).getTime() || 0;
      const db = new Date(b.pubDate).getTime() || 0;
      return db - da;
    })
    .slice(0, 30);
  const rateLimitedSources = results.filter((r) => r.rate_limited).map((r) => r.source_id);

  const body: DetectionRulesResponse = {
    generated_at: new Date().toISOString(),
    sources,
    recent_commits: recentCommits,
    ...(rateLimitedSources.length > 0 ? { rate_limited_sources: rateLimitedSources } : {}),
  };

  const json = JSON.stringify(body);
  const response = new Response(json, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'x-cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
