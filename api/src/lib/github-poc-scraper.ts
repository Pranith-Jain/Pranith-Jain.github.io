import { fetchResilient } from './fetch-resilient';

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  pushed_at: string;
  created_at: string;
  topics: string[];
  owner: { login: string; html_url: string };
  clone_url: string;
}

export interface PocRepo {
  id: number;
  name: string;
  full_name: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  owner: string;
  created_at: string;
  updated_at: string;
  age_days: number;
  has_code: boolean;
}

export interface PocScanResult {
  cve_id: string;
  total_count: number;
  repos: PocRepo[];
  fetched_at: string;
}

const CVE_RE = /CVE-\d{4}-\d{4,7}/i;

function toPocRepo(r: GitHubRepo): PocRepo {
  const ageMs = Date.now() - new Date(r.created_at).getTime();
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    url: r.html_url,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language,
    topics: r.topics,
    owner: r.owner.login,
    created_at: r.created_at,
    updated_at: r.updated_at,
    age_days: Math.max(0, Math.floor(ageMs / 86_400_000)),
    has_code: r.language !== null,
  };
}

function dedupeRepos(repos: PocRepo[]): PocRepo[] {
  const seen = new Set<number>();
  return repos.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * Search GitHub for CVE exploit/PoC repositories.
 *
 * Bypasses GitHub's 1000-result search limit by splitting into monthly windows
 * when total_count > 1000. Deduplicates by repo ID and sorts by stars descending.
 */
export async function scanGitHubPoc(cveId: string, token?: string, signal?: AbortSignal): Promise<PocScanResult> {
  const cve = cveId.toUpperCase();
  const yearMatch = cve.match(/^CVE-(\d{4})-/);
  const year = yearMatch?.[1];

  const query = `${cve} in:name,description,topics`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  const fetchPage = async (page: number): Promise<GitHubSearchResponse> => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&page=${page}&per_page=100`;
    const res = await fetchResilient(url, { headers, signal }, { attempts: 2, timeoutMs: 12000 });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.json() as Promise<GitHubSearchResponse>;
  };

  let all: GitHubRepo[] = [];
  const first = await fetchPage(1);
  all = first.items;
  const total = first.total_count;

  if (total > 1000 && year) {
    for (let month = 1; month <= 12; month++) {
      const lastDay = new Date(Number(year), month, 0).getDate();
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const monthQuery = `${query} created:${start}..${end}`;
      const monthUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(monthQuery)}&sort=updated&order=desc&page=1&per_page=100`;
      const monthRes = await fetchResilient(monthUrl, { headers, signal }, { attempts: 2, timeoutMs: 12000 });
      if (!monthRes.ok) continue;
      const monthData = (await monthRes.json()) as GitHubSearchResponse;
      all.push(...monthData.items);
      // Polite delay between months
      await new Promise((r) => setTimeout(r, 1500));
    }
  } else if (total > 100) {
    const pages = Math.min(Math.ceil(total / 100), 10);
    for (let p = 2; p <= pages; p++) {
      const pageRes = await fetchResilient(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&page=${p}&per_page=100`,
        { headers, signal },
        { attempts: 2, timeoutMs: 12000 }
      );
      if (!pageRes.ok) break;
      const pageData = (await pageRes.json()) as GitHubSearchResponse;
      all.push(...pageData.items);
      if (pageData.items.length === 0) break;
    }
  }

  const pocRepos = dedupeRepos(all.map(toPocRepo))
    .filter((r) => CVE_RE.test(`${r.name} ${r.full_name} ${r.description ?? ''} ${r.topics.join(' ')}`))
    .sort((a, b) => b.stars - a.stars);

  return {
    cve_id: cve,
    total_count: total,
    repos: pocRepos,
    fetched_at: new Date().toISOString(),
  };
}
