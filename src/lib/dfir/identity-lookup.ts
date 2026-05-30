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

async function fetchReddit(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    data?: {
      name?: string;
      subreddit?: { display_name?: string; public_description?: string; subscribers?: number; created_utc?: number };
      icon_img?: string;
    };
  }>(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, { headers: ACCEPT_JSON });
  if (!d?.data?.name) return null;
  const s = d.data.subreddit;
  return {
    platform: 'Reddit',
    platformId: 'reddit',
    username: d.data.name,
    displayName: s?.display_name ?? d.data.name,
    avatarUrl: d.data.icon_img?.split('?')[0],
    bio: s?.public_description,
    followers: s?.subscribers,
    joined: s?.created_utc ? new Date(s.created_utc * 1000).toISOString().slice(0, 10) : undefined,
    profileUrl: `https://reddit.com/user/${d.data.name}`,
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

async function fetchLobsters(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{
    id: number;
    username: string;
    name?: string;
    avatar_url?: string;
    created_at?: string;
    github_username?: string;
  }>(`https://lobste.rs/u/${encodeURIComponent(username)}.json`);
  if (!d) return null;
  return {
    platform: 'Lobsters',
    platformId: 'lobsters',
    username: d.username,
    displayName: d.name,
    avatarUrl: d.avatar_url,
    joined: d.created_at?.slice(0, 10),
    profileUrl: `https://lobste.rs/u/${d.username}`,
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

async function fetchNpm(username: string): Promise<IdentityProfile | null> {
  const d = await safeJson<{ name: string }>(
    `https://registry.npmjs.org/-/user/org.couchdb.user:${encodeURIComponent(username)}`,
    { headers: ACCEPT_JSON }
  );
  if (!d) return null;
  return { platform: 'npm', platformId: 'npm', username: d.name, profileUrl: `https://www.npmjs.com/~${d.name}` };
}

async function fetchPyPI(username: string): Promise<IdentityProfile | null> {
  const r = await fetch(`https://pypi.org/user/${encodeURIComponent(username)}/`);
  if (!r.ok) return null;
  return { platform: 'PyPI', platformId: 'pypi', username, profileUrl: `https://pypi.org/user/${username}/` };
}

export const PLATFORMS: PlatformDef[] = [
  { id: 'github', name: 'GitHub', category: 'dev', icon: '☰', fetch: fetchGithub },
  { id: 'gitlab', name: 'GitLab', category: 'dev', icon: '◆', fetch: fetchGitlab },
  { id: 'codeberg', name: 'Codeberg', category: 'dev', icon: '◈', fetch: fetchCodeberg },
  { id: 'devto', name: 'Dev.to', category: 'dev', icon: '◈', fetch: fetchDevTo },
  { id: 'npm', name: 'npm', category: 'dev', icon: '■', fetch: fetchNpm },
  { id: 'pypi', name: 'PyPI', category: 'dev', icon: '▣', fetch: fetchPyPI },
  { id: 'lobsters', name: 'Lobsters', category: 'dev', icon: '◆', fetch: fetchLobsters },
  { id: 'hackernews', name: 'Hacker News', category: 'social', icon: '◆', fetch: fetchHackerNews },
  { id: 'reddit', name: 'Reddit', category: 'social', icon: '◆', fetch: fetchReddit },
  { id: 'bluesky', name: 'Bluesky', category: 'social', icon: '☁', fetch: fetchBluesky },
];

export const CATEGORY_LABELS: Record<string, string> = {
  dev: 'Developer',
  social: 'Social',
  gaming: 'Gaming',
  creative: 'Creative',
  professional: 'Professional',
};
