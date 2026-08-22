/**
 * Tests for the saved-report sharing endpoints (Fleet-parity branded shares).
 *
 * Handlers hit D1 (BRIEFINGS_DB); the binding is stubbed with an in-memory
 * prepare/first/run emulation covering the exact statements the handlers use.
 * Run: npx vitest run api/test/routes/saved-reports-share.test.ts
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { setBranding, shareSavedReport, unshareSavedReport, getSharedReport } from '../../src/routes/saved-reports';

/** Minimal in-memory D1 stub for the four statements the share flow uses. */
function makeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const byToken = new Map<string, string>();
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('SELECT id FROM saved_reports WHERE id = ?')) {
                return rows.get(args[0] as string) ?? null;
              }
              if (sql.includes('WHERE share_token = ?')) {
                const id = byToken.get(args[0] as string);
                return id ? (rows.get(id) ?? null) : null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith('UPDATE saved_reports SET branding_json')) {
                const row = rows.get(args[1] as string);
                if (!row) return { success: false };
                row.branding_json = args[0] as string | null;
                return { success: true };
              }
              if (sql.startsWith('UPDATE saved_reports SET share_token = NULL')) {
                const row = rows.get(args[0] as string);
                if (row) {
                  const tok = row.share_token as string | null;
                  if (tok) byToken.delete(tok);
                  row.share_token = null;
                  row.shared_at = null;
                }
                return { success: true };
              }
              if (sql.startsWith('UPDATE saved_reports SET share_token')) {
                const row = rows.get(args[2] as string);
                if (!row) return { success: false };
                row.share_token = args[0] as string | null;
                row.shared_at = args[1] as string | null;
                byToken.set(args[0] as string, args[2] as string);
                return { success: true };
              }
            },
          };
        },
      };
    },
  };
  return { db, rows, byToken };
}

const TOKEN_RE = /^[0-9a-f]{32}$/;

function makeApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/v1/*', async (_c, next) => next()); // auth handled at app level
  app.post('/api/v1/saved-reports/:id/branding', setBranding);
  app.post('/api/v1/saved-reports/:id/share', shareSavedReport);
  app.delete('/api/v1/saved-reports/:id/share', unshareSavedReport);
  app.get('/api/v1/public/report/:token', getSharedReport);
  return app;
}

function envOf(db: unknown): Env {
  return { BRIEFINGS_DB: db } as unknown as Env;
}

describe('saved-report sharing', () => {
  it('mints a 32-hex token and serves the public payload; revoke kills it', async () => {
    const mem = makeDb();
    mem.rows.set('rep-1', {
      id: 'rep-1',
      title: 'Ransomware Incident ACME',
      source_url: 'https://example.com/src',
      report_json: JSON.stringify({
        summary: 'LockBit affiliate',
        iocs: { ipv4: ['1.2.3.4'] },
        mitre_techniques: [{ id: 'T1486' }],
      }),
      text_length: 4200,
      ioc_count: 7,
      ttp_count: 4,
      cve_count: 0,
      created_at: '2026-08-22T00:00:00Z',
      shared_at: null,
      share_token: null,
      branding_json: null,
    });
    const env = envOf(mem.db);

    let app = makeApp();
    let r = await app.request('/api/v1/saved-reports/rep-1/share', { method: 'POST' }, env);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { token: string; url: string };
    expect(body.token).toMatch(TOKEN_RE);
    expect(body.url).toBe(`/share/report/${body.token}`);

    // Public read — no key, capability token only.
    r = await app.request(`/api/v1/public/report/${body.token}`, {}, env);
    expect(r.status).toBe(200);
    const pub = (await r.json()) as { title: string; report: { summary?: string }; branding: unknown };
    expect(pub.title).toBe('Ransomware Incident ACME');
    expect(pub.report?.summary).toContain('LockBit');

    // Revoke → public read 404s.
    r = await app.request('/api/v1/saved-reports/rep-1/share', { method: 'DELETE' }, env);
    expect(r.status).toBe(200);
    r = await app.request(`/api/v1/public/report/${body.token}`, {}, env);
    expect(r.status).toBe(404);
  });

  it('rejects malformed tokens and unknown ids', async () => {
    const mem = makeDb();
    const env = envOf(mem.db);
    const app = makeApp();

    const bad = await app.request('/api/v1/public/report/ZZZZ-not-hex', {}, env);
    expect(bad.status).toBe(404);

    const missing = await app.request('/api/v1/saved-reports/nope/share', { method: 'POST' }, env);
    expect(missing.status).toBe(404);
  });

  it('stores normalized branding and rejects dangerous values', async () => {
    const mem = makeDb();
    mem.rows.set('rep-2', { id: 'rep-2', title: 'T', share_token: null });
    const env = envOf(mem.db);
    const app = makeApp();

    const ok = await app.request(
      '/api/v1/saved-reports/rep-2/branding',
      {
        method: 'POST',
        body: JSON.stringify({ branding: { orgName: 'ACME SOC', accent: '#4f46e5', classification: 'TLP:AMBER' } }),
      },
      env
    );
    expect(ok.status).toBe(200);
    expect(mem.rows.get('rep-2')!.branding_json).toContain('ACME SOC');

    const evil = await app.request(
      '/api/v1/saved-reports/rep-2/branding',
      { method: 'POST', body: JSON.stringify({ branding: { logoUrl: 'javascript:alert(1)' } }) },
      env
    );
    expect(evil.status).toBe(400);
  });
});
