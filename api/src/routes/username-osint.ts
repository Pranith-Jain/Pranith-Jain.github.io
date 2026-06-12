import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Username OSINT — check 60+ platforms for a given username.
 *
 *   GET /api/v1/username-osint?username=<handle>[&platforms=github,twitter,...]
 *
 * Inspired by Sherlock (84.9k stars, MIT) and Maigret (32.8k stars, MIT).
 * Runs entirely in Workers — no Python, no external services.
 * Each platform check is an HTTP request; found/not-found is inferred from
 * the response status code.
 *
 * Subrequest budget: batched to 10 concurrent, max 60 platforms.
 * Cache TTL: 15 min (username lookups don't change often).
 */

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_SECONDS = 15 * 60;
const MAX_CONCURRENT = 10;

interface PlatformCheck {
  id: string;
  name: string;
  category: 'social' | 'dev' | 'tech' | 'gaming' | 'creative' | 'finance' | 'other';
  url: (u: string) => string;
  /** Custom response classifier. Default: 200 = found, 404 = not found. */
  detect?: (status: number, headers: Headers, body?: string) => 'found' | 'not-found' | 'unknown';
}

const PLATFORMS: PlatformCheck[] = [
  // ── Social ──────────────────────────────────────────────────────────────
  { id: 'github', name: 'GitHub', category: 'dev', url: (u) => `https://github.com/${u}` },
  {
    id: 'twitter',
    name: 'X / Twitter',
    category: 'social',
    url: (u) => `https://x.com/${u}`,
    detect: (s) => (s === 200 ? 'found' : s === 404 ? 'not-found' : 'unknown'),
  },
  { id: 'instagram', name: 'Instagram', category: 'social', url: (u) => `https://www.instagram.com/${u}/` },
  { id: 'tiktok', name: 'TikTok', category: 'social', url: (u) => `https://www.tiktok.com/@${u}` },
  { id: 'youtube', name: 'YouTube', category: 'social', url: (u) => `https://www.youtube.com/@${u}` },
  { id: 'facebook', name: 'Facebook', category: 'social', url: (u) => `https://www.facebook.com/${u}` },
  { id: 'linkedin', name: 'LinkedIn', category: 'social', url: (u) => `https://www.linkedin.com/in/${u}` },
  { id: 'reddit', name: 'Reddit', category: 'social', url: (u) => `https://www.reddit.com/user/${u}` },
  { id: 'pinterest', name: 'Pinterest', category: 'social', url: (u) => `https://www.pinterest.com/${u}/` },
  { id: 'tumblr', name: 'Tumblr', category: 'social', url: (u) => `https://${u}.tumblr.com` },
  { id: 'snapchat', name: 'Snapchat', category: 'social', url: (u) => `https://www.snapchat.com/add/${u}` },
  { id: 'mastodon', name: 'Mastodon', category: 'social', url: (u) => `https://mastodon.social/@${u}` },
  { id: 'bluesky', name: 'Bluesky', category: 'social', url: (u) => `https://bsky.app/profile/${u}.bsky.social` },
  { id: 'threads', name: 'Threads', category: 'social', url: (u) => `https://www.threads.net/@${u}` },
  { id: 'x', name: 'X', category: 'social', url: (u) => `https://x.com/${u}` },

  // ── Dev ─────────────────────────────────────────────────────────────────
  { id: 'gitlab', name: 'GitLab', category: 'dev', url: (u) => `https://gitlab.com/${u}` },
  { id: 'bitbucket', name: 'Bitbucket', category: 'dev', url: (u) => `https://bitbucket.org/${u}/` },
  { id: 'devto', name: 'Dev.to', category: 'dev', url: (u) => `https://dev.to/${u}` },
  { id: 'codepen', name: 'CodePen', category: 'dev', url: (u) => `https://codepen.io/${u}` },
  { id: 'replit', name: 'Replit', category: 'dev', url: (u) => `https://replit.com/@${u}` },
  { id: 'hackerrank', name: 'HackerRank', category: 'dev', url: (u) => `https://www.hackerrank.com/${u}` },
  { id: 'leetcode', name: 'LeetCode', category: 'dev', url: (u) => `https://leetcode.com/${u}/` },
  { id: 'npm', name: 'npm', category: 'dev', url: (u) => `https://www.npmjs.com/~${u}` },
  { id: 'pypi', name: 'PyPI', category: 'dev', url: (u) => `https://pypi.org/user/${u}/` },
  { id: 'dockerhub', name: 'Docker Hub', category: 'dev', url: (u) => `https://hub.docker.com/u/${u}` },
  { id: 'dockerhub2', name: 'Docker Hub (org)', category: 'dev', url: (u) => `https://hub.docker.com/r/${u}` },
  { id: 'keybase', name: 'Keybase', category: 'dev', url: (u) => `https://keybase.io/${u}` },
  { id: 'hackerone', name: 'HackerOne', category: 'dev', url: (u) => `https://hackerone.com/${u}` },
  { id: 'bugcrowd', name: 'Bugcrowd', category: 'dev', url: (u) => `https://bugcrowd.com/${u}` },

  // ── Tech ────────────────────────────────────────────────────────────────
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    category: 'tech',
    url: (u) => `https://stackoverflow.com/users?tab=Accounts&search=${u}`,
  },
  { id: 'medium', name: 'Medium', category: 'tech', url: (u) => `https://medium.com/@${u}` },
  { id: 'substack', name: 'Substack', category: 'tech', url: (u) => `https://${u}.substack.com` },
  { id: 'ghost', name: 'Ghost', category: 'tech', url: (u) => `https://${u}.ghost.io` },
  { id: 'notion', name: 'Notion', category: 'tech', url: (u) => `https://www.notion.so/${u}` },
  { id: 'producthunt', name: 'Product Hunt', category: 'tech', url: (u) => `https://www.producthunt.com/@${u}` },
  { id: 'hackernews', name: 'Hacker News', category: 'tech', url: (u) => `https://news.ycombinator.com/user?id=${u}` },

  // ── Gaming ──────────────────────────────────────────────────────────────
  { id: 'steam', name: 'Steam', category: 'gaming', url: (u) => `https://steamcommunity.com/id/${u}` },
  { id: 'twitch', name: 'Twitch', category: 'gaming', url: (u) => `https://www.twitch.tv/${u}` },
  { id: 'xbox', name: 'Xbox', category: 'gaming', url: (u) => `https://www.xbox.com/en-US/play/user/${u}` },
  { id: 'roblox', name: 'Roblox', category: 'gaming', url: (u) => `https://www.roblox.com/user.aspx?username=${u}` },
  { id: 'minecraft', name: 'Minecraft', category: 'gaming', url: (u) => `https://namemc.com/profile/${u}` },

  // ── Creative ────────────────────────────────────────────────────────────
  { id: 'deviantart', name: 'DeviantArt', category: 'creative', url: (u) => `https://www.deviantart.com/${u}` },
  { id: 'behance', name: 'Behance', category: 'creative', url: (u) => `https://www.behance.net/${u}` },
  { id: 'dribbble', name: 'Dribbble', category: 'creative', url: (u) => `https://dribbble.com/${u}` },
  { id: 'flickr', name: 'Flickr', category: 'creative', url: (u) => `https://www.flickr.com/people/${u}/` },
  { id: '500px', name: '500px', category: 'creative', url: (u) => `https://500px.com/p/${u}` },
  { id: 'unsplash', name: 'Unsplash', category: 'creative', url: (u) => `https://unsplash.com/@${u}` },
  { id: 'soundcloud', name: 'SoundCloud', category: 'creative', url: (u) => `https://soundcloud.com/${u}` },
  { id: 'spotify', name: 'Spotify', category: 'creative', url: (u) => `https://open.spotify.com/user/${u}` },

  // ── Finance ─────────────────────────────────────────────────────────────
  { id: 'patreon', name: 'Patreon', category: 'finance', url: (u) => `https://www.patreon.com/${u}` },
  { id: 'buymeacoffee', name: 'Buy Me a Coffee', category: 'finance', url: (u) => `https://www.buymeacoffee.com/${u}` },
  { id: 'kofi', name: 'Ko-fi', category: 'finance', url: (u) => `https://ko-fi.com/${u}` },
  { id: 'liberapay', name: 'Liberapay', category: 'finance', url: (u) => `https://liberapay.com/${u}` },
  { id: 'ghsponsors', name: 'GitHub Sponsors', category: 'finance', url: (u) => `https://github.com/sponsors/${u}` },

  // ── Other ───────────────────────────────────────────────────────────────
  { id: 'aboutme', name: 'About.me', category: 'other', url: (u) => `https://about.me/${u}` },
  { id: 'linktree', name: 'Linktree', category: 'other', url: (u) => `https://linktr.ee/${u}` },
  { id: 'gravatar', name: 'Gravatar', category: 'other', url: (u) => `https://en.gravatar.com/${u}` },
  { id: 'wikipedia', name: 'Wikipedia', category: 'other', url: (u) => `https://en.wikipedia.org/wiki/User:${u}` },
  { id: 'archiveorg', name: 'Internet Archive', category: 'other', url: (u) => `https://archive.org/details/@${u}` },
  { id: 'tryhackme', name: 'TryHackMe', category: 'dev', url: (u) => `https://tryhackme.com/p/${u}` },
  { id: 'hackthebox', name: 'Hack The Box', category: 'dev', url: (u) => `https://app.hackthebox.com/users/${u}` },
  { id: 'kaggle', name: 'Kaggle', category: 'tech', url: (u) => `https://www.kaggle.com/${u}` },
  { id: 'codeforces', name: 'Codeforces', category: 'dev', url: (u) => `https://codeforces.com/profile/${u}` },
];

