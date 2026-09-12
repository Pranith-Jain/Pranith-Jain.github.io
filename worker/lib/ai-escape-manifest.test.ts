/**
 * Tests for the AI Escape manifest loader.
 * Run via: npx vitest run worker/lib/ai-escape-manifest.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadEscapeIndex,
  getEscapeIncident,
  loadEscapeGuardrails,
  loadEscapeTrackers,
  filterEscapes,
  escapeTimelineBuckets,
  escapeCacheStats,
  _resetEscapeCacheForTests,
  type EscapeIndex,
} from './ai-escape-manifest';

const INDEX: EscapeIndex = {
  registry: 'test',
  version: 'v0.1',
  compiled: '2026-09-06',
  builtAt: new Date().toISOString(),
  cbsScale: 'v0.1 draft',
  cbsWeights: { AUTONOMY: 2.0 },
  chainStages: ['PRESSURE', 'PROBE', 'BREACH', 'CHANNEL', 'ESCALATE', 'PROPAGATE', 'HALT'],
  stats: {
    entries: 3,
    tierA: 2,
    evalEnvBreaches: 1,
    autonomous: 2,
    medianDwellDays: 5,
    dwellRange: [0, 114],
    mostAbsentGuardrail: { id: 'TELEMETRY', entries: 3 },
    lastDisclosedAt: '2026-09-09',
    lastDisclosedId: 'CB-2026-0016',
    jobExactCount: 1,
  },
  guardrailCounts: { EGRESS: 2, TELEMETRY: 3 },
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
    {
      id: 'CB-2025-0002',
      title: 'Credential harvest',
      klass: 'supply-chain',
      sev: 'notable',
      tier: 'A',
      cbs: 7.1,
      occurred: '2025-08-01',
      disclosed: '2025-08-01',
      dwell: 0,
      autonomous: false,
      developer: '—',
      purpose: 'build tasks',
      failed: ['SUPPLY-CHAIN', 'TELEMETRY'],
    },
  ],
};

const BODY_0010 = {
  ...INDEX.incidents[1],
  actor: 'agents',
  systems: 'platform',
  targets: 'prod',
  summary: 'Escaped and escalated.',
  disputed: null,
  chain: { PRESSURE: 'p', PROBE: null, BREACH: 'b', CHANNEL: null, ESCALATE: 'e', PROPAGATE: null, HALT: 'h' },
  sources: [{ label: 'First-party timeline', url: 'https://example.invalid/timeline' }],
};

function stubAssets(): Fetcher {
  const files: Record<string, unknown> = {
    '/data/ai-escape/index.json': INDEX,
    '/data/ai-escape/incidents/CB-2026-0010.json': BODY_0010,
    '/data/ai-escape/guardrails.json': { guardrails: [{ id: 'EGRESS', title: 'Egress', def: 'Allowlist only.' }] },
    '/data/ai-escape/trackers.json': {
      trackers: [{ name: 'T', url: 'https://example.invalid/', kind: 'lab', holds: 'logs', checked: '2026-09-06' }],
    },
  };
  return {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname;
      if (path in files) return new Response(JSON.stringify(files[path]), { status: 200 });
      return new Response('not found', { status: 404 });
    },
  } as unknown as Fetcher;
}

beforeEach(() => _resetEscapeCacheForTests());

describe('loadEscapeIndex', () => {
  it('loads index + stats', async () => {
    const idx = await loadEscapeIndex(stubAssets());
    expect(idx.stats.entries).toBe(3);
    expect(idx.stats.mostAbsentGuardrail?.id).toBe('TELEMETRY');
  });

  it('throws an actionable error when the build has not run', async () => {
    const missing = { fetch: async () => new Response('x', { status: 404 }) } as unknown as Fetcher;
    await expect(loadEscapeIndex(missing)).rejects.toThrow(/build-ai-escape/);
  });
});

describe('getEscapeIncident', () => {
  it('returns the full docket', async () => {
    const body = await getEscapeIncident(stubAssets(), 'CB-2026-0010');
    expect(body?.chain.BREACH).toBe('b');
    expect(body?.sources).toHaveLength(1);
  });

  it('returns null for unknown ids', async () => {
    await expect(getEscapeIncident(stubAssets(), 'CB-1999-0000')).resolves.toBeNull();
  });
});

describe('loadEscapeGuardrails / loadEscapeTrackers', () => {
  it('loads both reference docs', async () => {
    const assets = stubAssets();
    await expect(loadEscapeGuardrails(assets)).resolves.toHaveLength(1);
    await expect(loadEscapeTrackers(assets)).resolves.toHaveLength(1);
  });
});

describe('filterEscapes', () => {
  it('filters by klass / sev / tier', () => {
    expect(filterEscapes(INDEX, { klass: 'injection' }).map((e) => e.id)).toEqual(['CB-2026-0016']);
    expect(filterEscapes(INDEX, { sev: 'critical' }).map((e) => e.id)).toEqual(['CB-2026-0010']);
    expect(filterEscapes(INDEX, { tier: 'A' })).toHaveLength(2);
  });

  it('filters by guardrail and autonomy', () => {
    expect(filterEscapes(INDEX, { guardrail: 'TELEMETRY' })).toHaveLength(2);
    expect(filterEscapes(INDEX, { autonomous: true }).map((e) => e.id)).toEqual(['CB-2026-0010']);
  });

  it('searches id + title + developer + purpose', () => {
    expect(filterEscapes(INDEX, { q: 'cluster' }).map((e) => e.id)).toEqual(['CB-2026-0010']);
  });

  it('clamps limit', () => {
    expect(filterEscapes(INDEX, { limit: 2 })).toHaveLength(2);
  });
});

describe('escapeTimelineBuckets', () => {
  it('buckets oldest-first by month', () => {
    const buckets = escapeTimelineBuckets(INDEX);
    expect(buckets.map((b) => b.month)).toEqual(['2025-08', '2026-07', '2026-09']);
    expect(buckets[1]!.ids).toEqual(['CB-2026-0010']);
  });
});

describe('escapeCacheStats', () => {
  it('tracks index + body cache', async () => {
    const assets = stubAssets();
    expect(escapeCacheStats().indexLoaded).toBe(false);
    await loadEscapeIndex(assets);
    await getEscapeIncident(assets, 'CB-2026-0010');
    await getEscapeIncident(assets, 'CB-2026-0010');
    const stats = escapeCacheStats();
    expect(stats.indexLoaded).toBe(true);
    expect(stats.bodies.hits).toBe(1);
  });
});
