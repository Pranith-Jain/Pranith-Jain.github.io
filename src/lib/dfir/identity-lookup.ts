export interface IdentityProfile {
  platform: string;
  platformId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  followers?: number;
  following?: number;
  publicRepos?: number;
  location?: string;
  website?: string;
  joined?: string;
  profileUrl: string;
}
export interface PlatformDef {
  id: string;
  name: string;
  category: 'dev' | 'social' | 'gaming' | 'creative' | 'professional';
  icon: string;
  fetch: (username: string) => Promise<IdentityProfile | null>;
}

const ACCEPT_JSON = { Accept: 'application/json' };

async function safeJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const PROXY = '/api/v1/identity/lookup';

async function fetchGithub(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    login: string;
    name?: string;
    avatar_url?: string;
    bio?: string;
    followers?: number;
    following?: number;
    public_repos?: number;
    location?: string;
    blog?: string;
    created_at?: string;
  }>(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: ACCEPT_JSON });
  if (!d) return null;
  return {
    platform: 'GitHub',
    platformId: 'github',
    username: d.login,
    displayName: d.name,
    avatarUrl: d.avatar_url,
    bio: d.bio,
    followers: d.followers,
    following: d.following,
    publicRepos: d.public_repos,
    location: d.location,
    website: d.blog,
    joined: d.created_at?.slice(0, 10),
    profileUrl: `https://github.com/${d.login}`,
  };
}

async function fetchGitlab(username: string): Promise<IdentityProfile | null> {
  const arr = await safeJson<
    Array<{
      username: string;
      name?: string;
      avatar_url?: string;
      bio?: string;
      followers?: number;
      following?: number;
      public_repos?: number;
      location?: string;
      website_url?: string;
      created_at?: string;
    }>
  >(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, { headers: ACCEPT_JSON });
  if (!arr || arr.length === 0) return null;
  const d = arr[0];
  return {
    platform: 'GitLab',
    platformId: 'gitlab',
    username: d.username,
    displayName: d.name,
    avatarUrl: d.avatar_url,
    bio: d.bio,
    followers: d.followers,
    following: d.following,
    publicRepos: d.public_repos,
    location: d.location,
    website: d.website_url,
    joined: d.created_at?.slice(0, 10),
    profileUrl: `https://gitlab.com/${d.username}`,
  };
}

async function fetchCodeberg(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    login: string;
    full_name?: string;
    avatar_url?: string;
    blog?: string;
    location?: string;
    bio?: string;
    followers?: number;
    following?: number;
    public_repos?: number;
    created_at?: string;
  }>(`https://codeberg.org/api/v1/users/${encodeURIComponent(username)}`, { headers: ACCEPT_JSON });
  if (!d) return null;
  return {
    platform: 'Codeberg',
    platformId: 'codeberg',
    username: d.login,
    displayName: d.full_name,
    avatarUrl: d.avatar_url,
    bio: d.bio,
    followers: d.followers,
    following: d.following,
    publicRepos: d.public_repos,
    location: d.location,
    website: d.blog,
    joined: d.created_at?.slice(0, 10),
    profileUrl: `https://codeberg.org/${d.login}`,
  };
}

async function fetchDevTo(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    username: string;
    name?: string;
    profile_image?: string;
    summary?: string;
    followers_count?: number;
    following_count?: number;
    location?: string;
    website_url?: string;
    joined_at?: string;
  }>(`https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`, { headers: ACCEPT_JSON });
  if (!d) return null;
  return {
    platform: 'Dev.to',
    platformId: 'devto',
    username: d.username,
    displayName: d.name,
    avatarUrl: d.profile_image,
    bio: d.summary,
    followers: d.followers_count,
    following: d.following_count,
    location: d.location,
    website: d.website_url,
    joined: d.joined_at?.slice(0, 10),
    profileUrl: `https://dev.to/${d.username}`,
  };
}

async function fetchBluesky(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
    followersCount?: number;
    followsCount?: number;
    createdAt?: string;
  }>(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(username)}`);
  if (!d) return null;
  return {
    platform: 'Bluesky',
    platformId: 'bluesky',
    username: d.handle,
    displayName: d.displayName,
    avatarUrl: d.avatar,
    bio: d.description,
    followers: d.followersCount,
    following: d.followsCount,
    joined: d.createdAt?.slice(0, 10),
    profileUrl: `https://bsky.app/profile/${d.handle}`,
  };
}

async function fetchHackerNews(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{ id: string; created?: number; karma?: number; about?: string }>(
    `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`
  );
  if (!d) return null;
  return {
    platform: 'Hacker News',
    platformId: 'hackernews',
    username: d.id,
    bio: d.about,
    followers: d.karma,
    joined: d.created ? new Date(d.created * 1000).toISOString().slice(0, 10) : undefined,
    profileUrl: `https://news.ycombinator.com/user?id=${d.id}`,
  };
}

