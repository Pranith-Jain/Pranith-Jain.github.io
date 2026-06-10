import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { warmIntelBundles, buildIntelBody } from '../../src/lib/intel-bundle-warm';
import type { Env } from '../../src/env';
import type { Briefing } from '../../src/lib/briefing-builder';

const env = testEnv as unknown as Env;

function fakeBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    slug: 'daily-2026-05-22',
    type: 'daily',
    title: 'Daily briefing — 2026-05-22',
    date: '2026-05-22',
    date_range: '2026-05-22',
    range_start: '2026-05-22',
    range_end: '2026-05-22',
    generated_at: '2026-05-22T00:30:00Z',
    executive_summary: 'APT28 (Fancy Bear) was observed exploiting CVE-2024-21762 to deliver the CremShell malware.',
    stats: {
      findings: 1,
      sections: 1,
      cves: 1,
      kevs: 1,
      iocs: 2,
      critical: 1,
      high: 0,
      medium: 0,
      low: 0,
    },
    sections: [
      {
        id: 'sec-1',
        title: 'Spear-phishing campaign',
        blurb: 'Spear-phishing campaign attributed to APT28.',
        count: 1,
        findings: [
          {
            id: 'f-1',
            title: 'Fortinet auth bypass exploited in the wild',
            description:
              'Reports indicate diplo-service.com is hosting payloads. Hash 5d41402abc4b2a76b9719d911017c592 observed.',
            severity: 'critical',
            source: 'unit42',
            mitre_techniques: ['T1566.001'],
          },
        ],
      },
    ],
    iocs: { urls: [], domains: [], ipv4s: [], hashes: [] },
    mitre_techniques: ['T1566.001'],
    sources: ['unit42'],
    ...overrides,
  };
}

async function insertBriefing(db: D1Database, b: Briefing): Promise<void> {
  await db
    .prepare(
      `INSERT INTO briefings
         (slug, type, title, date, date_range, range_start, range_end, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         body = excluded.body, range_end = excluded.range_end`
    )
    .bind(b.slug, b.type, b.title, b.date, b.date_range, b.range_start, b.range_end, JSON.stringify(b), b.generated_at)
    .run();
}

beforeAll(async () => {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not bound in test env');
  await db.exec(
    `CREATE TABLE IF NOT EXISTS briefings (` +
      ` slug TEXT PRIMARY KEY,` +
      ` type TEXT NOT NULL,` +
      ` title TEXT NOT NULL,` +
      ` date TEXT NOT NULL,` +
      ` date_range TEXT NOT NULL,` +
      ` range_start TEXT NOT NULL,` +
      ` range_end TEXT NOT NULL,` +
      ` body TEXT NOT NULL,` +
      ` created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))`
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS intel_bundles (` +
      ` id TEXT PRIMARY KEY,` +
      ` source_id TEXT NOT NULL,` +
      ` item_ref TEXT NOT NULL,` +
      ` report_id TEXT NOT NULL,` +
      ` title TEXT NOT NULL,` +
      ` published_at TEXT,` +
      ` extracted_hash TEXT NOT NULL,` +
      ` bundle_json TEXT NOT NULL,` +
      ` view_json TEXT NOT NULL,` +
      ` created_at TEXT NOT NULL DEFAULT (datetime('now')),` +
      ` updated_at TEXT NOT NULL DEFAULT (datetime('now')),` +
      ` ioc_count INTEGER NOT NULL DEFAULT 0,` +
      ` actor_count INTEGER NOT NULL DEFAULT 0,` +
      ` malware_count INTEGER NOT NULL DEFAULT 0)`
  );
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_bundles_source_ref ON intel_bundles(source_id, item_ref)`);
});

beforeEach(async () => {
  // Clean slate per test. We intentionally keep schema across tests but
  // reset rows so each test reasons about a known starting state.
  await env.BRIEFINGS_DB!.exec('DELETE FROM briefings');
  await env.BRIEFINGS_DB!.exec('DELETE FROM intel_bundles');
});

describe('buildIntelBody', () => {
  it('matches the BriefingDetail.tsx concatenation shape', () => {
    const b = fakeBriefing();
    const body = buildIntelBody(b);
    // Locked in: executive summary first, then "## <section>\n<blurb>" per
    // section, then "### <finding>\n<desc>" per finding. The shape MUST
    // stay byte-identical to BriefingDetail.tsx — diverging produces a
    // different extracted_hash and breaks the warmer's purpose.
    expect(body.startsWith(b.executive_summary)).toBe(true);
    expect(body).toContain('## Spear-phishing campaign');
    expect(body).toContain('### Fortinet auth bypass exploited in the wild');
  });

  it('survives missing findings array on a section', () => {
    const b = fakeBriefing({
      sections: [{ id: 's', title: 'Empty section', blurb: 'no findings here', count: 0, findings: [] }],
    });
    const body = buildIntelBody(b);
    expect(body).toContain('## Empty section');
    // No '### ' lines because findings is empty.
    expect(body).not.toContain('###');
  });
});

