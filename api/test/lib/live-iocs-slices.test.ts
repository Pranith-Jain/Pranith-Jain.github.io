import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  sliceKey,
  writeSlice,
  readSlice,
  SLICE_KEY_PREFIX,
  SLICE_TTL_SECONDS,
  type LiveIocSlice,
} from '../../src/lib/live-iocs-slices';
import type { FeedResult } from '../../src/routes/live-iocs';

const kv = env.KV_CACHE!;

const sampleResult: FeedResult = {
  items: [
    { value: '1.2.3.4', kind: 'ip', source: 'demo', reporter: 'Demo', context: 'test ip' },
    { value: 'http://evil.example/x', kind: 'url', source: 'demo', reporter: 'Demo', observed_at: '2026-06-03T00:00:00.000Z' },
  ],
  sources: [{ id: 'demo', ok: true, count: 2 }],
};

describe('live-iocs slices', () => {
  beforeEach(async () => {
    await kv.delete(sliceKey('demo'));
  });

  it('keys under the live-iocs:slice: prefix', () => {
    expect(sliceKey('demo')).toBe(`${SLICE_KEY_PREFIX}demo`);
  });

  it('uses a 6h TTL', () => {
    expect(SLICE_TTL_SECONDS).toBe(6 * 60 * 60);
  });

  it('round-trips a source contribution (items + sources + source_id)', async () => {
    await writeSlice(kv, 'demo', sampleResult);
    const slice = await readSlice(kv, 'demo');
    expect(slice).not.toBeNull();
    const s = slice as LiveIocSlice;
    expect(s.source_id).toBe('demo');
    expect(typeof s.generated_at).toBe('string');
    expect(Number.isNaN(Date.parse(s.generated_at))).toBe(false);
    expect(s.items).toEqual(sampleResult.items);
    expect(s.sources).toEqual(sampleResult.sources);
  });

  it('returns null for an absent slice', async () => {
    expect(await readSlice(kv, 'never-written')).toBeNull();
  });

  it('returns null for a malformed slice value', async () => {
    await kv.put(sliceKey('demo'), 'not json {{{');
    expect(await readSlice(kv, 'demo')).toBeNull();
  });

  it('returns null when the stored shape is wrong (missing arrays)', async () => {
    await kv.put(sliceKey('demo'), JSON.stringify({ source_id: 'demo', generated_at: 'x' }));
    expect(await readSlice(kv, 'demo')).toBeNull();
  });
});
