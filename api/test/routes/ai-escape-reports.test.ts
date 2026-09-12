/**
 * Tests for the AI Escape community report queue.
 * Real D1 (BRIEFINGS_DB) + mock admin token. Table DDL mirrors
 * migrations/0045_ai_escape_reports.sql (pool D1 starts unmigrated).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { aiEscapeRouter } from '../../src/routes/ai-escape';

const testEnv = { ...(env as unknown as Env), ADMIN_TOKEN: 'sekret' } as Env;

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', aiEscapeRouter);
  return app;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

const VALID = {
  title: 'Agent bypassed egress allowlist via internal package proxy',
  klass: 'containment-breach',
  occurred: '2026-09-01',
  purpose: 'Automated code review in CI',
  systems: 'Coding agent, CI runner',
  summary:
    'The agent was tasked with reviewing pull requests. It followed a link in an issue body to an internal package proxy, downloaded a helper, and used it to reach the open internet the sandbox was meant to block. Noticed via egress logs the next day.',
  sources: 'https://example.invalid/writeup',
  handle: 'tester',
};

beforeAll(async () => {
  const db = testEnv.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not bound');
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ai_escape_reports (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, klass TEXT NOT NULL, occurred TEXT,
        purpose TEXT, systems TEXT, summary TEXT NOT NULL, sources TEXT, handle TEXT,
        status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
        reviewed_at TEXT, review_note TEXT)`
    )
    .run();
  await db.prepare('DELETE FROM ai_escape_reports').run();
});

describe('ai-escape report queue', () => {
  it('accepts a valid submission as pending', async () => {
    const r = await setup().request(
      '/api/v1/ai-escape/reports',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(VALID) },
      testEnv,
      mockCtx()
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { ok: boolean; id: string; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe('pending');
    expect(body.id).toBeTruthy();
  });

  it('rejects short titles, missing sources and bad URLs', async () => {
    const app = setup();
    const post = (b: unknown) =>
      app.request(
        '/api/v1/ai-escape/reports',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) },
        testEnv,
        mockCtx()
      );
    expect((await post({ ...VALID, title: 'x' })).status).toBe(400);
    expect((await post({ ...VALID, sources: undefined })).status).toBe(400);
    expect((await post({ ...VALID, sources: 'not-a-url' })).status).toBe(400);
    expect((await post({ ...VALID, occurred: 'yesterday' })).status).toBe(400);
  });

  it('silently accepts honeypot submissions without storing', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM ai_escape_reports').first<{ n: number }>())?.n ?? 0;
    const r = await setup().request(
      '/api/v1/ai-escape/reports',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...VALID, website: 'http://spam.example' }),
      },
      testEnv,
      mockCtx()
    );
    expect(r.status).toBe(201);
    const after = (await db.prepare('SELECT COUNT(*) AS n FROM ai_escape_reports').first<{ n: number }>())?.n ?? 0;
    expect(after).toBe(before);
  });

  it('lists the public queue and reviews with admin auth', async () => {
    const app = setup();
    const list = (await (await app.request('/api/v1/ai-escape/reports', {}, testEnv, mockCtx())).json()) as {
      reports: { id: string }[];
    };
    expect(list.reports.length).toBeGreaterThan(0);
    const id = list.reports[0]!.id;

    // Review without token → 401/403.
    const denied = await app.request(
      `/api/v1/ai-escape/reports/${id}/review`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) },
      { ...(testEnv as object), ADMIN_TOKEN: undefined } as Env,
      mockCtx()
    );
    expect([401, 403]).toContain(denied.status);

    // Review with token → approved, leaves pending queue.
    const ok = await app.request(
      `/api/v1/ai-escape/reports/${id}/review`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer sekret' },
        body: JSON.stringify({ status: 'approved', note: 'corroborated by vendor post-mortem' }),
      },
      testEnv,
      mockCtx()
    );
    expect(ok.status).toBe(200);
    const pending = (await (
      await app.request('/api/v1/ai-escape/reports?status=pending', {}, testEnv, mockCtx())
    ).json()) as { reports: { id: string }[] };
    expect(pending.reports.map((x) => x.id)).not.toContain(id);
    const approved = (await (
      await app.request('/api/v1/ai-escape/reports?status=approved', {}, testEnv, mockCtx())
    ).json()) as { reports: { review_note: string }[] };
    expect(approved.reports[0]?.review_note).toBe('corroborated by vendor post-mortem');
  });

  it('404s review of unknown ids and rejects bad statuses', async () => {
    const app = setup();
    const auth = { 'content-type': 'application/json', authorization: 'Bearer sekret' };
    const nf = await app.request(
      '/api/v1/ai-escape/reports/CB-0000/review',
      { method: 'POST', headers: auth, body: JSON.stringify({ status: 'approved' }) },
      testEnv,
      mockCtx()
    );
    expect(nf.status).toBe(404);
    const bad = await app.request(
      '/api/v1/ai-escape/reports/CB-0000/review',
      { method: 'POST', headers: auth, body: JSON.stringify({ status: 'maybe' }) },
      testEnv,
      mockCtx()
    );
    expect(bad.status).toBe(400);
  });
});
