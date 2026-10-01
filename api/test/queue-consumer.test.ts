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

describe('queue consumer digestWarm path', () => {
  // The global beforeEach stubs fetch → 502, so every upstream (ctiwatch
  // mint, pages, VulnTracker, EPSS) fails: the warm reports ok:false and the
  // message must be retried, not acked and not persisted as an empty digest.
  it('retries (never acks an empty digest) when upstreams are down', async () => {
    const batch = makeBatch({ digestWarm: true });
    await handleQueue(batch, env as any, fakeCtx);
    expect(batch.messages[0].retry).toHaveBeenCalled();
    expect(batch.messages[0].ack).not.toHaveBeenCalled();
    expect(await env.KV_CACHE.get('cve-digest:lastgood')).toBeNull();
  }, 20_000);

  it('builds, persists and acks when upstreams answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://ctiwatch.com/nonexistent-xyz')) {
        return new Response('', {
          status: 404,
          headers: { 'set-cookie': 'cti_anon=test-cookie-123; Path=/; Max-Age=86400' },
        });
      }
      if (url.startsWith('https://ctiwatch.com/api/v1/vulnerabilities')) {
        return new Response(
          JSON.stringify({
            total: 1,
            items: [
              {
                cve_id: 'CVE-2026-50001',
                cvss_score: '9.8',
                severity: 'CRITICAL',
                description: 'Queue-warmed 0-day',
                // A minute in the PAST, not `now`: fetchCveDigest captures
                // windowEnd before the fan-out, so a row stamped at request
                // time lands after the window and filterToWindow drops it —
                // which reads as a skipped-empty warm (ok:false → retry).
                published_date: new Date(Date.now() - 60_000).toISOString(),
                exploit_status: 'weaponized',
                is_in_kev: true,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('', { status: 502 });
    });
    const batch = makeBatch({ digestWarm: true });
    await handleQueue(batch, env as any, fakeCtx);
    expect(batch.messages[0].ack).toHaveBeenCalled();
    expect(batch.messages[0].retry).not.toHaveBeenCalled();
    const raw = await env.KV_CACHE.get('cve-digest:lastgood');
    expect(raw).toBeTruthy();
    const body = JSON.parse(raw!);
    expect(body.count).toBe(1);
    expect(body.entries[0].cve_id).toBe('CVE-2026-50001');
    expect(body.entries[0].severity).toBe('CRITICAL');
  }, 30_000);
});
