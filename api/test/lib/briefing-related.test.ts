/**
 * Tests for the briefing case-triage linkage (api/src/lib/briefing-builder/related.ts).
 *
 * Port of the related-case matcher from
 * reindrops86/Agentic-Cyber-Threat-Intelligence-Researcher (CTIcode.py):
 * related when normalized IOC sets overlap (URL hosts ↔ bare domains included),
 * keyword-overlap fallback, ranked by match count then severity then recency.
 *
 * Run via: npx vitest run api/test/lib/briefing-related.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { D1Database, D1Result, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  Briefing,
  BriefingIocBuckets,
  BriefingStats,
  RelatedBriefingRef,
  Severity,
} from '../../src/lib/briefing-builder/types';
import type { IocEntry as FeedIocEntry } from '../../src/lib/ioc-feed-parsers';
import {
  normalizeIocValue,
  briefingIocKeySet,
  summaryKeywordOverlap,
  severityFromStats,
  rankRelatedBriefings,
  findRelatedBriefings,
  stampRelatedBriefings,
} from '../../src/lib/briefing-builder/related';

function ioc(type: string, value: string): FeedIocEntry {
  return { type: type as FeedIocEntry['type'], value };
}

function buckets(entries: Array<[string, string]>): BriefingIocBuckets {
  const b: BriefingIocBuckets = { urls: [], domains: [], ipv4s: [], hashes: [] };
  for (const [type, value] of entries) {
    if (type === 'url') b.urls.push(ioc('url', value));
    else if (type === 'domain') b.domains.push(ioc('domain', value));
    else if (type === 'ip') b.ipv4s.push(ioc('ipv4', value));
    else b.hashes.push(ioc('hash', value));
  }
  return b;
}

function briefing(overrides: Partial<Briefing> & { slug: string }): Briefing {
  return {
    type: 'daily',
    title: `Briefing ${overrides.slug}`,
    date: '2026-08-18',
    date_range: '2026-08-17 – 2026-08-18',
    range_start: '2026-08-17',
    range_end: '2026-08-18',
    generated_at: '2026-08-18T00:00:00Z',
    executive_summary: 'Todays threat landscape.',
    stats: {} as BriefingStats,
    sections: [],
    iocs: { urls: [], domains: [], ipv4s: [], hashes: [] },
    mitre_techniques: [],
    sources: [],
    ...overrides,
  };
}

describe('normalizeIocValue', () => {
  it('strips trailing dots and case from domains', () => {
    expect(normalizeIocValue('domain', 'Evil.COM.')).toBe('evil.com');
  });
  it('collapses URLs to their bare host', () => {
    expect(normalizeIocValue('url', 'https://evil.com/portal?x=1')).toBe('evil.com');
  });
  it('keeps IPs and lowercases hashes', () => {
    expect(normalizeIocValue('ipv4', '1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIocValue('hash', 'ABCDEF')).toBe('abcdef');
  });
});

describe('briefingIocKeySet', () => {
  it('includes URL hosts and bare domains in one namespace', () => {
    const b = briefing({
      slug: 'daily-2026-08-18',
      iocs: buckets([
        ['domain', 'evil.com'],
        ['url', 'https://evil.com/x'],
      ]),
    });
    const set = briefingIocKeySet(b);
    expect(set.size).toBe(1);
    expect(set.has('evil.com')).toBe(true);
  });
});

describe('summaryKeywordOverlap', () => {
  it('matches on a shared tactic keyword', () => {
    expect(summaryKeywordOverlap('ransomware activity rising', 'lockbit ransomware wave')).toBe(true);
  });
  it('mismatches when nothing shared', () => {
    expect(summaryKeywordOverlap('ransomware activity rising', 'kernel crash reports')).toBe(false);
  });
  it('guards empties', () => {
    expect(summaryKeywordOverlap(undefined, 'ransomware')).toBe(false);
    expect(summaryKeywordOverlap('', '')).toBe(false);
  });
});

describe('severityFromStats', () => {
  it('picks the top severity present', () => {
    expect(severityFromStats({ critical: 2, high: 5 })).toBe('critical');
    expect(severityFromStats({ high: 1 })).toBe('high');
    expect(severityFromStats({ medium: 3 })).toBe('medium');
    expect(severityFromStats({ low: 1 })).toBe('low');
    expect(severityFromStats({})).toBe('unknown');
    expect(severityFromStats(undefined)).toBe('unknown');
  });
});

describe('rankRelatedBriefings', () => {
  const current = briefing({
    slug: 'daily-2026-08-18',
    executive_summary: 'phishing campaign against payroll users',
    iocs: buckets([
      ['domain', 'evil.com'],
      ['ip', '185.220.101.42'],
    ]),
  });

  function candidate(
    slug: string,
    overrides: Partial<Briefing> = {},
    severity: Severity = 'high'
  ): { briefing: Briefing; severity: Severity } {
    return { briefing: briefing({ slug, ...overrides }), severity };
  }

  it('excludes the current briefing itself', () => {
    const out = rankRelatedBriefings(current, [candidate(current.slug, { iocs: current.iocs })]);
    expect(out).toHaveLength(0);
  });

  it('ranks IOC overlap above keyword-only fallback', () => {
    const out = rankRelatedBriefings(current, [
      candidate('daily-2026-08-17', { executive_summary: 'ransomware campaign wave' }),
      candidate('daily-2026-08-16', {
        iocs: buckets([
          ['domain', 'evil.com'],
          ['ip', '185.220.101.42'],
        ]),
      }),
    ]);
    expect(out[0]!.slug).toBe('daily-2026-08-16');
    expect(out[0]!.match_count).toBe(2);
    expect(out[0]!.keyword_match).toBe(false);
    expect(out[1]!.keyword_match).toBe(true);
  });

  it('falls back to shared tactic keywords when IOCs do not overlap', () => {
    const out = rankRelatedBriefings(current, [
      candidate('daily-2026-08-17', { executive_summary: 'ransomware campaign wave' }),
      candidate('daily-2026-08-15', {
        iocs: buckets([['domain', 'notrelated.com']]),
        executive_summary: 'kernel crash reports',
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.slug).toBe('daily-2026-08-17');
    expect(out[0]!.keyword_match).toBe(true);
    expect(out[0]!.match_count).toBe(1);
  });

  it('matches URL hosts against bare domains (normalization parity)', () => {
    const urlCurrent = briefing({
      slug: 'daily-2026-08-18',
      iocs: buckets([['url', 'https://evil.com/portal']]),
    });
    const out = rankRelatedBriefings(urlCurrent, [
      candidate('daily-2026-08-17', { iocs: buckets([['domain', 'EVIL.com.']]) }),
    ]);
    expect(out[0]!.slug).toBe('daily-2026-08-17');
    expect(out[0]!.match_count).toBe(1);
  });

  it('sorts by match count, then severity, then recency, and caps at limit', () => {
    const out = rankRelatedBriefings(
      current,
      [
        candidate('weekly-2026-w34', { iocs: buckets([['domain', 'evil.com']]) }, 'low'),
        candidate(
          'daily-2026-08-15',
          {
            iocs: buckets([
              ['domain', 'evil.com'],
              ['ip', '185.220.101.42'],
            ]),
          },
          'medium'
        ),
        candidate(
          'daily-2026-08-14',
          {
            iocs: buckets([
              ['domain', 'evil.com'],
              ['ip', '185.220.101.42'],
            ]),
          },
          'critical'
        ),
        candidate('daily-2026-08-13', { executive_summary: 'phishing lure found' }),
      ],
      2
    );
    expect(out.map((r: RelatedBriefingRef) => r.slug)).toEqual(['daily-2026-08-14', 'daily-2026-08-15']);
    expect(out[0]!.match_count).toBe(2);
  });
});

/** Tiny D1 emulator for the two query shapes the related matcher issues:
 *  the readBriefing shape (first) and the json_extract candidate scan (all). */
