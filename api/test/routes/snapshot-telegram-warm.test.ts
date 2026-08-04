import { describe, it, expect, beforeEach } from 'vitest';
import { readWarmTelegram } from '../../src/routes/snapshot';
import type { TelegramFeedResponse } from '../../src/routes/telegram-feed';

// Regression test for the "Cybersec Telegram firehose — 0 posts · 0 channels
// live" bug: warming migrated to per-feed KV slices (`gp:warm:telegram`, written
// by worker/queue-consumer.ts), but snapshot kept reading the dead legacy single
// `gp:warm` blob and expecting `.telegram` nested inside it. The slice held 487
// items; snapshot read the wrong key and surfaced nothing.

const feed: TelegramFeedResponse = {
  generated_at: '2026-06-10T18:00:00.000Z',
  channels: [{ handle: 'vxunderground', name: 'vx-underground', topic: 'malware', ok: true, count: 3 }],
  items: [
    {
      channel_handle: 'vxunderground',
      channel_name: 'vx-underground',
      channel_topic: 'malware',
      channel_blurb: '',
      permalink: 'https://t.me/vxunderground/1',
      datetime: '2026-06-10T17:00:00.000Z',
      text: 'sample',
    },
  ],
  warnings: [],
};

// Mock KV: `.get(key, 'json')` returns the parsed object (or null) like Workers KV.
function kvWith(map: Record<string, unknown>): KVNamespace {
  return {
    get: async (key: string) => (key in map ? (map[key] as never) : null),
  } as unknown as KVNamespace;
}

describe('readWarmTelegram', () => {
  // readWarmTelegram now shadows its KV read in caches.default (per-colo L1
  // so the snapshot aggregator doesn't burn a KV read on every request).
  // Clear the shadow between cases so tests don't leak state.
  beforeEach(async () => {
    try {
      await (caches as unknown as { default: Cache }).default.delete(
        new Request('https://gp-warm-telegram-shadow.internal/v1')
      );
    } catch {
      /* miniflare caches.default may be unavailable in some envs */
    }
  });
  it('reads the per-feed gp:warm:telegram slice (the key the warmer actually writes)', async () => {
    const r = await readWarmTelegram(kvWith({ 'gp:warm:telegram': feed }));
    expect(r?.items.length).toBe(1);
    expect(r?.channels.length).toBe(1);
  });

  it('does NOT read the dead legacy gp:warm blob (this was the bug)', async () => {
    // Legacy single-blob shape with telegram nested — must be ignored now.
    const r = await readWarmTelegram(kvWith({ 'gp:warm': { telegram: feed } }));
    expect(r).toBeNull();
  });

  it('returns null when the slice is empty or KV is unavailable', async () => {
    expect(await readWarmTelegram(kvWith({ 'gp:warm:telegram': { items: [], channels: [] } }))).toBeNull();
    expect(await readWarmTelegram(undefined)).toBeNull();
  });
});
