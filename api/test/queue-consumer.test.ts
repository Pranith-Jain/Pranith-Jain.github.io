import { env } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleQueue } from '../../worker/queue-consumer';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeBatch(msg: unknown): any {
  return {
    messages: [
      {
        body: msg,
        id: 'test-1',
        timestamp: new Date(),
        attempts: 0,
        ack: vi.fn(),
        retry: vi.fn(),
      },
    ],
    queue: 'live-iocs-feeds',
  };
}

const fakeCtx = {
  waitUntil: (p: Promise<unknown>) => void p,
  passThroughOnException: () => {},
} as any;

describe('queue consumer gp path', () => {
  it('warms the gp:warm KV slice from an in-process feed fetch and acks', async () => {
    const batch = makeBatch({ gp: { key: 'reddit', path: '/api/v1/reddit-feed' } });
    await handleQueue(batch, env as any, fakeCtx);
    expect(batch.messages[0].ack).toHaveBeenCalled();
    expect(batch.messages[0].retry).not.toHaveBeenCalled();
    // The warm slice must land in KV so the global-pulse read path can serve
    // it — regression for the gp:warm write path (global-pulse layers going
    // dark when the slice was never persisted).
    const val = await env.KV_CACHE.get('gp:warm:reddit');
    expect(val).toBeTruthy();
    expect(val!.length).toBeGreaterThan(1000);
    const parsed = JSON.parse(val!);
    expect(parsed.generated_at).toBeDefined();
    expect(Array.isArray(parsed.subs)).toBe(true);
  }, 20_000);
});
