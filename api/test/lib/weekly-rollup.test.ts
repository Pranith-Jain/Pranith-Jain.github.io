import { describe, it, expect, vi } from 'vitest';
import {
  aggregateWeeklyFromDailies,
  mergeWeeklyWithDailies,
  weeklyUndercountsDailies,
  type Briefing,
  type BriefingFinding,
  type BriefingIocBuckets,
} from '../../src/lib/briefing-builder';

// ---- fixtures -----------------------------------------------------------

function cve(id: string, severity: BriefingFinding['severity'], cvss?: number, source = 'NVD'): BriefingFinding {
  return {
    id,
    title: `${id}: example`,
    description: 'example',
    severity,
    ...(cvss != null ? { cvss } : {}),
    source,
    mitre_techniques: [],
  };
}

function rw(id: string): BriefingFinding {
  return { id, title: id, description: id, severity: 'high', source: 'ransomware.live', mitre_techniques: [] };
}

function emptyBuckets(): BriefingIocBuckets {
  return { urls: [], domains: [], ipv4s: [], hashes: [] };
}

/** Build a stored daily Briefing body with the given CVE + ransomware findings and IOC count. */
function dailyBody(
  date: string,
  cves: BriefingFinding[],
  rwFindings: BriefingFinding[],
  iocs: number,
  sources: string[],
  iocEntries?: BriefingIocBuckets
): Briefing {
  const sections = [
    { id: 'critical-other', title: 'CVEs', count: cves.length, blurb: '', findings: cves },
    ...(rwFindings.length
      ? [
          {
            id: 'ransomware-activity',
            title: 'Ransomware activity',
            count: rwFindings.length,
            blurb: '',
            findings: rwFindings,
          },
        ]
      : []),
  ];
  return {
    slug: `daily-${date}`,
    type: 'daily',
    title: `Daily ${date}`,
    date,
    date_range: date,
    range_start: date,
    range_end: date,
    generated_at: '2026-05-30T00:00:00.000Z',
    executive_summary: '',
    stats: {
      findings: cves.length + rwFindings.length,
      sections: sections.length,
      cves: cves.length,
      kevs: cves.filter((f) => f.source === 'CISA KEV').length,
      iocs,
      critical: cves.filter((f) => f.severity === 'critical').length,
      high: cves.filter((f) => f.severity === 'high').length,
      medium: cves.filter((f) => f.severity === 'medium').length,
      low: cves.filter((f) => f.severity === 'low').length,
      ransomware_victims: rwFindings.length,
    },
    sections,
    iocs: iocEntries ?? emptyBuckets(),
    mitre_techniques: [],
    sources,
  };
}

/**
 * In-memory D1 stub supporting the two query shapes the rollup helpers use:
 *  - daily range:  ... WHERE type = ? AND date >= ? AND date <= ?  → .all()
 *  - single slug:  ... WHERE slug = ?                              → .first()
 */
function fakeDb(rows: Array<{ slug: string; type: string; date: string; stats_json: string; body: string }>) {
  const db = {
    prepare(sql: string) {
      return {
        _sql: sql,
        _args: [] as unknown[],
        bind(...args: unknown[]) {
          this._args = args;
          return this;
        },
        async first<T>(): Promise<T | null> {
          const slug = this._args[0] as string;
          const r = rows.find((x) => x.slug === slug);
          return (r as T) ?? null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          const [type, start, end] = this._args as [string, string, string];
          const results = rows
            .filter((r) => r.type === type && r.date >= start && r.date <= end)
            .sort((a, b) => a.date.localeCompare(b.date));
          return { results: results as T[] };
        },
      };
    },
  };
  return db as never;
}

function dailyRow(b: Briefing) {
  return { slug: b.slug, type: b.type, date: b.date, stats_json: JSON.stringify(b.stats), body: JSON.stringify(b) };
}

// ---- mergeWeeklyWithDailies (pure) --------------------------------------

