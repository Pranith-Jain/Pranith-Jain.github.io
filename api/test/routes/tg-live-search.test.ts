/**
 * Tests for the stateless live keyword search (/api/v1/tg-live-search).
 * Upstream t.me/s HTML is mocked. Asserts the no-DB contract implicitly:
 * the handler never touches KV/D1 (only Cache API + fetch).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { tgLiveSearchHandler } from '../../src/routes/telegram-feed';

const NOW = new Date().toISOString();

function channelHtml(handle: string, posts: { id: number; text: string; views?: string }[]): string {
  return posts
    .map(
      (p) => `<div class="tgme_widget_message_wrap js-widget_message_wrap">
  <div class="tgme_widget_message text_not_supported_wrap">
    <div class="tgme_widget_message_user"><a href="https://t.me/${handle}"><i></i></a></div>
    <div class="tgme_widget_message_bubble">
      <div class="tgme_widget_message_text js-message_text" dir="auto">${p.text}</div>
      <div class="tgme_widget_message_footer">
        <span class="tgme_widget_message_views">${p.views ?? '1.2K'}</span>
        <a class="tgme_widget_message_date" href="https://t.me/${handle}/${p.id}"><time datetime="${NOW}">today</time></a>
      </div>
    </div>
  </div>
</div>`
    )
    .join('\n');
}

const CVE_HTML = channelHtml('CVEDetector', [
  { id: 101, text: 'CVE-2026-1234 critical RCE in ExampleSoft — patch now' },
  { id: 102, text: 'Daily digest: assorted security news and updates' },
]);
const NEWS_HTML = channelHtml('IntCyberDigest', [
  { id: 201, text: 'Ransomware gang claims new victim in manufacturing' },
]);

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/api/v1/tg-live-search', tgLiveSearchHandler);
  return app;
}

function makeEnv(): Env {
  return {} as Env;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function req(app: ReturnType<typeof setup>, path: string, env: Env) {
  return app.request(path, {}, env, mockCtx());
}

function mockFetchFor(map: Record<string, string | null>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const m = /t\.me\/s\/([^/?]+)/.exec(url);
    const html = m ? map[m[1]!] : undefined;
    if (html === undefined || html === null) return new Response('not found', { status: 404 });
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  });
}

beforeEach(() => vi.restoreAllMocks());

describe('tg-live-search route', () => {
  it('matches AND-tokens across channels and returns snippets', async () => {
    mockFetchFor({ CVEDetector: CVE_HTML, IntCyberDigest: NEWS_HTML });
    const r = await req(
      setup(),
      '/api/v1/tg-live-search?q=CVE-2026-1234%20RCE&channels=CVEDetector,IntCyberDigest',
      makeEnv()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      count: number;
      channels: { handle: string; ok: boolean; messages: number }[];
      hits: { channel_handle: string; matched: string[]; snippet: string; permalink: string }[];
      storage: string;
    };
    expect(body.count).toBe(1);
    expect(body.hits[0]?.channel_handle).toBe('CVEDetector');
    expect(body.hits[0]?.matched).toEqual(['cve-2026-1234', 'rce']);
    expect(body.hits[0]?.snippet).toContain('CVE-2026-1234');
    expect(body.hits[0]?.permalink).toContain('t.me/CVEDetector/101');
    expect(body.channels).toHaveLength(2);
    expect(body.channels.every((ch) => ch.ok)).toBe(true);
    expect(body.storage).toContain('none');
  });

  it('reports dead channels as diagnostics instead of failing', async () => {
    mockFetchFor({ CVEDetector: CVE_HTML });
    const r = await req(setup(), '/api/v1/tg-live-search?q=cve&channels=CVEDetector,breachdetect', makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      count: number;
      channels: { handle: string; ok: boolean }[];
    };
    expect(body.count).toBeGreaterThan(0);
    expect(body.channels.find((ch) => ch.handle === 'breachdetect')?.ok).toBe(false);
  });

  it('uses the default CVE/breach scope when channels are omitted', async () => {
    mockFetchFor({ CVEDetector: CVE_HTML });
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await req(setup(), '/api/v1/tg-live-search?q=cve&fresh=1', makeEnv());
    expect(r.status).toBe(200);
    const fetched = spy.mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes('t.me/s/CVEDetector'))).toBe(true);
    expect(fetched.some((u) => u.includes('t.me/s/ctiwatch'))).toBe(true);
    // Default scope is 8 channels max.
    expect(new Set(fetched).size).toBeLessThanOrEqual(16); // ≤8 channels × ≤2 attempts
  });

  it('rejects missing/short queries, bad handles and over-long input', async () => {
    const app = setup();
    const env = makeEnv();
    expect((await app.request('/api/v1/tg-live-search', {}, env, mockCtx())).status).toBe(400);
    expect((await app.request('/api/v1/tg-live-search?q=x', {}, env, mockCtx())).status).toBe(400);
    expect((await app.request('/api/v1/tg-live-search?q=cve&channels=bad-handle!', {}, env, mockCtx())).status).toBe(
      400
    );
    expect((await app.request(`/api/v1/tg-live-search?q=${'a'.repeat(201)}`, {}, env, mockCtx())).status).toBe(400);
  });
});
