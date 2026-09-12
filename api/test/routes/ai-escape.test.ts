/**
 * Tests for the AI Escape Watch routes (/api/v1/ai-escape*).
 *
 * Same stub-ASSETS approach as ransomware-groups.test.ts. Run from the
 * repo root with the api workers pool (sandbox disabled).
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { aiEscapeRouter } from '../../src/routes/ai-escape';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/ai-escape/index.json', {
    registry: 'test',
    version: 'v0.1',
    compiled: '2026-09-06',
    builtAt: new Date().toISOString(),
    cbsScale: 'v0.1 draft',
    cbsWeights: { AUTONOMY: 2.0 },
    chainStages: ['PRESSURE', 'PROBE', 'BREACH', 'CHANNEL', 'ESCALATE', 'PROPAGATE', 'HALT'],
    stats: {
      entries: 2,
      tierA: 1,
      evalEnvBreaches: 1,
      autonomous: 1,
      medianDwellDays: 7,
      dwellRange: [7, 7],
      mostAbsentGuardrail: { id: 'TELEMETRY', entries: 2 },
      lastDisclosedAt: '2026-09-09',
      lastDisclosedId: 'CB-2026-0016',
      jobExactCount: 1,
    },
    guardrailCounts: { EGRESS: 1, TELEMETRY: 2 },
    incidents: [
      {
        id: 'CB-2026-0016',
        title: 'Wiki edits',
        klass: 'injection',
        sev: 'contained',
        tier: 'C',
        cbs: 3.2,
        occurred: '2026-09-04',
        disclosed: '2026-09-09',
        dwell: null,
        autonomous: false,
        developer: 'Unattributed',
        purpose: 'probing',
        failed: [],
      },
      {
        id: 'CB-2026-0010',
        title: 'Cluster breach',
        klass: 'containment-breach',
        sev: 'critical',
        tier: 'A',
        cbs: 9.6,
        occurred: '2026-07-09',
        disclosed: '2026-07-16',
        dwell: 7,
        autonomous: true,
        developer: 'OpenAI',
        purpose: 'evaluation',
        failed: ['ISOLATION', 'TELEMETRY'],
      },
    ],
  });

  data.set('/data/ai-escape/incidents/CB-2026-0010.json', {
    id: 'CB-2026-0010',
    title: 'Cluster breach',
    klass: 'containment-breach',
    sev: 'critical',
    tier: 'A',
    cbs: 9.6,
    occurred: '2026-07-09',
    disclosed: '2026-07-16',
    dwell: 7,
    autonomous: true,
    developer: 'OpenAI',
    purpose: 'evaluation',
    failed: ['ISOLATION', 'TELEMETRY'],
    actor: 'agents',
    systems: 'platform',
    targets: 'prod',
    summary: 'Escaped and escalated.',
    disputed: null,
    chain: { PRESSURE: 'p', PROBE: null, BREACH: 'b', CHANNEL: null, ESCALATE: 'e', PROPAGATE: null, HALT: 'h' },
    sources: [{ label: 'First-party timeline', url: 'https://example.invalid/timeline' }],
  });

  data.set('/data/ai-escape/guardrails.json', {
    guardrails: [{ id: 'EGRESS', title: 'Egress', def: 'Allowlist only.' }],
  });
  data.set('/data/ai-escape/trackers.json', {
    trackers: [{ name: 'T', url: 'https://example.invalid/', kind: 'lab', holds: 'logs', checked: '2026-09-06' }],
  });

  return {
    fetch: vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname;
      const hit = data.get(path);
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(hit), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  } as unknown as Fetcher;
}

function makeEnv(): Env {
  return { ASSETS: makeAssets() } as Env;
}

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', aiEscapeRouter);
  return app;
}

describe('ai-escape routes', () => {
  it('GET / returns registry meta + stats', async () => {
    const r = await setup().request('/api/v1/ai-escape/', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      version: string;
      stats: { entries: number };
      guardrailCounts: Record<string, number>;
    };
    expect(body.version).toBe('v0.1');
    expect(body.stats.entries).toBe(2);
    expect(body.guardrailCounts.TELEMETRY).toBe(2);
  });

  it('GET /incidents filters by klass + guardrail + autonomy', async () => {
    const app = setup();
    const env = makeEnv();
    const byKlass = (await (await app.request('/api/v1/ai-escape/incidents?klass=injection', {}, env)).json()) as {
      incidents: { id: string }[];
    };
    expect(byKlass.incidents.map((e) => e.id)).toEqual(['CB-2026-0016']);
    const byGuard = (await (await app.request('/api/v1/ai-escape/incidents?guardrail=TELEMETRY', {}, env)).json()) as {
      incidents: { id: string }[];
    };
    expect(byGuard.incidents.map((e) => e.id)).toEqual(['CB-2026-0010']);
    const byAuto = (await (await app.request('/api/v1/ai-escape/incidents?autonomous=true', {}, env)).json()) as {
      incidents: { id: string }[];
    };
    expect(byAuto.incidents.map((e) => e.id)).toEqual(['CB-2026-0010']);
  });

  it('GET /incidents/:id is case-insensitive and returns the docket', async () => {
    const r = await setup().request('/api/v1/ai-escape/incidents/cb-2026-0010', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { chain: { BREACH: string }; sources: unknown[] };
    expect(body.chain.BREACH).toBe('b');
    expect(body.sources).toHaveLength(1);
  });

  it('GET /incidents/:id 404s unknown ids', async () => {
    const r = await setup().request('/api/v1/ai-escape/incidents/CB-1999-0000', {}, makeEnv());
    expect(r.status).toBe(404);
  });

  it('GET /guardrails, /trackers, /timeline return reference docs', async () => {
    const app = setup();
    const env = makeEnv();
    const g = (await (await app.request('/api/v1/ai-escape/guardrails', {}, env)).json()) as {
      guardrails: unknown[];
    };
    expect(g.guardrails).toHaveLength(1);
    const t = (await (await app.request('/api/v1/ai-escape/trackers', {}, env)).json()) as {
      trackers: unknown[];
    };
    expect(t.trackers).toHaveLength(1);
    const tl = (await (await app.request('/api/v1/ai-escape/timeline', {}, env)).json()) as {
      buckets: { month: string }[];
    };
    expect(tl.buckets.map((b) => b.month)).toEqual(['2026-07', '2026-09']);
  });
});
