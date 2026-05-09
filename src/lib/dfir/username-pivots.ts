/**
 * Username pivoting library — Sherlock-lite for the browser.
 *
 * Two flavours of service:
 *   - "active": exposes a CORS-friendly JSON endpoint. We can do an actual
 *     existence check from the browser without a server proxy.
 *   - "manual": no CORS-friendly endpoint, or the check requires HTML
 *     scraping. We render the deep link only — the user clicks through.
 *
 * The active list is intentionally small (about a dozen services) so we
 * don't hammer rate limits or get blocked. The manual list is curated for
 * defenders / investigators — places where a username's *existence* on
 * that service is a meaningful pivot.
 */

export type Category =
  | 'developer'
  | 'social'
  | 'forum'
  | 'gaming'
  | 'professional'
  | 'creative'
  | 'video'
  | 'music'
  | 'finance';

export type CheckMode = 'active' | 'manual';

export interface Service {
  id: string;
  name: string;
  category: Category;
  mode: CheckMode;
  /** URL to surface to the user — ${USERNAME} placeholder. */
  profileUrl: string;
  /**
   * Active check function. Returns 'exists', 'not-found', 'rate-limited',
   * or 'error'. Only present when mode === 'active'.
   */
  check?: (username: string) => Promise<CheckResult>;
}

export type CheckResult = 'exists' | 'not-found' | 'rate-limited' | 'error';

const ACCEPT_JSON = { Accept: 'application/json' } as const;

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

/** GitHub user — 200 / 404 / 403 (rate-limited). */
async function checkGithub(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  if (r.status === 403 || r.status === 429) return 'rate-limited';
  return 'error';
}

/** GitLab — query users API for an exact match. */
async function checkGitlab(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) {
    try {
      const arr = (await r.json()) as Array<{ username?: string }>;
      return Array.isArray(arr) && arr.length > 0 ? 'exists' : 'not-found';
    } catch {
      return 'error';
    }
  }
  if (r.status === 429) return 'rate-limited';
  return 'error';
}

/** Reddit /user/<u>/about.json — 200 / 404. Reddit may also redirect to a "this user has been suspended" page with 200 status; check `data.is_suspended`. */
async function checkReddit(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) {
    try {
      const j = (await r.json()) as { data?: { name?: string; is_suspended?: boolean } };
      if (j.data?.is_suspended) return 'exists';
      return j.data?.name ? 'exists' : 'not-found';
    } catch {
      return 'error';
    }
  }
  if (r.status === 404) return 'not-found';
  if (r.status === 429) return 'rate-limited';
  return 'error';
}

/** Hacker News user via Firebase API — strictly 200 + JSON or 200 + null. */
async function checkHackerNews(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`);
  if (!r) return 'error';
  if (r.status === 200) {
    try {
      const txt = await r.text();
      return txt && txt !== 'null' ? 'exists' : 'not-found';
    } catch {
      return 'error';
    }
  }
  return 'error';
}

/** npm registry — /-/user/org.couchdb.user:<u> returns 200 / 404. */
async function checkNpm(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://registry.npmjs.org/-/user/org.couchdb.user:${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  return 'error';
}

/** Lobsters — public JSON for a user profile. */
async function checkLobsters(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://lobste.rs/u/${encodeURIComponent(username)}.json`);
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  return 'error';
}

/** Codeberg (Gitea) — /api/v1/users/<u>. */
async function checkCodeberg(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://codeberg.org/api/v1/users/${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  return 'error';
}

/** Dev.to — /api/users/by_username?url=<u>. */
async function checkDevTo(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  return 'error';
}

/** Mastodon flagship instance (mastodon.social). User can pivot to other instances manually. */
async function checkMastodonSocial(username: string): Promise<CheckResult> {
  const r = await safeFetch(`https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`, {
    headers: ACCEPT_JSON,
  });
  if (!r) return 'error';
  if (r.status === 200) return 'exists';
  if (r.status === 404) return 'not-found';
  if (r.status === 429) return 'rate-limited';
  return 'error';
}

/** PyPI — /pypi/<u>/json works for packages but not users; instead use /user/<u>. */
async function checkPyPi(username: string): Promise<CheckResult> {
  // PyPI doesn't have a public JSON endpoint for users; the HTML page returns 200/404.
  // We can't do HEAD across origins reliably; treat this as best-effort with no-cors mode.
  // Drop active check — keep PyPI as manual.
  void username;
  return 'error';
}

