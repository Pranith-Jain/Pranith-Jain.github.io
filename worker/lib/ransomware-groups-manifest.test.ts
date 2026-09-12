/**
 * Tests for the ransomware-groups manifest loader.
 *
 * ASSETS is stubbed with an in-memory {path -> json} map.
 * Run via: npx vitest run worker/lib/ransomware-groups-manifest.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadRansomwareGroupsIndex,
  getRansomwareGroup,
  filterRansomwareGroups,
  ransomwareGroupsCacheStats,
  _resetRansomwareGroupsCacheForTests,
  type RansomwareGroupsIndex,
} from './ransomware-groups-manifest';

const NOW = Date.now();
const isoDaysAgo = (n: number) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

const INDEX: RansomwareGroupsIndex = {
  source: 'test',
  sourceUrl: 'https://example.invalid/',
  license: 'test',
  syncedAt: null,
  builtAt: new Date().toISOString(),
  counts: { groups: 3, sites_up: 1, active_week: 2, profiled: 1, with_activity: 2 },
  groups: [
    {
      slug: 'akira',
      name: 'akira',
      victims_7d: 5,
      victims_total: 100,
      last_seen: isoDaysAgo(1),
      origins: ['ransomlook'],
      online: false,
      mirrors: 2,
      up_mirrors: 0,
      has_profile: true,
      blurb: 'Double extortion since 2023.',
      shard: 0,
    },
    {
      slug: 'clop',
      name: 'clop',
      victims_7d: 9,
      victims_total: 400,
      last_seen: isoDaysAgo(0),
      origins: ['ransomlook', 'ransomwarelive'],
      online: true,
      mirrors: 3,
      up_mirrors: 2,
      has_profile: false,
      blurb: 'MOVEit crew.',
    },
    {
      slug: 'zzzquiet',
      name: 'zzzquiet',
      victims_7d: 0,
      victims_total: 0,
      last_seen: null,
      origins: [],
      online: null,
      mirrors: 0,
      up_mirrors: 0,
      has_profile: false,
      blurb: 'No victim claims.',
    },
  ],
  recent: ['clop', 'akira'],
};

const AKIRA_BODY = {
  slug: 'akira',
  name: 'akira',
  victims_7d: 5,
  victims_total: 100,
  last_seen: INDEX.groups[0]!.last_seen,
  origins: ['ransomlook'],
  online: false,
  mirrors: 2,
  up_mirrors: 0,
  has_profile: true,
  blurb: 'Double extortion since 2023.',
  meta: 'Akira meta (abridged)',
  meta_source: 'Ransomlook group profile (abridged, screen bytes omitted)',
  mirrors_detail: [{ fqdn: 'akiraxyz.onion', title: null, available: false, updated: isoDaysAgo(1), version: 3 }],
  victims_sample: [
    { victim: 'Example Corp', discovered: isoDaysAgo(1), origin: 'ransomlook', source_url: 'https://example.invalid/' },
  ],
  source_urls: { ransomlook: 'https://example.invalid/akira', ransomware_live: 'https://example.invalid/' },
};

function stubAssets(extra: Record<string, unknown> = {}): Fetcher {
  const files: Record<string, unknown> = {
    '/data/ransomware-groups/index.json': INDEX,
    '/data/ransomware-groups/groups/shard-0000.json': { akira: AKIRA_BODY },
    ...extra,
  };
  return {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname;
      if (path in files) return new Response(JSON.stringify(files[path]), { status: 200 });
      return new Response('not found', { status: 404 });
    },
  } as unknown as Fetcher;
}

beforeEach(() => _resetRansomwareGroupsCacheForTests());

describe('loadRansomwareGroupsIndex', () => {
  it('loads the slim index', async () => {
    const idx = await loadRansomwareGroupsIndex(stubAssets());
    expect(idx.counts.groups).toBe(3);
    expect(idx.groups).toHaveLength(3);
    expect(idx.recent).toEqual(['clop', 'akira']);
  });

  it('throws an actionable error when the build has not run', async () => {
    const missing = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
    await expect(loadRansomwareGroupsIndex(missing)).rejects.toThrow(/build-ransomware-groups/);
  });
});

describe('getRansomwareGroup', () => {
  it('returns the full body when shipped', async () => {
    const body = await getRansomwareGroup(stubAssets(), 'akira');
    expect(body?.meta).toContain('abridged');
    expect(body?.mirrors_detail).toHaveLength(1);
    expect(body?.victims_sample).toHaveLength(1);
  });

  it('synthesises a body from the index row when no body file ships', async () => {
    const body = await getRansomwareGroup(stubAssets(), 'clop');
    expect(body?.slug).toBe('clop');
    expect(body?.meta).toBeNull();
    expect(body?.mirrors_detail).toEqual([]);
    expect(body?.source_urls.ransomware_live).toContain('ransomware.live');
  });

  it('returns null for unknown slugs', async () => {
    await expect(getRansomwareGroup(stubAssets(), 'nope')).resolves.toBeNull();
  });
});

describe('filterRansomwareGroups', () => {
  it('filters by status', () => {
    expect(filterRansomwareGroups(INDEX, { status: 'online' }).map((g) => g.slug)).toEqual(['clop']);
    expect(filterRansomwareGroups(INDEX, { status: 'offline' }).map((g) => g.slug)).toEqual(['akira']);
    expect(filterRansomwareGroups(INDEX, { status: 'unknown' }).map((g) => g.slug)).toEqual(['zzzquiet']);
  });

  it('filters active-this-week and has-profile', () => {
    expect(
      filterRansomwareGroups(INDEX, { activeWeek: true })
        .map((g) => g.slug)
        .sort()
    ).toEqual(['akira', 'clop']);
    expect(filterRansomwareGroups(INDEX, { hasProfile: true }).map((g) => g.slug)).toEqual(['akira']);
  });

  it('searches slug + name + blurb', () => {
    expect(filterRansomwareGroups(INDEX, { q: 'moveit' }).map((g) => g.slug)).toEqual(['clop']);
  });

  it('sorts by name and victims', () => {
    expect(filterRansomwareGroups(INDEX, { sort: 'name' }).map((g) => g.slug)).toEqual(['akira', 'clop', 'zzzquiet']);
    expect(filterRansomwareGroups(INDEX, { sort: 'victims' })[0]!.slug).toBe('clop');
  });

  it('defaults to most-recent first', () => {
    expect(filterRansomwareGroups(INDEX)[0]!.slug).toBe('clop');
  });

  it('clamps limit', () => {
    expect(filterRansomwareGroups(INDEX, { limit: 1 })).toHaveLength(1);
    expect(filterRansomwareGroups(INDEX, { limit: 9999 })).toHaveLength(3);
  });
});

describe('ransomwareGroupsCacheStats', () => {
  it('tracks index + body cache', async () => {
    const assets = stubAssets();
    expect(ransomwareGroupsCacheStats().indexLoaded).toBe(false);
    await loadRansomwareGroupsIndex(assets);
    await getRansomwareGroup(assets, 'akira');
    await getRansomwareGroup(assets, 'akira');
    const stats = ransomwareGroupsCacheStats();
    expect(stats.indexLoaded).toBe(true);
    expect(stats.bodies.hits).toBe(1);
  });
});