describe('mergeWeeklyWithDailies', () => {
  const baseLive = {
    findings: [] as BriefingFinding[],
    ransomwareFindings: [] as BriefingFinding[],
    iocsRawTotal: 0,
    iocBuckets: emptyBuckets(),
    sources: [] as string[],
  };

  it('returns live unchanged when the rollup has no dailies', () => {
    const live = { ...baseLive, findings: [cve('CVE-2026-1', 'high', 7.5)], iocsRawTotal: 10 };
    const merged = mergeWeeklyWithDailies(live, {
      findings: [],
      ransomwareFindings: [],
      iocsTotal: 0,
      iocBuckets: emptyBuckets(),
      sources: [],
      dailyCount: 0,
    });
    expect(merged.findings).toEqual(live.findings);
    expect(merged.iocsRawTotal).toBe(10);
  });

  it('unions CVE findings by id, preferring the copy that carries a CVSS', () => {
    const live = { ...baseLive, findings: [cve('CVE-2026-1', 'unknown', undefined, 'CISA KEV')] };
    const merged = mergeWeeklyWithDailies(live, {
      findings: [cve('cve-2026-1', 'critical', 9.8), cve('CVE-2026-2', 'high', 7.2)],
      ransomwareFindings: [],
      iocsTotal: 100,
      iocBuckets: emptyBuckets(),
      sources: [],
      dailyCount: 3,
    });
    expect(merged.findings).toHaveLength(2);
    const one = merged.findings.find((f) => f.id.toUpperCase() === 'CVE-2026-1')!;
    expect(one.cvss).toBe(9.8); // the daily copy with a real CVSS won
    expect(one.severity).toBe('critical');
  });

  it('takes the larger IOC volume (sum of daily uniques beats a stale live window)', () => {
    const live = { ...baseLive, iocsRawTotal: 0 };
    const merged = mergeWeeklyWithDailies(live, {
      findings: [],
      ransomwareFindings: [],
      iocsTotal: 8726,
      iocBuckets: emptyBuckets(),
      sources: [],
      dailyCount: 7,
    });
    expect(merged.iocsRawTotal).toBe(8726);
  });

  it('dedupes ransomware findings by id and unions sources', () => {
    const live = { ...baseLive, ransomwareFindings: [rw('rw-a')], sources: ['CISA KEV'] };
    const merged = mergeWeeklyWithDailies(live, {
      findings: [],
      ransomwareFindings: [rw('rw-a'), rw('rw-b')],
      iocsTotal: 5,
      iocBuckets: emptyBuckets(),
      sources: ['URLhaus', 'CISA KEV'],
      dailyCount: 2,
    });
    expect(merged.ransomwareFindings.map((f) => f.id).sort()).toEqual(['rw-a', 'rw-b']);
    expect(merged.sources).toContain('URLhaus');
    expect(merged.sources.filter((s) => s === 'CISA KEV')).toHaveLength(1);
  });
});

// ---- aggregateWeeklyFromDailies (db-reading) ----------------------------

describe('aggregateWeeklyFromDailies', () => {
  it('unions CVEs across the week, dedupes IOC buckets, and separates ransomware', async () => {
    // Both days carry the SAME url, domain, and hash — the rollup must not
    // double-count them (regression: the old code summed per-day stats.iocs).
    const sharedBuckets: BriefingIocBuckets = {
      urls: [{ type: 'url', value: 'http://evil-a.example' }],
      domains: [{ type: 'domain', value: 'mal-a.example' }],
      ipv4s: [{ type: 'ipv4', value: '1.2.3.4' }],
      hashes: [{ type: 'hash', value: 'aa11' }],
    };
    const d25 = dailyBody(
      '2026-05-25',
      [cve('CVE-2026-1', 'high', 7.5), cve('CVE-2026-2', 'critical', 9.1)],
      [rw('rw-x-2026-05-25')],
      4,
      ['NVD', 'URLhaus'],
      sharedBuckets
    );
    const d26 = dailyBody(
      '2026-05-26',
      [cve('CVE-2026-1', 'high', 7.5), cve('CVE-2026-3', 'high', 8.0)],
      [rw('rw-y-2026-05-26')],
      4,
      ['NVD', 'ThreatFox'],
      sharedBuckets
    );
    const db = fakeDb([dailyRow(d25), dailyRow(d26)]);

    const rollup = await aggregateWeeklyFromDailies(db, '2026-05-25', '2026-05-31');

    expect(rollup.dailyCount).toBe(2);
    // CVE-2026-1 appears both days → counted once. Total unique CVEs = 3.
    expect(rollup.findings.map((f) => f.id.toUpperCase()).sort()).toEqual(['CVE-2026-1', 'CVE-2026-2', 'CVE-2026-3']);
    // Merged buckets are deduped: 4 distinct indicators (not 4 + 4 = 8).
    expect(rollup.iocsTotal).toBe(4);
    expect(rollup.iocBuckets.urls).toHaveLength(1);
    expect(rollup.iocBuckets.domains).toHaveLength(1);
    expect(rollup.iocBuckets.ipv4s).toHaveLength(1);
    expect(rollup.iocBuckets.hashes).toHaveLength(1);
    expect(rollup.ransomwareFindings.map((f) => f.id).sort()).toEqual(['rw-x-2026-05-25', 'rw-y-2026-05-26']);
    expect(rollup.sources.sort()).toEqual(['NVD', 'ThreatFox', 'URLhaus']);
  });

  it('never undercounts a day whose stored buckets were trimmed by capBriefingForStorage', async () => {
    // Day A: buckets survived storage (1 entry). Day B: buckets were trimmed
    // to empty by the 2MB cap, but stats.iocs (the pre-trim unique count)
    // still says 1200. The rollup must report at least the largest single-day
    // unique count — not the 1 merged bucket.
    const dA = dailyBody('2026-05-25', [cve('CVE-2026-1', 'high', 7.5)], [], 1, ['NVD'], {
      urls: [{ type: 'url', value: 'http://evil-a.example' }],
      domains: [],
      ipv4s: [],
      hashes: [],
    });
    const dB = dailyBody('2026-05-26', [cve('CVE-2026-2', 'high', 7.5)], [], 1200, ['NVD']);
    const db = fakeDb([dailyRow(dA), dailyRow(dB)]);

    const rollup = await aggregateWeeklyFromDailies(db, '2026-05-25', '2026-05-31');

    expect(rollup.iocsTotal).toBe(1200);
    expect(rollup.iocBuckets.urls).toHaveLength(1);
  });

  it('returns an empty rollup (dailyCount 0) when no dailies exist in the window', async () => {
    const db = fakeDb([]);
    const rollup = await aggregateWeeklyFromDailies(db, '2026-05-25', '2026-05-31');
    expect(rollup.dailyCount).toBe(0);
    expect(rollup.findings).toHaveLength(0);
    expect(rollup.iocsTotal).toBe(0);
  });
});

