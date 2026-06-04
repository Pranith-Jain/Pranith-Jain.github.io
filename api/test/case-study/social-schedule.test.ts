import { describe, it, expect } from 'vitest';
import {
  getSocialSchedule,
  upsertSocialSchedule,
  markSocialPosted,
  isSocialPlatform,
} from '../../src/case-study/storage/social-schedule';

function mockKv() {
  const store = new Map<string, string>();
  return {
    async get(k: string, t?: 'json') {
      const v = store.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
  } as any;
}

describe('social-schedule storage', () => {
  it('isSocialPlatform guards the union', () => {
    expect(isSocialPlatform('twitter')).toBe(true);
    expect(isSocialPlatform('linkedin')).toBe(true);
    expect(isSocialPlatform('mastodon')).toBe(false);
  });

  it('returns null for an unscheduled slug', async () => {
    expect(await getSocialSchedule(mockKv(), 'x')).toBeNull();
  });

  it('upsert sets a platform entry without clobbering the other platform', async () => {
    const ns = mockKv();
    const now = new Date('2026-06-04T00:00:00Z');
    await upsertSocialSchedule(ns, 'p1', 'twitter', { scheduledAt: '2026-06-10T09:00:00.000Z' }, now);
    const after = await upsertSocialSchedule(ns, 'p1', 'linkedin', { status: 'posted' }, now);
    expect(after.twitter).toEqual({ status: 'pending', scheduledAt: '2026-06-10T09:00:00.000Z' });
    expect(after.linkedin).toEqual({ status: 'posted' });
    expect(after.slug).toBe('p1');
  });

  it('markSocialPosted sets status + postedAt', async () => {
    const ns = mockKv();
    const now = new Date('2026-06-04T12:00:00Z');
    const s = await markSocialPosted(ns, 'p2', 'twitter', now);
    expect(s.twitter!.status).toBe('posted');
    expect(s.twitter!.postedAt).toBe('2026-06-04T12:00:00.000Z');
    // persisted
    const reloaded = await getSocialSchedule(ns, 'p2');
    expect(reloaded!.twitter!.status).toBe('posted');
  });
});
