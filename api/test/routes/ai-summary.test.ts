/**
 * Route tests for /api/v1/ai-summary and /api/v1/ai-item-summary.
 *
 * Uses the mini-app pattern (see unified-search-summarize.test.ts): only the
 * route under test + the real validate middleware, so the global same-origin
 * auth gate in index.ts is not exercised. The LLM (runCompletion) is stubbed
 * so the test is offline + deterministic.
 *
 * Run locally (sandbox disabled) per docs/loops/api-tests-unsandboxed.md:
 *   npx vitest run test/routes/ai-summary.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { validate } from '../../src/lib/validate';
import { aiSummarySchema, aiItemSummarySchema } from '../../src/lib/validation-schemas';
import { aiSummaryHandler } from '../../src/routes/ai-summary';
import { aiItemSummaryHandler } from '../../src/routes/ai-item-summary';

// Stub runCompletion so the test is offline + deterministic. Both AI summary
// libs import runCompletion from case-study/generation/ai-client; mocking the
// module once covers both. The stub returns a canned two-part summary
// (full summary + tweet, separated by ---TWEET---) matching the real contract.
vi.mock('../../src/case-study/generation/ai-client', () => ({
  runCompletion: vi.fn(async () => ({
    text: '**Headline**: Stub threat summary.\n- Theme one\n- Theme two\n\nAnalyst takeaway: patch now.\n---TWEET---\nStub tweet #ThreatIntel',
    modelUsed: 'groq:stub-model',
  })),
}));

function app() {
  const a = new Hono<{ Bindings: any }>();
  a.post('/api/v1/ai-summary', validate('json', aiSummarySchema), aiSummaryHandler);
  a.post('/api/v1/ai-item-summary', validate('json', aiItemSummarySchema), aiItemSummaryHandler);
  return a;
}

const env = (): any => ({ ...testEnv });

function postSummary(body: unknown) {
  return app().request(
    '/api/v1/ai-summary',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env()
  );
}

function postItemSummary(body: unknown) {
  return app().request(
    '/api/v1/ai-item-summary',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env()
  );
}

describe('POST /api/v1/ai-summary (mini-app)', () => {
  it('400s when surface is missing', async () => {
    const r = await postSummary({ date: '2026-08-04', items: [{ title: 't', body: 'b' }] });
    expect(r.status).toBe(400);
  });

  it('400s when date is malformed (not YYYY-MM-DD)', async () => {
    const r = await postSummary({ surface: 'Test', date: '08-04-2026', items: [{ title: 't', body: 'b' }] });
    expect(r.status).toBe(400);
  });

  it('400s when items is empty', async () => {
    const r = await postSummary({ surface: 'Test', date: '2026-08-04', items: [] });
    expect(r.status).toBe(400);
  });

  it('400s when items exceeds 50', async () => {
    const items = Array.from({ length: 51 }, () => ({ title: 't', body: 'b' }));
    const r = await postSummary({ surface: 'Test', date: '2026-08-04', items });
    expect(r.status).toBe(400);
  });

  it('400s on invalid JSON', async () => {
    const r = await app().request(
      '/api/v1/ai-summary',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' },
      env()
    );
    expect(r.status).toBe(400);
  });

  it('returns a summary on a valid request', async () => {
    const r = await postSummary({
      surface: 'TestSurface-' + Date.now(),
      date: '2026-08-04',
      items: [{ title: 'CVE-2026-9999 in foo', body: 'Critical RCE in foo library', source: 'test' }],
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { summary: string; tweet: string; modelUsed: string; itemCount: number };
    expect(body.summary).toContain('Headline');
    expect(body.tweet).toContain('#ThreatIntel');
    expect(body.itemCount).toBeGreaterThanOrEqual(1);
  });

  it('serves a cached summary on the second call (same surface + date)', async () => {
    const surface = 'CacheTest-' + Date.now();
    const date = '2026-08-04';
    const payload = { surface, date, items: [{ title: 'Cached item', body: 'body text' }] };
    const first = await postSummary(payload);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { summary: string };
    const second = await postSummary(payload);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { summary: string };
    expect(secondBody.summary).toBe(firstBody.summary);
  });
});

describe('POST /api/v1/ai-item-summary (mini-app)', () => {
  it('400s when items is missing', async () => {
    const r = await postItemSummary({ surface: 'Test' });
    expect(r.status).toBe(400);
  });

  it('400s when items is empty', async () => {
    const r = await postItemSummary({ items: [] });
    expect(r.status).toBe(400);
  });

  it('returns summaries keyed by id on a valid request', async () => {
    const r = await postItemSummary({
      surface: 'TestSurface',
      items: [
        { id: 'post-1', title: 'First item', body: 'body one' },
        { id: 'post-2', title: 'Second item', body: 'body two' },
      ],
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { summaries: Record<string, string>; modelHint: string };
    expect(body.modelHint).toBe('groq:openai/gpt-oss-120b');
    // The stub never fails, so every submitted id should get a summary.
    expect(Object.keys(body.summaries)).toEqual(expect.arrayContaining(['post-1', 'post-2']));
  });

  it('caps to 10 items even when more are sent', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: `id-${i}`, title: `t-${i}`, body: `b-${i}` }));
    const r = await postItemSummary({ surface: 'CapTest', items });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { summaries: Record<string, string> };
    // The handler caps at 10; the stub succeeds for every item so we expect ≤10.
    expect(Object.keys(body.summaries).length).toBeLessThanOrEqual(10);
  });
});