async function fetchNpm(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    total: number;
    results: Array<{
      package: { name: string; description?: string; publisher?: { username: string; email: string } };
    }>;
  }>(`https://api.npms.io/v2/search?q=maintainer:${encodeURIComponent(username)}&size=1`);
  if (!d || d.total === 0) return null;
  const pkg = d.results[0]?.package;
  return {
    platform: 'npm',
    platformId: 'npm',
    username,
    bio: pkg?.description,
    profileUrl: `https://www.npmjs.com/~${username}`,
  };
}

async function fetchPyPI(username: string): Promise<IdentityProfile | null> {
  try {
    const r = await fetch(`https://pypi.org/user/${encodeURIComponent(username)}/`);
    if (!r.ok || !r.headers.get('content-type')?.includes('text/html')) return null;
    return { platform: 'PyPI', platformId: 'pypi', username, profileUrl: `https://pypi.org/user/${username}/` };
  } catch {
    return null;
  }
}

async function fetchKeybase(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    status?: { code: number };
    them?: Array<{
      basics?: { username?: string };
      profile?: {
        full_name?: string;
        avatar?: string;
        bio?: string;
        location?: string;
      };
    }>;
  }>(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(username)}`);
  if (!d || d.status?.code !== 0) return null;
  const them = d.them?.[0];
  if (!them) return null;
  return {
    platform: 'Keybase',
    platformId: 'keybase',
    username: them.basics?.username ?? username,
    displayName: them.profile?.full_name,
    avatarUrl: them.profile?.avatar,
    bio: them.profile?.bio,
    location: them.profile?.location,
    profileUrl: `https://keybase.io/${them.basics?.username ?? username}`,
  };
}

async function fetchStackOverflow(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    items?: Array<{
      display_name?: string;
      user_id?: number;
      profile_image?: string;
      reputation?: number;
      location?: string;
      website_url?: string;
      creation_date?: number;
      badge_counts?: { gold?: number; silver?: number; bronze?: number };
    }>;
  }>(
    `https://api.stackexchange.com/2.3/users?order=desc&sort=reputation&inname=${encodeURIComponent(username)}&site=stackoverflow&pagesize=1`
  );
  if (!d?.items?.length) return null;
  const u = d.items[0];
  return {
    platform: 'Stack Overflow',
    platformId: 'stackoverflow',
    username: u.display_name ?? username,
    displayName: u.display_name,
    avatarUrl: u.profile_image,
    followers: u.reputation,
    location: u.location,
    website: u.website_url,
    joined: u.creation_date ? new Date(u.creation_date * 1000).toISOString().slice(0, 10) : undefined,
    profileUrl: `https://stackoverflow.com/users/${u.user_id}`,
  };
}

async function fetchLobsters(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    username: string;
    created_at?: string;
    about?: string;
    avatar_url?: string;
    github_username?: string;
    twitter_username?: string;
  }>(`${PROXY}?platform=lobsters&username=${encodeURIComponent(username)}`);
  if (!d) return null;
  return {
    platform: 'Lobsters',
    platformId: 'lobsters',
    username: d.username,
    avatarUrl: d.avatar_url,
    bio: d.about,
    joined: d.created_at?.slice(0, 10),
    profileUrl: `https://lobste.rs/~${d.username}`,
  };
}

export const PLATFORMS: PlatformDef[] = [
  { id: 'github', name: 'GitHub', category: 'dev', icon: '☰', fetch: fetchGithub },
  { id: 'gitlab', name: 'GitLab', category: 'dev', icon: '◆', fetch: fetchGitlab },
  { id: 'codeberg', name: 'Codeberg', category: 'dev', icon: '◈', fetch: fetchCodeberg },
  { id: 'devto', name: 'Dev.to', category: 'dev', icon: '◈', fetch: fetchDevTo },
  { id: 'npm', name: 'npm', category: 'dev', icon: '■', fetch: fetchNpm },
  { id: 'pypi', name: 'PyPI', category: 'dev', icon: '▣', fetch: fetchPyPI },
  { id: 'stackoverflow', name: 'Stack Overflow', category: 'dev', icon: '■', fetch: fetchStackOverflow },
  { id: 'lobsters', name: 'Lobsters', category: 'dev', icon: '◆', fetch: fetchLobsters },
  { id: 'hackernews', name: 'Hacker News', category: 'social', icon: '◆', fetch: fetchHackerNews },
  { id: 'keybase', name: 'Keybase', category: 'social', icon: '◆', fetch: fetchKeybase },
  { id: 'bluesky', name: 'Bluesky', category: 'social', icon: '☁', fetch: fetchBluesky },
];

export const CATEGORY_LABELS: Record<string, string> = {
  dev: 'Developer',
  social: 'Social',
  gaming: 'Gaming',
  creative: 'Creative',
  professional: 'Professional',
};