// ---- weeklyUndercountsDailies (predicate) -------------------------------

describe('weeklyUndercountsDailies', () => {
  const dailies = [
    dailyRow(dailyBody('2026-05-25', [cve('CVE-1', 'high', 7), cve('CVE-2', 'high', 7)], [], 1000, [])),
    dailyRow(dailyBody('2026-05-26', [cve('CVE-3', 'high', 7), cve('CVE-4', 'high', 7)], [], 1200, [])),
  ];

  it('fires when the stored weekly is far sparser than its dailies (the W22 bug)', async () => {
    const weekly = {
      slug: 'weekly-2026-W22',
      type: 'weekly',
      date: '2026-05-25',
      stats_json: JSON.stringify({ findings: 1, iocs: 0 }),
      body: '{}',
    };
    const db = fakeDb([weekly, ...dailies]);
    expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(true);
  });

  it('does not fire once the weekly carries the rolled-up numbers', async () => {
    const weekly = {
      slug: 'weekly-2026-W22',
      type: 'weekly',
      date: '2026-05-25',
      stats_json: JSON.stringify({ findings: 4, iocs: 2200 }),
      body: '{}',
    };
    const db = fakeDb([weekly, ...dailies]);
    expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(false);
  });

  it('does not fire when there are no dailies to compare against', async () => {
    const weekly = {
      slug: 'weekly-2026-W22',
      type: 'weekly',
      date: '2026-05-25',
      stats_json: JSON.stringify({ findings: 0, iocs: 0 }),
      body: '{}',
    };
    const db = fakeDb([weekly]);
    expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(false);
  });
});

// ---- buildBriefing weekly rollup-first (subrequest budget) ---------------
// Regression for the 2026-08-03 fix: the weekly build previously ran the full
// live fan-out (~45-50 subrequests) and blew the free-plan 50-subrequest cap
// (Cloudflare aborted with HTTP 503 → no row persisted; see
// docs/loops/briefing-cron-safety.md). Now it reads the D1 daily rollup FIRST
// and, when the dailies cover the window, builds from the rollup alone — so
// NO network fetches should happen at all.

describe('buildBriefing weekly rollup-first', () => {
  it('assembles the weekly from the daily rollup with zero network fetches', async () => {
    const { buildBriefing } = await import('../../src/lib/briefing-builder');
    // Rich dailies covering the W22 window (2026-05-25 → 2026-05-31).
    const dailies = [
      dailyBody('2026-05-25', [cve('CVE-2026-1001', 'critical', 9.8)], [rw('rhino: Alpha — claimed by clop')], 220, [
        'NVD',
        'ransomware.live',
      ]),
      dailyBody('2026-05-26', [cve('CVE-2026-1002', 'high', 7.5)], [rw('rhino: Beta — claimed by clop')], 180, [
        'NVD',
        'ransomware.live',
      ]),
      dailyBody('2026-05-27', [], [rw('rhino: Gamma — claimed by lockbit')], 0, ['ransomware.live']),
    ];
    const db = fakeDb(dailies.map(dailyRow));
    const env = { BRIEFINGS_DB: db } as never;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await buildBriefing('weekly', new Date('2026-06-01T00:00:00.000Z'), { env });

    // Assembled from the rollup — the three dailies land merged.
    expect(result.slug).toBe('weekly-2026-W22');
    expect(result.range_start).toBe('2026-05-25');
    expect(result.stats.findings).toBe(5);
    expect(result.stats.cves).toBe(2);
    // Regression: the weekly IOC total is NOT the sum of daily counts (that
    // double-counts indicators the same across dailies). These fixture dailies
    // carry no IOC buckets, so the deduped count falls back to the largest
    // single-day raw total (max(220, 180, 0) = 220) instead of 400.
    expect(result.stats.iocs).toBe(220);
    expect(result.stats.ransomware_victims).toBe(3);
    const rwSection = result.sections.find((s) => s.id === 'ransomware-activity');
    expect(rwSection?.findings.length).toBe(3);
    expect(rwSection?.blurb).toContain('Most active groups: clop (2), lockbit (1)');
    expect(result.sources).toEqual(expect.arrayContaining(['NVD', 'ransomware.live']));
    // No network fan-out — the whole 503-triggering live fetch is skipped.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
