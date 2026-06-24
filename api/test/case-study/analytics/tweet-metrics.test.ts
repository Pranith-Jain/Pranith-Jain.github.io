import { describe, it, expect, vi } from 'vitest';
import { extractTweetId, fetchTweetMetrics } from '../../../src/case-study/analytics/tweet-metrics';

describe('extractTweetId', () => {
  it('pulls the numeric id from a status URL', () => {
    expect(extractTweetId('https://twitter.com/pranith/status/1790000000000000001')).toBe('1790000000000000001');
    expect(extractTweetId('https://x.com/i/web/status/123')).toBe('123');
  });
  it('returns null when there is no status id', () => {
    expect(extractTweetId('https://example.com/foo')).toBeNull();
    expect(extractTweetId(undefined)).toBeNull();
  });
});

function okResp(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('fetchTweetMetrics', () => {
  it('maps X public_metrics to SocialMetrics (retweets+quotes → reposts)', async () => {
    const fetchImpl = vi.fn(async () =>
      okResp({
        data: {
          public_metrics: { like_count: 42, retweet_count: 5, quote_count: 2, reply_count: 9, impression_count: 1000 },
        },
      })
    ) as unknown as typeof fetch;
    const m = await fetchTweetMetrics('123', 'BEARER', fetchImpl);
    expect(m).toEqual({ likes: 42, reposts: 7, replies: 9, impressions: 1000 });
  });

  it('sends a Bearer auth header to the public_metrics endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okResp({ data: { public_metrics: {} } });
    }) as unknown as typeof fetch;
    await fetchTweetMetrics('999', 'TOKENXYZ', fetchImpl);
    expect(calls[0]!.url).toContain('/2/tweets/999');
    expect(calls[0]!.url).toContain('tweet.fields=public_metrics');
    expect(new Headers(calls[0]!.init!.headers).get('authorization')).toBe('Bearer TOKENXYZ');
  });

  it('returns null (never throws) on an API error', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchTweetMetrics('1', 'B', fetchImpl)).toBeNull();
  });
});
