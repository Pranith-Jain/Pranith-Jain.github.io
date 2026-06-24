import { describe, it, expect, vi } from 'vitest';
import { runSocialAutopost, type AutopostDeps } from '../../../src/case-study/posting/autopost';
import type { SocialSchedule } from '../../../src/case-study/types';
import type { AutopostQueueItem } from '../../../src/case-study/storage/social-schedule';

const NOW = new Date('2026-06-25T12:00:00Z');
const past = '2026-06-25T11:00:00Z';
const future = '2026-06-25T18:00:00Z';

function sched(over: Partial<SocialSchedule>): SocialSchedule {
  return { slug: over.slug ?? 's', updatedAt: NOW.toISOString(), ...over };
}

/** Build deps with sensible defaults; override per test. */
function makeDeps(
  over: Partial<AutopostDeps> & { schedules?: Record<string, SocialSchedule>; queue?: AutopostQueueItem[] }
): {
  deps: AutopostDeps;
  post: ReturnType<typeof vi.fn>;
  recordResult: ReturnType<typeof vi.fn>;
  writeQueue: ReturnType<typeof vi.fn>;
} {
  const schedules = over.schedules ?? {};
  const post = vi.fn(async () => ({ ok: true, postUrl: 'https://x.com/p/1' }));
  const recordResult = vi.fn(async () => {});
  const writeQueue = vi.fn(async () => {});
  const deps: AutopostDeps = {
    enabled: over.enabled ?? true,
    now: NOW,
    readQueue: async () => over.queue ?? [],
    writeQueue,
    getSchedule: async (slug: string) => schedules[slug] ?? null,
    getContent: async (slug: string) => ({ slug, twitter: 'tw', linkedin: 'li', generatedAt: NOW.toISOString() }),
    post: over.post ?? post,
    recordResult: over.recordResult ?? recordResult,
    dripPerPlatform: over.dripPerPlatform ?? 1,
    maxAttempts: over.maxAttempts ?? 3,
  };
  return { deps, post, recordResult, writeQueue };
}

describe('runSocialAutopost — safety gates', () => {
  it('does nothing when disabled (master switch off)', async () => {
    const { deps, post } = makeDeps({
      enabled: false,
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'approved', scheduledAt: past } }) },
    });
    const r = await runSocialAutopost(deps);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('disabled');
    expect(post).not.toHaveBeenCalled();
  });

  it('posts an approved + due entry and records the result', async () => {
    const { deps, post, recordResult } = makeDeps({
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'approved', scheduledAt: past } }) },
    });
    const r = await runSocialAutopost(deps);
    expect(post).toHaveBeenCalledTimes(1);
    expect(recordResult).toHaveBeenCalledWith('s', 'twitter', { ok: true, postUrl: 'https://x.com/p/1' });
    expect(r.posted).toHaveLength(1);
  });

  it('does NOT post an approved entry whose scheduledAt is in the future', async () => {
    const { deps, post } = makeDeps({
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'approved', scheduledAt: future } }) },
    });
    await runSocialAutopost(deps);
    expect(post).not.toHaveBeenCalled();
  });

  it('does NOT post a candidate that is not approved (still pending), and prunes it from the queue', async () => {
    const { deps, post, writeQueue } = makeDeps({
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'pending', scheduledAt: past } }) },
    });
    await runSocialAutopost(deps);
    expect(post).not.toHaveBeenCalled();
    expect(writeQueue).toHaveBeenCalledWith([]); // pruned
  });

  it('drips: with 3 approved+due twitter posts and dripPerPlatform=1, only one posts this tick', async () => {
    const { deps, post } = makeDeps({
      dripPerPlatform: 1,
      queue: [
        { slug: 'a', platform: 'twitter' },
        { slug: 'b', platform: 'twitter' },
        { slug: 'c', platform: 'twitter' },
      ],
      schedules: {
        a: sched({ slug: 'a', twitter: { status: 'approved', scheduledAt: '2026-06-25T09:00:00Z' } }),
        b: sched({ slug: 'b', twitter: { status: 'approved', scheduledAt: '2026-06-25T10:00:00Z' } }),
        c: sched({ slug: 'c', twitter: { status: 'approved', scheduledAt: '2026-06-25T11:00:00Z' } }),
      },
    });
    const r = await runSocialAutopost(deps);
    expect(post).toHaveBeenCalledTimes(1);
    // most-overdue first → 'a' (09:00) posts
    expect(r.posted[0]!.slug).toBe('a');
  });

  it('drips per-platform: one twitter AND one linkedin can post in the same tick', async () => {
    const { deps, post } = makeDeps({
      dripPerPlatform: 1,
      queue: [
        { slug: 's', platform: 'twitter' },
        { slug: 's', platform: 'linkedin' },
      ],
      schedules: {
        s: sched({
          twitter: { status: 'approved', scheduledAt: past },
          linkedin: { status: 'approved', scheduledAt: past },
        }),
      },
    });
    const r = await runSocialAutopost(deps);
    expect(post).toHaveBeenCalledTimes(2);
    expect(r.posted.map((p) => p.platform).sort()).toEqual(['linkedin', 'twitter']);
  });

  it('records a failure (and does not throw) when the platform post errors', async () => {
    const post = vi.fn(async () => ({ ok: false, error: 'rate limited' }));
    const { deps, recordResult } = makeDeps({
      post,
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'approved', scheduledAt: past } }) },
    });
    const r = await runSocialAutopost(deps);
    expect(recordResult).toHaveBeenCalledWith('s', 'twitter', { ok: false, error: 'rate limited' });
    expect(r.failed).toHaveLength(1);
    expect(r.posted).toHaveLength(0);
  });

  it('skips a candidate that already hit maxAttempts', async () => {
    const { deps, post } = makeDeps({
      maxAttempts: 3,
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'failed', scheduledAt: past, attempts: 3 } }) },
    });
    await runSocialAutopost(deps);
    expect(post).not.toHaveBeenCalled();
  });

  it('skips when there is no generated content for the slug', async () => {
    const { deps, post } = makeDeps({
      queue: [{ slug: 's', platform: 'twitter' }],
      schedules: { s: sched({ twitter: { status: 'approved', scheduledAt: past } }) },
    });
    deps.getContent = async () => null;
    const r = await runSocialAutopost(deps);
    expect(post).not.toHaveBeenCalled();
    expect(r.skipped).toBeGreaterThanOrEqual(1);
  });
});
