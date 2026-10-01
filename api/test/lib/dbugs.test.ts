import { describe, it, expect } from 'vitest';
import { parseDbugsPayload, mapDbugsRow, DBUGS_MAX_LIMIT } from '../../src/lib/dbugs';

function row(over: Record<string, unknown> = {}) {
  return {
    vulner_id: 'PT-2026-103811',
    cve_id: 'CVE-2026-103279',
    max_score: 6.8,
    max_severity: 'MEDIUM',
    created: '2026-10-01',
    updated: '2026-10-01',
    has_fix: true,
    has_exploits: false,
    vendors: ['Tryghost'],
    products: ['Ghost'],
    cwe_ids: ['CWE-613'],
    impacts: ['Insufficient Session Expiration'],
    references: [
      { domain: 'github.com', source: 'Vendor Advisory', ref_url: 'https://github.com/advisory', is_deleted: false },
    ],
    ...over,
  };
}

describe('mapDbugsRow', () => {
  it('maps a full row including vendor/product, CWEs and flags', () => {
    const v = mapDbugsRow(row());
    expect(v).not.toBeNull();
    expect(v!.cve_id).toBe('CVE-2026-103279');
    expect(v!.severity).toBe('MEDIUM');
    expect(v!.score).toBe(6.8);
    expect(v!.vendor).toBe('Tryghost');
    expect(v!.product).toBe('Ghost');
    expect(v!.cwes).toEqual(['CWE-613']);
    expect(v!.has_fix).toBe(true);
    expect(v!.has_exploits).toBe(false);
    expect(v!.reference).toBe('https://github.com/advisory');
  });

  it('uppercases the CVE id and accepts 4+ digit sequence numbers', () => {
    expect(mapDbugsRow(row({ cve_id: 'cve-2026-1032' }))!.cve_id).toBe('CVE-2026-1032');
  });

  it('rejects rows without a valid CVE id (advisory-only records)', () => {
    expect(mapDbugsRow(row({ cve_id: null }))).toBeNull();
    expect(mapDbugsRow(row({ cve_id: 'PT-2026-1' }))).toBeNull();
  });

  it('rejects rows missing a well-formed created date', () => {
    expect(mapDbugsRow(row({ created: '' }))).toBeNull();
    expect(mapDbugsRow(row({ created: '01/10/2026' }))).toBeNull();
  });

  it("maps upstream's literal 'NULL' severity to UNKNOWN", () => {
    expect(mapDbugsRow(row({ max_severity: 'NULL' }))!.severity).toBe('UNKNOWN');
    expect(mapDbugsRow(row({ max_severity: undefined }))!.severity).toBe('UNKNOWN');
  });

  it('falls back from priority_vendor to the vendors[] array', () => {
    const v = mapDbugsRow(row({ priority_vendor: '', vendors: ['Acme', 'Acme Corp'] }));
    expect(v!.vendor).toBe('Acme');
  });

  it('prefers a vendor advisory reference over a third-party one', () => {
    const v = mapDbugsRow(
      row({
        references: [
          { domain: 'medium.com', source: 'Write-up', ref_url: 'https://medium.com/x', is_deleted: false },
          { domain: 'vendor.com', source: 'Vendor Advisory', ref_url: 'https://vendor.com/a', is_deleted: false },
        ],
      })
    );
    expect(v!.reference).toBe('https://vendor.com/a');
  });

  it('skips deleted references when picking a link', () => {
    const v = mapDbugsRow(
      row({
        references: [
          { domain: 'x.com', source: 'Vendor Advisory', ref_url: 'https://x.com/a', is_deleted: true },
          { domain: 'y.com', source: 'Blog', ref_url: 'https://y.com/b', is_deleted: false },
        ],
      })
    );
    expect(v!.reference).toBe('https://y.com/b');
  });

  it('defaults updated to created when absent', () => {
    expect(mapDbugsRow(row({ updated: undefined }))!.updated).toBe('2026-10-01');
  });
});

describe('parseDbugsPayload', () => {
  it('parses a live-shaped payload', () => {
    const out = parseDbugsPayload({ count: 435392, rows: [row(), row({ cve_id: 'CVE-2026-103280' })] });
    expect(out).not.toBeNull();
    expect(out).toHaveLength(2);
  });

  // The upstream returns HTTP 200 with `rows` ABSENT when `limit` exceeds 50.
  // Without this, an over-asking caller reads as "0 vulns published", which is
  // indistinguishable from a dead source at the aggregate level.
  it('treats a missing rows array as unusable (over-cap limit returns 200 + no rows)', () => {
    expect(parseDbugsPayload({ count: 435392 })).toBeNull();
    expect(parseDbugsPayload({ details: [{ type: 'less_than_equal', loc: ['body', 'limit'] }] })).toBeNull();
  });

  it('treats an empty rows array as unusable, not as a quiet day', () => {
    expect(parseDbugsPayload({ count: 435392, rows: [] })).toBeNull();
  });

  it('rejects non-object payloads', () => {
    expect(parseDbugsPayload(null)).toBeNull();
    expect(parseDbugsPayload('<html>502</html>')).toBeNull();
  });

  it('dedupes by CVE id and drops unmappable rows', () => {
    const out = parseDbugsPayload({
      rows: [row(), row(), row({ cve_id: null }), row({ created: '' })],
    });
    expect(out).toHaveLength(1);
  });

  it('returns null when every row is unmappable', () => {
    expect(parseDbugsPayload({ rows: [row({ cve_id: null })] })).toBeNull();
  });
});

describe('DBUGS_MAX_LIMIT', () => {
  it('pins the verified upstream cap at 50', () => {
    // Verified live: limit=50 returns 50 rows; limit=51 returns 200 with a
    // `less_than_equal` validation envelope and zero rows.
    expect(DBUGS_MAX_LIMIT).toBe(50);
  });
});