class FakeD1 {
  rows = new Map<string, { body: string; stats_json: string; range_end: string; created_at: string }>();

  seed(items: Briefing[]) {
    for (const b of items) {
      this.rows.set(b.slug, {
        body: JSON.stringify(b),
        stats_json: JSON.stringify(b.stats ?? {}),
        range_end: b.range_end,
        created_at: b.generated_at,
      });
    }
  }

  prepare(sql: string): D1PreparedStatement {
    const base = {
      bind: () => base as unknown as D1PreparedStatement,
      first: async () => null,
      run: async () => ({ success: true }) as unknown as D1Result,
      all: async () => ({ results: [] }) as unknown as D1Result,
      raw: async () => [] as unknown[],
    };
    const exec = (...params: unknown[]) => {
      if (sql.includes('WHERE LOWER(slug) = LOWER(?)')) {
        return {
          first: async () => {
            const slug = String(params[0] ?? '').toLowerCase();
            for (const [key, row] of this.rows) {
              if (key.toLowerCase() === slug) return { body: row.body } as unknown as Record<string, unknown>;
            }
            return null;
          },
          all: async () => ({ results: [] }) as unknown as D1Result,
        };
      }
      return {
        all: async () => {
          const limit = Number(params[1] ?? 40);
          const exclude = String(params[0] ?? '');
          const sorted = [...this.rows.entries()]
            .filter(([slug]) => slug !== exclude)
            .sort((a, b) => (a[1].range_end < b[1].range_end ? 1 : a[1].range_end > b[1].range_end ? -1 : 0))
            .slice(0, limit);
          const results = sorted.map(([slug, row]) => {
            const body = JSON.parse(row.body) as Briefing;
            const extract = (path: string): string | null => {
              const value = path
                .split('.')
                .reduce<unknown>(
                  (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
                  body
                );
              return value === undefined || value === null ? null : JSON.stringify(value);
            };
            return {
              slug,
              type: body.type,
              title: body.title,
              date_range: body.date_range,
              range_end: body.range_end,
              stats_json: row.stats_json,
              executive_summary: extract('executive_summary'),
              domains: extract('iocs.domains'),
              urls: extract('iocs.urls'),
              ipv4s: extract('iocs.ipv4s'),
              hashes: extract('iocs.hashes'),
            };
          });
          return { results } as unknown as D1Result;
        },
      };
    };
    return {
      bind: (...params: unknown[]) =>
        ({
          ...base,
          all: exec(...params).all,
          first: exec(...params).first,
        }) as unknown as D1PreparedStatement,
    } as unknown as D1PreparedStatement;
  }
}

function dbOf(fake: FakeD1): D1Database {
  return fake as unknown as D1Database;
}

describe('findRelatedBriefings', () => {
  it('finds relations across stored briefings, excluding self, capped by limit', async () => {
    const fake = new FakeD1();
    fake.seed([
      briefing({
        slug: 'daily-2026-08-18',
        title: 'A',
        executive_summary: 'phishing wave',
        stats: { critical: 1 } as BriefingStats,
        iocs: buckets([
          ['domain', 'shared.com'],
          ['ip', '1.2.3.4'],
        ]),
      }),
      briefing({
        slug: 'daily-2026-08-17',
        title: 'B',
        executive_summary: 'unrelated kernel notes',
        stats: {} as BriefingStats,
        iocs: buckets([['domain', 'shared.com']]),
      }),
    ]);
    const out = await findRelatedBriefings(
      dbOf(fake),
      briefing({ slug: 'daily-2026-08-16', iocs: buckets([['domain', 'shared.com']]) }),
      { limit: 5 }
    );
    expect(out.map((r) => r.slug)).toEqual(['daily-2026-08-18', 'daily-2026-08-17']);
    expect(out[0]!.match_count).toBe(1);
    expect(out[0]!.severity).toBe('critical');
    expect(out[1]!.severity).toBe('unknown');
  });

  it('stampRelatedBriefings attaches without throwing (best-effort)', async () => {
    const fake = new FakeD1();
    const current = briefing({ slug: 'daily-2026-08-18', iocs: buckets([['domain', 'evil.com']]) });
    await stampRelatedBriefings(dbOf(fake), current, { limit: 5 });
    expect(Array.isArray(current.related_briefings)).toBe(true);
    expect(current.related_briefings!.length).toBe(0);
  });
});