export const SERVICES: Service[] = [
  // ── Active (CORS-friendly JSON) ─────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    category: 'developer',
    mode: 'active',
    profileUrl: 'https://github.com/${USERNAME}',
    check: checkGithub,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    category: 'developer',
    mode: 'active',
    profileUrl: 'https://gitlab.com/${USERNAME}',
    check: checkGitlab,
  },
  {
    id: 'codeberg',
    name: 'Codeberg',
    category: 'developer',
    mode: 'active',
    profileUrl: 'https://codeberg.org/${USERNAME}',
    check: checkCodeberg,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    mode: 'active',
    profileUrl: 'https://www.reddit.com/user/${USERNAME}',
    check: checkReddit,
  },
  {
    id: 'hn',
    name: 'Hacker News',
    category: 'forum',
    mode: 'active',
    profileUrl: 'https://news.ycombinator.com/user?id=${USERNAME}',
    check: checkHackerNews,
  },
  {
    id: 'lobsters',
    name: 'Lobsters',
    category: 'forum',
    mode: 'active',
    profileUrl: 'https://lobste.rs/u/${USERNAME}',
    check: checkLobsters,
  },
  {
    id: 'npm',
    name: 'npm',
    category: 'developer',
    mode: 'active',
    profileUrl: 'https://www.npmjs.com/~${USERNAME}',
    check: checkNpm,
  },
  {
    id: 'devto',
    name: 'Dev.to',
    category: 'developer',
    mode: 'active',
    profileUrl: 'https://dev.to/${USERNAME}',
    check: checkDevTo,
  },
  {
    id: 'mastodon-social',
    name: 'Mastodon (social)',
    category: 'social',
    mode: 'active',
    profileUrl: 'https://mastodon.social/@${USERNAME}',
    check: checkMastodonSocial,
  },

  // ── Manual (deep-link only) ─────────────────────────────────────────
  // Developer / code
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://bitbucket.org/${USERNAME}/',
  },
  {
    id: 'pypi',
    name: 'PyPI',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://pypi.org/user/${USERNAME}/',
    check: checkPyPi,
  },
  {
    id: 'rubygems',
    name: 'RubyGems',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://rubygems.org/profiles/${USERNAME}',
  },
  {
    id: 'crates',
    name: 'crates.io',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://crates.io/users/${USERNAME}',
  },
  {
    id: 'docker',
    name: 'Docker Hub',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://hub.docker.com/u/${USERNAME}',
  },
  {
    id: 'sourcegraph',
    name: 'Sourcegraph',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://sourcegraph.com/users/${USERNAME}',
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow (search)',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://stackoverflow.com/users?tab=Reputation&filter=all&search=${USERNAME}',
  },
  {
    id: 'kaggle',
    name: 'Kaggle',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://www.kaggle.com/${USERNAME}',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://huggingface.co/${USERNAME}',
  },
  {
    id: 'replit',
    name: 'Replit',
    category: 'developer',
    mode: 'manual',
    profileUrl: 'https://replit.com/@${USERNAME}',
  },

  // Social
  { id: 'twitter', name: 'Twitter / X', category: 'social', mode: 'manual', profileUrl: 'https://x.com/${USERNAME}' },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.instagram.com/${USERNAME}/',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.facebook.com/${USERNAME}',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.tiktok.com/@${USERNAME}',
  },
  {
    id: 'threads',
    name: 'Threads',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.threads.net/@${USERNAME}',
  },
  {
    id: 'bsky',
    name: 'Bluesky',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://bsky.app/profile/${USERNAME}',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.pinterest.com/${USERNAME}/',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    category: 'social',
    mode: 'manual',
    profileUrl: 'https://www.snapchat.com/add/${USERNAME}',
  },

  // Forum / community
  { id: 'medium', name: 'Medium', category: 'forum', mode: 'manual', profileUrl: 'https://medium.com/@${USERNAME}' },
  {
    id: 'substack',
    name: 'Substack',
    category: 'forum',
    mode: 'manual',
    profileUrl: 'https://${USERNAME}.substack.com',
  },
  {
    id: 'quora',
    name: 'Quora',
    category: 'forum',
    mode: 'manual',
    profileUrl: 'https://www.quora.com/profile/${USERNAME}',
  },
  {
    id: 'lemmy-world',
    name: 'Lemmy (world)',
    category: 'forum',
    mode: 'manual',
    profileUrl: 'https://lemmy.world/u/${USERNAME}',
  },

  // Professional
  {
    id: 'linkedin',
    name: 'LinkedIn (search)',
    category: 'professional',
    mode: 'manual',
    profileUrl: 'https://www.linkedin.com/in/${USERNAME}/',
  },
  {
    id: 'about-me',
    name: 'About.me',
    category: 'professional',
    mode: 'manual',
    profileUrl: 'https://about.me/${USERNAME}',
  },
  {
    id: 'angellist',
    name: 'Wellfound (AngelList)',
    category: 'professional',
    mode: 'manual',
    profileUrl: 'https://wellfound.com/u/${USERNAME}',
  },

  // Creative
  {
    id: 'dribbble',
    name: 'Dribbble',
    category: 'creative',
    mode: 'manual',
    profileUrl: 'https://dribbble.com/${USERNAME}',
  },
  {
    id: 'behance',
    name: 'Behance',
    category: 'creative',
    mode: 'manual',
    profileUrl: 'https://www.behance.net/${USERNAME}',
  },
  {
    id: 'deviantart',
    name: 'DeviantArt',
    category: 'creative',
    mode: 'manual',
    profileUrl: 'https://www.deviantart.com/${USERNAME}',
  },
  {
    id: 'flickr',
    name: 'Flickr',
    category: 'creative',
    mode: 'manual',
    profileUrl: 'https://www.flickr.com/people/${USERNAME}/',
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    category: 'creative',
    mode: 'manual',
    profileUrl: 'https://unsplash.com/@${USERNAME}',
  },

  // Video
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'video',
    mode: 'manual',
    profileUrl: 'https://www.youtube.com/@${USERNAME}',
  },
  { id: 'twitch', name: 'Twitch', category: 'video', mode: 'manual', profileUrl: 'https://www.twitch.tv/${USERNAME}' },
  { id: 'vimeo', name: 'Vimeo', category: 'video', mode: 'manual', profileUrl: 'https://vimeo.com/${USERNAME}' },

  // Music
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    mode: 'manual',
    profileUrl: 'https://soundcloud.com/${USERNAME}',
  },
  {
    id: 'lastfm',
    name: 'Last.fm',
    category: 'music',
    mode: 'manual',
    profileUrl: 'https://www.last.fm/user/${USERNAME}',
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    category: 'music',
    mode: 'manual',
    profileUrl: 'https://${USERNAME}.bandcamp.com',
  },

  // Gaming
  {
    id: 'steam',
    name: 'Steam',
    category: 'gaming',
    mode: 'manual',
    profileUrl: 'https://steamcommunity.com/id/${USERNAME}',
  },
  {
    id: 'roblox',
    name: 'Roblox',
    category: 'gaming',
    mode: 'manual',
    profileUrl: 'https://www.roblox.com/user.aspx?username=${USERNAME}',
  },
  {
    id: 'xbox',
    name: 'Xbox',
    category: 'gaming',
    mode: 'manual',
    profileUrl: 'https://account.xbox.com/en-us/profile?gamertag=${USERNAME}',
  },
  {
    id: 'speedrun',
    name: 'Speedrun.com',
    category: 'gaming',
    mode: 'manual',
    profileUrl: 'https://www.speedrun.com/user/${USERNAME}',
  },

  // Finance / crypto
  {
    id: 'patreon',
    name: 'Patreon',
    category: 'finance',
    mode: 'manual',
    profileUrl: 'https://www.patreon.com/${USERNAME}',
  },
  { id: 'kofi', name: 'Ko-fi', category: 'finance', mode: 'manual', profileUrl: 'https://ko-fi.com/${USERNAME}' },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  developer: 'Developer / code',
  social: 'Social',
  forum: 'Forum / community',
  gaming: 'Gaming',
  professional: 'Professional',
  creative: 'Creative',
  video: 'Video',
  music: 'Music',
  finance: 'Finance / patronage',
};

export function buildProfileUrl(s: Service, username: string): string {
  return s.profileUrl.replace(/\$\{USERNAME\}/g, encodeURIComponent(username));
}