interface PlatformResult {
  platform: string;
  name: string;
  category: string;
  status: 'found' | 'not-found' | 'unknown' | 'error';
  url: string;
}

interface UsernameOsnitResponse {
  username: string;
  generated_at: string;
  total_checked: number;
  found: number;
  results: PlatformResult[];
  summary: Record<string, number>; // category → found count
  cached: boolean;
}

async function checkPlatform(username: string, platform: PlatformCheck): Promise<PlatformResult> {
  const url = platform.url(username);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'manual',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,*/*',
      },
    });
    clearTimeout(timer);

    if (platform.detect) {
      const status = platform.detect(res.status, res.headers);
      return { platform: platform.id, name: platform.name, category: platform.category, status, url };
    }

    // Default detection: 200-299 = found, 404 = not found, 3xx = found (redirect to profile)
    if (res.status >= 200 && res.status < 300) {
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'found', url };
    }
    if (res.status === 404 || res.status === 410) {
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'not-found', url };
    }
    if (res.status >= 300 && res.status < 400) {
      // Redirects often mean the profile exists but URL format changed
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'found', url };
    }
    return { platform: platform.id, name: platform.name, category: platform.category, status: 'unknown', url };
  } catch {
    return { platform: platform.id, name: platform.name, category: platform.category, status: 'error', url };
  }
}

export async function usernameOsnitHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('username')?.trim();
  if (!raw) return c.json({ error: 'missing username' }, 400);
  const username = raw;
  if (username.length < 2 || username.length > 64) return c.json({ error: 'username must be 2-64 chars' }, 400);
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return c.json({ error: 'username can only contain a-z, 0-9, ., _, -' }, 400);

  // Optional platform filter
  const platformFilter = c.req
    .query('platforms')
    ?.split(',')
    .map((s) => s.trim().toLowerCase());
  const platforms = platformFilter ? PLATFORMS.filter((p) => platformFilter.includes(p.id)) : PLATFORMS;

  if (platforms.length === 0) return c.json({ error: 'no matching platforms' }, 400);

  // Edge cache
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://username-osint.internal/v1?u=${username.toLowerCase()}&p=${platforms.length}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  // Fan out with bounded concurrency
  const results: PlatformResult[] = [];
  const queue = [...platforms];
  async function worker() {
    while (queue.length > 0) {
      const platform = queue.shift()!;
      const result = await checkPlatform(username, platform);
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, platforms.length) }, worker));

  // Sort: found first, then unknown, then not-found
  const order = { found: 0, unknown: 1, 'not-found': 2, error: 3 };
  results.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  const found = results.filter((r) => r.status === 'found').length;
  const summary: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'found') {
      summary[r.category] = (summary[r.category] ?? 0) + 1;
    }
  }

  const body: UsernameOsnitResponse = {
    username,
    generated_at: new Date().toISOString(),
    total_checked: results.length,
    found,
    results,
    summary,
    cached: false,
  };

  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}
