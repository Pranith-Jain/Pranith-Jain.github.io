import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetchAuthedTimeline but keep the real error classes so the handler's
// `instanceof XAuthRateLimitedError / XAuthMissingError` checks still work.
vi.mock('../../api/src/lib/twitter-auth-graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/src/lib/twitter-auth-graphql')>();
  return { ...actual, fetchAuthedTimeline: vi.fn() };
});

import { fetchAuthedTimeline, XAuthRateLimitedError, XAuthMissingError } from '../../api/src/lib/twitter-auth-graphql';
import { xFirehoseProbeBatchHandler } from '../../api/src/routes/x-firehose';

const mockFetch = fetchAuthedTimeline as unknown as ReturnType<typeof vi.fn>;

interface ProbeOut {
  body: { results: Record<string, { count: number; status: string }>; elapsed_ms: number; error?: string };
  status: number;
}

function makeCtx(body: unknown) {
  const c = {
    req: { json: async () => body },
    env: {},
    executionCtx: { waitUntil: () => {} },
    json: (b: unknown, status = 200) => ({ body: b, status }),
  };
  return c as never;
}

async function run(body: unknown): Promise<ProbeOut> {
  return (await xFirehoseProbeBatchHandler(makeCtx(body))) as unknown as ProbeOut;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Perpetual cache-miss: rate-limited probes fall through to the
  // rate_limited classification instead of being rescued by a stale entry.
  (globalThis as unknown as { caches: unknown }).caches = {
    default: { match: () => Promise.resolve(undefined), put: () => Promise.resolve(undefined) },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

describe('xFirehoseProbeBatchHandler', () => {
  it('returns 400 when there are no valid handles', async () => {
    const res = await run({ handles: ['bad handle!', ''] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no valid handles');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('filters out malformed handles and probes only valid ones', async () => {
    mockFetch.mockResolvedValue({ items: [{}] });
    const res = await run({ handles: ['valid_handle', 'has space', 'way_too_long_to_be_valid'] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.results)).toEqual(['valid_handle']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports ok with item counts for successful handles', async () => {
    mockFetch.mockResolvedValueOnce({ items: [{}, {}, {}] }).mockResolvedValueOnce({ items: [{}] });
    const res = await run({ handles: ['handle_one', 'handle_two'] });
    expect(res.status).toBe(200);
    expect(res.body.results['handle_one']).toEqual({ count: 3, status: 'ok' });
    expect(res.body.results['handle_two']).toEqual({ count: 1, status: 'ok' });
  });

  it('short-circuits the failing handle and the rest as rate_limited on a 429', async () => {
    mockFetch.mockResolvedValueOnce({ items: [{}] }).mockRejectedValueOnce(new XAuthRateLimitedError());
    const res = await run({ handles: ['aaa', 'bbb', 'ccc'] });
    expect(res.body.results['aaa']).toEqual({ count: 1, status: 'ok' });
    expect(res.body.results['bbb']).toEqual({ count: 0, status: 'rate_limited' });
    expect(res.body.results['ccc']).toEqual({ count: 0, status: 'rate_limited' });
    expect(mockFetch).toHaveBeenCalledTimes(2); // ccc is never fetched
  });

  it('marks the failing handle and the rest as error on auth failure', async () => {
    mockFetch.mockRejectedValueOnce(new XAuthMissingError());
    const res = await run({ handles: ['aaa', 'bbb'] });
    expect(res.body.results['aaa']).toEqual({ count: 0, status: 'error' });
    expect(res.body.results['bbb']).toEqual({ count: 0, status: 'error' });
    expect(mockFetch).toHaveBeenCalledTimes(1); // bbb is never fetched
  });

  it('classifies a user-resolution failure as not_found', async () => {
    mockFetch.mockRejectedValueOnce(new Error('UserByScreenName returned no result'));
    const res = await run({ handles: ['ghost'] });
    expect(res.body.results['ghost']).toEqual({ count: 0, status: 'not_found' });
  });

  it('classifies an unknown upstream failure as error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('graphql HTTP 500'));
    const res = await run({ handles: ['boom'] });
    expect(res.body.results['boom']).toEqual({ count: 0, status: 'error' });
  });
});
