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

// `cloudflare:test` provides caches.default via the workerd runtime. With
// `singleWorker: true` in vitest.config the worker state is shared between
// tests in a file, so each test must explicitly clear the slice it touches.
const cache = (caches as unknown as { default: Cache }).default;
async function clearSlice(sourceId: string): Promise<void> {
  await cache.delete(sliceKey(sourceId));
}

const sampleResult: FeedResult = {
  items: [
    { value: '1.2.3.4', kind: 'ip', source: 'demo', reporter: 'Demo', context: 'test ip' },
    {
      value: 'http://evil.example/x',
      kind: 'url',
      source: 'demo',
      reporter: 'Demo',
      observed_at: '2026-06-03T00:00:00.000Z',
    },
  ],
  sources: [{ id: 'demo', ok: true, count: 2 }],
};

describe('live-iocs slices (Cache API)', () => {
  beforeEach(async () => {
    await clearSlice('demo');
  });

  it('encodes the sourceId in an internal URL keyed under the slice namespace', () => {
    expect(sliceKey('demo').url).toBe(`https://live-iocs-slice.internal/v1/${encodeURIComponent('demo')}`);
    // SLICE_KEY_PREFIX is the symbolic namespace; the URL above must reference
    // it (as `live-iocs-slice`) so a reader can correlate the two.
    expect(SLICE_KEY_PREFIX).toBe('live-iocs:slice:');
    expect(sliceKey('demo').url).toContain('live-iocs-slice');
  });

  it('uses a 6h TTL', () => {
    expect(SLICE_TTL_SECONDS).toBe(6 * 60 * 60);
  });

  it('round-trips a source contribution (items + sources + source_id)', async () => {
    await writeSlice('demo', sampleResult);
    const slice = await readSlice('demo');
    expect(slice).not.toBeNull();
    const s = slice as LiveIocSlice;
    expect(s.source_id).toBe('demo');
    expect(typeof s.generated_at).toBe('string');
    expect(Number.isNaN(Date.parse(s.generated_at))).toBe(false);
    expect(s.items).toEqual(sampleResult.items);
    expect(s.sources).toEqual(sampleResult.sources);
  });

  it('returns null for an absent slice', async () => {
    expect(await readSlice('never-written')).toBeNull();
  });

  it('returns null for a malformed slice value', async () => {
    // Seed the cache with a non-JSON body to exercise the parse-guard.
    await cache.put(sliceKey('demo'), new Response('not json {{{', { headers: { 'content-type': 'text/plain' } }));
    expect(await readSlice('demo')).toBeNull();
  });

  it('returns null when the stored shape is wrong (missing arrays)', async () => {
    await cache.put(
      sliceKey('demo'),
      new Response(JSON.stringify({ source_id: 'demo', generated_at: 'x' }), {
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(await readSlice('demo')).toBeNull();
  });
});
