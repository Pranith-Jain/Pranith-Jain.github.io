import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readReportCache } from '../../../src/lib/report/cache';

describe('readReportCache', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('returns parsed JSON on a cache hit', async () => {
    const match = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal('caches', { default: { match } });
    expect(await readReportCache<{ ok: number }>('https://x.internal/k')).toEqual({ ok: 1 });
  });
  it('returns null on a miss', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined) } });
    expect(await readReportCache('https://x.internal/k')).toBeNull();
  });
  it('returns null and does not throw when the cache API throws', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn().mockRejectedValue(new Error('boom')) } });
    expect(await readReportCache('https://x.internal/k')).toBeNull();
  });
});
