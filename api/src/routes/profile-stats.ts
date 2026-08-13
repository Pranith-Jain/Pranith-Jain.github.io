/**
 * Self-hosted GitHub profile stat cards — GET /api/v1/profile/gh-stats
 *
 * Renders tiny SVG stat cards (overview / top-languages / streak) from
 * public GitHub endpoints, replacing the flaky third-party
 * github-readme-stats.vercel.app and streak-stats.demolab.com services
 * (they 503 intermittently and show as broken images on the profile
 * README). Public route — no API key required — so GitHub's image proxy
 * can render the badges; the existing per-IP rate limiter still applies.
 *
 * Query params:
 *   ?type=overview|langs|streak&theme=dark|light[&login=Pranith-Jain]
 *
 * Data flow: GitHub REST / contributions HTML → Cache-API L1 (per-lang
 * entries TTL 24h, everything else 1h) → final SVG cached 1h. Worst-case
 * cold-path subrequests stay well under the 50/invocation free-plan cap
 * (overview: 2, langs: 1+30, streak: 1).
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import {
  computeStreak,
  escapeXml,
  PALETTES,
  parseContributions,
  renderLangsSvg,
  renderOverviewSvg,
  renderStreakSvg,
  type StatTheme,
  type UserStats,
} from '../lib/profile-stats';

export const profileStatsRouter = new Hono<{ Bindings: Env }>();

const GH_API = 'https://api.github.com';
const GH_HEADERS = {
  accept: 'application/vnd.github+json',
  'user-agent': 'pranithjain-profile-stats',
};
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/;

function cacheRequest(kind: string, ...parts: string[]): Request {
  return new Request(`https://profile-stats.internal/v1/${kind}/${parts.map(encodeURIComponent).join('/')}`);
}

async function readCache<T>(kind: string, ...parts: string[]): Promise<T | null> {
  try {
    const hit = await caches.default.match(cacheRequest(kind, ...parts));
    if (hit) return (await hit.json()) as T;
  } catch {
    /* cold */
  }
  return null;
}

async function writeCache(kind: string, parts: string[], data: unknown, ttl: number): Promise<void> {
  try {
    const res = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    });
    await caches.default.put(cacheRequest(kind, ...parts), res);
  } catch {
    /* best-effort */
  }
}

async function fetchWrapped(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: { ...GH_HEADERS, ...(init.headers ?? {}) },
  });
}

async function fetchUser(login: string): Promise<UserStats | null> {
  const cached = await readCache<Pick<UserStats, 'name' | 'publicRepos' | 'followers' | 'following'>>('user', login);
  if (cached) return { ...cached, login, totalStars: 0 };
  try {
    const res = await fetchWrapped(`${GH_API}/users/${encodeURIComponent(login)}`);
    if (!res.ok) {
      logError('profile-stats: upstream non-2xx', new Error(String(res.status)));
      return null;
    }
    const u = (await res.json()) as {
      name?: string | null;
      public_repos?: number;
      followers?: number;
      following?: number;
    };
    const base = {
      name: u.name ?? login,
      login,
      publicRepos: u.public_repos ?? 0,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
    };
    await writeCache('user', [login], base, 3600);
    return { ...base, totalStars: 0 };
  } catch (e) {
    logError('profile-stats:user fetch failed', e);
    return null;
  }
}

async function fetchRepoList(login: string): Promise<Array<{ name: string; stargazers_count: number }> | null> {
  const cached = await readCache<Array<{ name: string; stargazers_count: number }>>('repos', login);
  if (cached) return cached;
  try {
    const res = await fetchWrapped(`${GH_API}/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`);
    if (!res.ok) {
      logError('profile-stats: upstream non-2xx', new Error(String(res.status)));
      return null;
    }
    const repos = (await res.json()) as Array<{ name: string; stargazers_count: number }>;
    await writeCache('repos', [login], repos, 3600);
    return repos;
  } catch (e) {
    logError('profile-stats:repos fetch failed', e);
    return null;
  }
}

async function fetchLanguages(login: string, repo: string): Promise<Record<string, number> | null> {
  const cached = await readCache<Record<string, number>>('langs', login, repo);
  if (cached) return cached;
  try {
    const res = await fetchWrapped(
      `${GH_API}/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo)}/languages`
    );
    if (!res.ok) {
      logError('profile-stats: upstream non-2xx', new Error(String(res.status)));
      return null;
    }
    const langs = (await res.json()) as Record<string, number>;
    await writeCache('langs', [login, repo], langs, 86400);
    return langs;
  } catch (e) {
    logError(`profile-stats:langs fetch failed (${repo})`, e);
    return null;
  }
}

