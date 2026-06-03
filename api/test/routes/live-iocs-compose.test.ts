import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { composeLiveIocs, enqueueAllFeeds, FEED_SOURCE_IDS } from '../../src/routes/live-iocs';
import { writeSlice } from '../../src/lib/live-iocs-slices';
import type { Env } from '../../src/env';

const kv = env.KV_CACHE!;
// The test env (ProvidedEnv) declares only KV_CACHE; composeLiveIocs only
// touches KV_CACHE/BRIEFINGS_DB at runtime, so cast through unknown like the
// sibling tests (briefing-builder, intel-bundle-warm) do.
const apiEnv = env as unknown as Env;

async function clearSlices() {
  const all = await kv.list({ prefix: 'live-iocs:slice:' });
  await Promise.all(all.keys.map((k) => kv.delete(k.name)));
}

describe('composeLiveIocs', () => {
  beforeEach(clearSlices);

  it('merges present slices and flags degraded when the set is incomplete', async () => {
    await writeSlice(kv, 'emerging-threats', {
      items: [
        {
          value: '1.1.1.1',
          kind: 'ip',
          source: 'emerging-threats',
          reporter: 'Proofpoint ETOpen',
          context: 'recent compromise / blocklist',
        },
      ],
      sources: [{ id: 'emerging-threats', ok: true, count: 1 }],
    });
    await writeSlice(kv, 'botvrij', {
      items: [{ value: 'evil.example', kind: 'domain', source: 'botvrij', reporter: 'Botvrij.eu', context: 'x' }],
      sources: [{ id: 'botvrij', ok: true, count: 1 }],
    });

    const { response, presentSlices } = await composeLiveIocs(kv, apiEnv);
    expect(presentSlices).toBe(2);
    // 2 of 32 slices present → extraDegraded → degraded true
    expect(response.degraded).toBe(true);
    const ids = response.sources.map((s) => s.id);
    expect(ids).toContain('emerging-threats');
    expect(ids).toContain('botvrij');
    const values = response.items.map((i) => i.value);
    expect(values).toContain('1.1.1.1');
    expect(values).toContain('evil.example');
  });

  it('drops a source whose slice contributed no fresh items (recount), keeps degraded', async () => {
    // an item observed long before the 7-day staleness cutoff is filtered out
    await writeSlice(kv, 'tweetfeed', {
      items: [
        { value: 'stale.example', kind: 'domain', source: 'tweetfeed', reporter: 'x', observed_at: '2020-01-01T00:00:00.000Z' },
      ],
      sources: [{ id: 'tweetfeed', ok: true, count: 1 }],
    });
    const { response, presentSlices } = await composeLiveIocs(kv, apiEnv);
    expect(presentSlices).toBe(1);
    // the only item was stale → no active sources, but still degraded (incomplete set)
    expect(response.items.map((i) => i.value)).not.toContain('stale.example');
    expect(response.sources.map((s) => s.id)).not.toContain('tweetfeed');
    expect(response.degraded).toBe(true);
  });

  it('returns presentSlices=0 when no slices exist (caller falls back to sync)', async () => {
    const { presentSlices } = await composeLiveIocs(kv, apiEnv);
    expect(presentSlices).toBe(0);
  });
});

describe('enqueueAllFeeds', () => {
  it('sends exactly one message per registry source', async () => {
    const sent: Array<{ body: { sourceId: string } }> = [];
    const fakeQueue = {
      sendBatch: async (msgs: Iterable<{ body: { sourceId: string } }>) => {
        for (const m of msgs) sent.push(m);
      },
    };
    await enqueueAllFeeds(fakeQueue as never);
    expect(sent).toHaveLength(FEED_SOURCE_IDS.length);
    expect(sent.map((m) => m.body.sourceId)).toEqual([...FEED_SOURCE_IDS]);
  });
});