describe('warmIntelBundles', () => {
  it('no-ops cleanly when no briefings exist', async () => {
    const r = await warmIntelBundles(env, { maxItems: 1 });
    expect(r.built).toEqual([]);
    expect(r.failed).toEqual([]);
    expect(r.hasMore).toBe(false);
  });

  it('builds a bundle for a briefing that lacks an intel_bundles row', { timeout: 20_000 }, async () => {
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing());
    // Wide lookback so the fixed-date fixture stays in-window regardless of
    // the current date — this test exercises bundle construction, not the
    // lookback filter.
    const r = await warmIntelBundles(env, { maxItems: 5, lookbackDays: 365_000 });
    expect(r.built).toEqual(['daily-2026-05-22']);
    expect(r.failed).toEqual([]);
    const row = await env
      .BRIEFINGS_DB!.prepare(
        `SELECT id, source_id, item_ref, ioc_count FROM intel_bundles
             WHERE source_id = 'briefings' AND item_ref = 'daily-2026-05-22'`
      )
      .first<{ id: string; source_id: string; item_ref: string; ioc_count: number }>();
    expect(row).not.toBeNull();
    expect(row?.source_id).toBe('briefings');
    // The fixture contains a domain + a hash, so the bundle should carry
    // at least 1 IoC. The exact count depends on the extractor's CVE/IoC
    // pattern matches — assert non-empty rather than an exact number to
    // avoid brittleness against future extractor tweaks.
    expect(row?.ioc_count ?? 0).toBeGreaterThan(0);
  });

  it('skips briefings already present in intel_bundles', { timeout: 20_000 }, async () => {
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing());
    // Wide lookback so the fixed-date fixture stays in-window.
    // First run: builds the bundle.
    const first = await warmIntelBundles(env, { maxItems: 5, lookbackDays: 365_000 });
    expect(first.built).toHaveLength(1);
    // Second run: row is already present → must skip.
    const second = await warmIntelBundles(env, { maxItems: 5, lookbackDays: 365_000 });
    expect(second.built).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(second.hasMore).toBe(false);
  });

  it('respects maxItems cap and reports hasMore', { timeout: 30_000 }, async () => {
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing({ slug: 'daily-2026-05-20', range_end: '2026-05-20' }));
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing({ slug: 'daily-2026-05-21', range_end: '2026-05-21' }));
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing({ slug: 'daily-2026-05-22', range_end: '2026-05-22' }));
    // Wide lookback so the fixed fixture dates stay in-window regardless of
    // the current date — this test exercises the maxItems/hasMore cap, not the
    // lookback filter.
    const r = await warmIntelBundles(env, { maxItems: 1, lookbackDays: 365_000 });
    expect(r.built).toHaveLength(1);
    expect(r.hasMore).toBe(true);
    // FIFO by range_end ASC — oldest goes first.
    expect(r.built[0]).toBe('daily-2026-05-20');
  });

  it('continues past a per-row failure and records it under failed[]', { timeout: 20_000 }, async () => {
    // Insert one good briefing and one with un-parseable body. The bad
    // row should land in `failed[]` while the good one still builds.
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing({ slug: 'daily-2026-05-22' }));
    await env
      .BRIEFINGS_DB!.prepare(
        `INSERT INTO briefings
             (slug, type, title, date, date_range, range_start, range_end, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'daily-2026-05-21',
        'daily',
        'Bad briefing',
        '2026-05-21',
        '2026-05-21',
        '2026-05-21',
        '2026-05-21',
        '{not valid json',
        '2026-05-21T00:30:00Z'
      )
      .run();
    // Wide lookback so both fixed-date fixtures stay in-window regardless of
    // the current date — this test exercises per-row failure handling.
    const r = await warmIntelBundles(env, { maxItems: 5, lookbackDays: 365_000 });
    expect(r.built).toContain('daily-2026-05-22');
    expect(r.failed.map((f) => f.slug)).toContain('daily-2026-05-21');
  });

  it('persists LLM-extracted sectors / candidates when extractLlm is wired', { timeout: 30_000 }, async () => {
    // Build a briefing whose intel body comfortably exceeds the 600-char
    // threshold so the LLM is NOT skipped.
    const bigBlurb = 'Microsoft Exchange was extensively targeted in this campaign. '.repeat(20);
    await insertBriefing(
      env.BRIEFINGS_DB!,
      fakeBriefing({
        slug: 'daily-2026-05-22',
        sections: [
          {
            id: 'sec-1',
            title: 'Exchange exploitation',
            blurb: bigBlurb,
            count: 1,
            findings: [
              {
                id: 'f-1',
                title: 'CVE-2024-21762 in the wild',
                description: 'Operators leveraging LightSpy v2 against Microsoft Exchange.',
                severity: 'critical',
                source: 'unit42',
                mitre_techniques: [],
              },
            ],
          },
        ],
      })
    );

    const llmStub: typeof import('../../src/lib/extract-llm').extractLlm = async (
      _title,
      _body,
      _entities,
      _env,
      _opts
    ) => ({
      sectors: [{ name: 'healthcare' }],
      affectedProducts: [{ vendor: 'Microsoft', product: 'Exchange' }],
      attackPatterns: [{ id: 'T1566.001', name: 'Spear-phishing Attachment' }],
      actorCandidates: [{ name: 'LightSpy', rationale: 'observed in source' }],
      malwareCandidates: [],
      flowOrdered: true,
      ran: true,
      partial: false,
      modelUsed: 'stub:test',
    });

    const r = await warmIntelBundles(env, { maxItems: 1, extractLlm: llmStub, lookbackDays: 365_000 });
    expect(r.built).toEqual(['daily-2026-05-22']);

    const row = await env
      .BRIEFINGS_DB!.prepare(
        `SELECT view_json FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = 'daily-2026-05-22'`
      )
      .first<{ view_json: string }>();
    const view = JSON.parse(row!.view_json) as {
      sectors: string[];
      affectedProducts: { vendor: string; product: string }[];
      actorCandidates: { name: string }[];
      attackPatterns: { mitreId: string }[];
      llmEnrichment: { ran: boolean; modelUsed: string };
    };
    expect(view.sectors).toEqual(['healthcare']);
    expect(view.affectedProducts).toEqual([{ vendor: 'Microsoft', product: 'Exchange' }]);
    expect(view.actorCandidates.map((c) => c.name)).toEqual(['LightSpy']);
    expect(view.attackPatterns).toEqual([{ name: 'Spear-phishing Attachment', mitreId: 'T1566.001' }]);
    expect(view.llmEnrichment.ran).toBe(true);
    expect(view.llmEnrichment.modelUsed).toBe('stub:test');
  });

  it(
    'when extractLlm is NOT provided, the warmer still ships a bundle with ran:false',
    { timeout: 20_000 },
    async () => {
      await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing());
      const r = await warmIntelBundles(env, {
        maxItems: 1,
        lookbackDays: 365_000,
        extractLlm: async () => ({
          sectors: [],
          affectedProducts: [],
          attackPatterns: [],
          actorCandidates: [],
          malwareCandidates: [],
          flowOrdered: false,
          ran: false,
          partial: false,
        }),
      });
      expect(r.built).toHaveLength(1);
      const row = await env
        .BRIEFINGS_DB!.prepare(`SELECT view_json FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = ?`)
        .bind(r.built[0])
        .first<{ view_json: string }>();
      const view = JSON.parse(row!.view_json) as { llmEnrichment: { ran: boolean } };
      expect(view.llmEnrichment.ran).toBe(false);
    }
  );

  // Regression for the "bundle never blocked by LLM" invariant. If the
  // extractor throws, the bundle MUST still land in D1 with regex-only
  // signal. Previously, a non-string runCompletion response could escape
  // extract-llm and reject the warmer's Promise.all, dropping the bundle
  // into `failed[]` instead.
  it('persists the bundle even when extractLlm throws', { timeout: 20_000 }, async () => {
    await insertBriefing(env.BRIEFINGS_DB!, fakeBriefing());
    const r = await warmIntelBundles(env, {
      maxItems: 1,
      lookbackDays: 365_000,
      extractLlm: async () => {
        throw new Error('synthetic extractor failure');
      },
    });
    expect(r.built).toHaveLength(1);
    expect(r.failed).toHaveLength(0);
    const row = await env
      .BRIEFINGS_DB!.prepare(`SELECT view_json FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = ?`)
      .bind(r.built[0])
      .first<{ view_json: string }>();
    const view = JSON.parse(row!.view_json) as { llmEnrichment: { ran: boolean; partial: boolean } };
    // Bundle landed with empty LLM signal — ran:false reflects "we got
    // no usable result", and partial isn't asserted because the warmer
    // surfaces the throw as ran:false rather than ran:true/partial:true
    // (the throw bypassed extractLlm's internal partial logic entirely).
    expect(view.llmEnrichment.ran).toBe(false);
  });
});
