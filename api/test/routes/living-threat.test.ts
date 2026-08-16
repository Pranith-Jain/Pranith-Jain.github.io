/**
 * Tests for the Living Threat Repository routes
 * (/api/v1/threat-intel/living-threat*).
 *
 * The routes read the living-threat manifest through env.ASSETS; we stub
 * it with an in-memory map (same approach as the dphish route tests).
 *
 * Run via: npx vitest run api/test/routes/living-threat.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { threatIntelRouter } from '../../src/routes/threat-intel-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/threat-intel/living-threat/index.json', {
    source: 'living-threat.rabitanoor.com',
    sourceUrl: 'https://living-threat.rabitanoor.com/',
    repoUrl: 'https://github.com/HudKSD/Living-Threat',
    description: 'Real-world incidents mapped to MITRE ATT&CK.',
    license: 'MIT',
    syncedAt: '2026-08-16T12:00:00.000Z',
    meta: { latestTs: '2026-08-16T11:07:00Z', latestSeq: 21625, cap: 'Upstream caps at 5000.' },
    counts: {
      incidents: 2,
      shards: 1,
      bySeverity: { High: 1, Low: 1 },
      byTactic: { 'Initial Access': 1, 'Command and Control': 1 },
      uniqueCves: 1,
      uniqueTechniques: 2,
    },
    topTechniques: [{ id: 'T1190', count: 1 }],
    topActors: [{ name: 'AmnesiaStealer', count: 1 }],
    topTools: [],
    topSources: [],
    incidents: [
      {
        slug: 'amnesiastealer-macos-malware-021625',
        shard: 0,
        sequence: 21625,
        title: 'AmnesiaStealer: macOS Malware Leveraging ClickFix Attacks',
        timestamp: '2026-08-16T11:07:00Z',
        source: 'https://www.bleepingcomputer.com/news/security/',
        severity: 'High',
        priorityScore: 92,
        relevanceScore: 67,
        tactics: ['Initial Access', 'Command and Control'],
        techniques: ['T1190'],
        actors: ['AmnesiaStealer'],
        techniqueCount: 1,
        cves: 1,
        tools: 1,
        sizeBytes: 8000,
      },
      {
        slug: 'another-incident-021600',
        shard: 0,
        sequence: 21600,
        title: 'Another Incident',
        timestamp: '2026-08-15T00:00:00Z',
        source: 'https://example.com/',
        severity: 'Low',
        priorityScore: 30,
        relevanceScore: 40,
        tactics: ['Initial Access'],
        techniques: [],
        actors: [],
        techniqueCount: 0,
        cves: 0,
        tools: 0,
        sizeBytes: 4000,
      },
    ],
  });

  data.set('/data/threat-intel/living-threat/shards/0000.json', [
    {
      slug: 'amnesiastealer-macos-malware-021625',
      shard: 0,
      sequence: 21625,
      Title: 'AmnesiaStealer: macOS Malware Leveraging ClickFix Attacks',
      Severity: 'High',
      CVEs: ['CVE-2026-58231'],
      Threat_Actors: ['AmnesiaStealer'],
      Tools: ['ClickFix Kit'],
      Analyses: [
        {
          Stage: 'Exploitation',
          Description: 'Exploitation of CVE-2026-58231.',
          Detection: 'Monitor for unusual ClickFix activity.',
          Remediation: 'Apply patches.',
          Tactics: [{ tactic_id: 'TA0001', tactic_name: 'Initial Access' }],
          Technique_Details: [{ technique_id: 'T1190', technique_name: 'Exploit Public-Facing Application' }],
          Techniques: ['T1190'],
        },
      ],
      priority_score: 92,
      kill_chain_summary: 'Exploitation led to C2.',
      Detection_Rules_And_Indicators: ['Sigma: ClickFix payload execution'],
    },
    {
      slug: 'another-incident-021600',
      shard: 0,
      sequence: 21600,
      Title: 'Another Incident',
      Severity: 'Low',
      CVEs: [],
      Threat_Actors: [],
      Tools: [],
      Analyses: [],
      priority_score: 30,
    },
  ]);

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
  app.route('/api/v1', threatIntelRouter);
  return app;
}

describe('Living Threat routes', () => {
  it('GET /living-threat returns index + counts + cache stats', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/living-threat', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      counts: { incidents: number; byTactic: Record<string, number> };
      topTechniques: { id: string; count: number }[];
      stats: { indexLoaded: boolean };
    };
    expect(body.source).toBe('living-threat.rabitanoor.com');
    expect(body.counts.incidents).toBe(2);
    expect(body.counts.byTactic['Initial Access']).toBe(1);
    expect(body.topTechniques).toEqual([{ id: 'T1190', count: 1 }]);
    expect(body.stats.indexLoaded).toBe(true);
  });

  it('GET /living-threat/incidents lists with filters', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/living-threat/incidents', {}, makeEnv());
    expect(r.status).toBe(200);
    expect(((await r.json()) as { returned: number }).returned).toBe(2);

    const byTactic = await app.request(
      '/api/v1/threat-intel/living-threat/incidents?tactic=Command%20and%20Control',
      {},
      makeEnv()
    );
    expect(((await byTactic.json()) as { returned: number }).returned).toBe(1);

    const bySeverity = await app.request('/api/v1/threat-intel/living-threat/incidents?severity=High', {}, makeEnv());
    expect(((await bySeverity.json()) as { returned: number }).returned).toBe(1);

    const byTechnique = await app.request(
      '/api/v1/threat-intel/living-threat/incidents?technique=T1190',
      {},
      makeEnv()
    );
    expect(((await byTechnique.json()) as { returned: number }).returned).toBe(1);

    const byActor = await app.request('/api/v1/threat-intel/living-threat/incidents?actor=Amnesia', {}, makeEnv());
    expect(((await byActor.json()) as { returned: number }).returned).toBe(1);

    const byPriority = await app.request('/api/v1/threat-intel/living-threat/incidents?min_priority=50', {}, makeEnv());
    expect(((await byPriority.json()) as { returned: number }).returned).toBe(1);

    const byKeyword = await app.request('/api/v1/threat-intel/living-threat/incidents?q=clickfix', {}, makeEnv());
    expect(((await byKeyword.json()) as { returned: number }).returned).toBe(1);

    const limit = await app.request('/api/v1/threat-intel/living-threat/incidents?limit=1', {}, makeEnv());
    expect(((await limit.json()) as { returned: number }).returned).toBe(1);
  });

  it('GET /living-threat/incidents/:slug returns the body; unknown slugs 404', async () => {
    const app = setup();
    const r = await app.request(
      '/api/v1/threat-intel/living-threat/incidents/amnesiastealer-macos-malware-021625',
      {},
      makeEnv()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      CVEs: string[];
      Analyses: { Stage: string; Techniques: string[]; Detection: string }[];
      Detection_Rules_And_Indicators: string[];
    };
    expect(body.CVEs).toEqual(['CVE-2026-58231']);
    expect(body.Analyses[0]!.Stage).toBe('Exploitation');
    expect(body.Analyses[0]!.Techniques).toEqual(['T1190']);
    expect(body.Detection_Rules_And_Indicators).toEqual(['Sigma: ClickFix payload execution']);

    const missing = await app.request('/api/v1/threat-intel/living-threat/incidents/nope', {}, makeEnv());
    expect(missing.status).toBe(404);
  });
});