async function fetchContributions(login: string): Promise<Record<string, number> | null> {
  const cached = await readCache<Record<string, number>>('contribs', login);
  if (cached) return cached;
  try {
    const res = await fetch(`https://github.com/users/${encodeURIComponent(login)}/contributions`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'text/html', 'user-agent': 'pranithjain-profile-stats' },
    });
    if (!res.ok) {
      logError('profile-stats: upstream non-2xx', new Error(String(res.status)));
      return null;
    }
    const html = await res.text();
    const days = parseContributions(html);
    if (Object.keys(days).length === 0) return null;
    await writeCache('contribs', [login], days, 3600);
    return days;
  } catch (e) {
    logError('profile-stats:contributions fetch failed', e);
    return null;
  }
}

function errorCard(message: string, theme: StatTheme): string {
  const p = PALETTES[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="120" viewBox="0 0 500 120" role="img" aria-label="stats unavailable">
<rect width="500" height="120" rx="14" fill="${p.bg}"/>
<rect x="1" y="1" width="498" height="118" rx="13" fill="${p.card}" stroke="${p.border}" stroke-width="1.5"/>
<text x="24" y="48" fill="${p.title}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="14" font-weight="700">GitHub stats unavailable</text>
<text x="24" y="78" fill="${p.label}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">${escapeXml(message)} — retrying shortly</text>
</svg>`;
}

profileStatsRouter.get('/profile/gh-stats', async (c) => {
  const type = c.req.query('type');
  const theme = (c.req.query('theme') ?? 'light') as StatTheme;
  const login = c.req.query('login') ?? 'Pranith-Jain';
  if (type !== 'overview' && type !== 'langs' && type !== 'streak') {
    return c.text('Expected type=overview|langs|streak', 400);
  }
  if (theme !== 'dark' && theme !== 'light') return c.text('Expected theme=dark|light', 400);
  if (!LOGIN_RE.test(login)) return c.text('Invalid login', 400);

  const finalKey = `gh-stats:${type}:${theme}`;
  try {
    const hit = await caches.default.match(cacheRequest('svg', finalKey));
    if (hit)
      return new Response(hit.body, {
        headers: {
          'content-type': 'image/svg+xml',
          'cache-control': 'public, max-age=3600',
          'x-profile-stats': 'cache',
        },
      });
  } catch {
    /* cold */
  }

  let svg: string;
  let ttl = 3600;
  try {
    if (type === 'overview') {
      const user = await fetchUser(login);
      const repos = await fetchRepoList(login);
      if (!user || !repos) {
        svg = errorCard('GitHub API is rate-limited or unreachable', theme);
        ttl = 300;
      } else {
        const stats: UserStats = { ...user, totalStars: repos.reduce((s, r) => s + (r.stargazers_count ?? 0), 0) };
        svg = renderOverviewSvg(stats, theme);
      }
    } else if (type === 'langs') {
      const repos = await fetchRepoList(login);
      if (!repos) {
        svg = errorCard('GitHub API is rate-limited or unreachable', theme);
        ttl = 300;
      } else {
        const top = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 30);
        const langBytes: Record<string, number> = {};
        for (const repo of top) {
          const langs = await fetchLanguages(login, repo.name);
          if (langs) {
            for (const [name, bytes] of Object.entries(langs)) {
              langBytes[name] = (langBytes[name] ?? 0) + bytes;
            }
          }
        }
        const sorted = Object.entries(langBytes)
          .sort((a, b) => b[1] - a[1])
          .map(([name, bytes]) => ({ name, bytes }));
        svg = sorted.length > 0 ? renderLangsSvg(sorted, theme) : errorCard('no public repositories', theme);
      }
    } else {
      const days = await fetchContributions(login);
      if (!days) {
        svg = errorCard('contribution data unavailable', theme);
        ttl = 300;
      } else {
        svg = renderStreakSvg(computeStreak(days), login, theme);
      }
    }
  } catch (e) {
    logError('profile-stats:render failed', e);
    svg = errorCard('render failed', theme);
    ttl = 300;
  }

  try {
    const resp = new Response(svg, {
      headers: { 'content-type': 'image/svg+xml', 'cache-control': `public, max-age=${ttl}` },
    });
    await caches.default.put(cacheRequest('svg', finalKey), resp.clone());
  } catch {
    /* best-effort */
  }
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': `public, max-age=${ttl}`, 'x-profile-stats': 'live' },
  });
});
