import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes } from '../../src/routes/case-study-admin';
import type { Candidate } from '../../src/case-study/types';

function mockEnv(): any {
  const store = new Map<string, string>();
  const kv = {
    async get(k: string, t?: 'json') {
      const v = store.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list(opts: { prefix: string }) {
      return {
        keys: Array.from(store.keys())
          .filter((k) => k.startsWith(opts.prefix))
          .map((name) => ({ name })),
        list_complete: true,
        cursor: '',
      };
    },
  };
  return { CASE_STUDIES: kv, ADMIN_TOKEN: 'sekret', __store: store };
}

function app() {
  const a = new Hono<any>();
  registerAdminRoutes(a);
  return a;
}

const cand: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'X',
  rationale: 'r',
  score: 0.9,
  evidence: {},
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
};

describe('admin routes', () => {
  it('rejects requests without token', async () => {
    const r = await app().request('/api/v1/admin/candidates', {}, mockEnv());
    expect(r.status).toBe(401);
  });

  it('accepts requests with token via header', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      '/api/v1/admin/candidates',
      {
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.pending).toHaveLength(1);
  });

  it('approve moves candidate from pending to approved', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/approve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`approved:${cand.key}`)).toBe(true);
  });

  it('skip removes a candidate', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`candidates:cve:${cand.key}`)).toBe(false);
  });

  it('skip writes a 30-day suppression record', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
    expect(dedup[cand.key].suppressedUntil).toBeTruthy();
    expect(new Date(dedup[cand.key].suppressedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('skip-all clears every pending candidate and suppresses them', async () => {
    const env = mockEnv();
    env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
    env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
    const r = await app().request(
      '/api/v1/admin/candidates/skip-all',
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.cleared).toBe(2);
    expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
    expect(env.__store.has('candidates:actor:actor-1')).toBe(false);
    const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
    expect(dedup['cve-1'].suppressedUntil).toBeTruthy();
    expect(dedup['actor-1'].suppressedUntil).toBeTruthy();
  });

  it('skip-all with ?type clears only that type', async () => {
    const env = mockEnv();
    env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
    env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
    const r = await app().request(
      '/api/v1/admin/candidates/skip-all?type=cve',
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).cleared).toBe(1);
    expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
    expect(env.__store.has('candidates:actor:actor-1')).toBe(true);
  });
});
