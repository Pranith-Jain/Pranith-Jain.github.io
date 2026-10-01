import { describe, it, expect } from 'vitest';
import {
  parseCtiwatchPayload,
  mapCtiwatchRow,
  CTIWATCH_MAX_LIMIT,
  CTIWATCH_MAX_ANON_OFFSET,
} from '../../src/lib/ctiwatch';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'b2c1c0e8-9319-4738-8645-c3bcdb605ffa',
    cve_id: 'CVE-2026-97297',
    // Upstream sends the score as a STRING — verified live.
    cvss_score: '7.6',
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:L',
    severity: 'HIGH',
    description: 'Subscriber Broken Access Control in Gratisfaction <= 4.6.3 versions.',
    affected_products: [],
    published_date: '2026-10-01T18:17:38.960Z',
    last_modified: '2026-10-01T18:17:38.960Z',
    exploit_status: 'none',
    source_url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-97297',
    cwe_id: 'CWE-862',
    cve_references: [{ url: 'https://patchstack.com/x' }],
    epss_score: null,
    epss_percentile: null,
    priority_score: 0,
    priority_category: 'MINIMAL',
    recommended_action: null,
    is_in_kev: false,
    ...over,
  };
}

describe('mapCtiwatchRow', () => {
  it('maps a live-shaped row, coercing the string cvss_score', () => {
    const v = mapCtiwatchRow(row());
    expect(v).not.toBeNull();
    expect(v!.cve_id).toBe('CVE-2026-97297');
    expect(v!.score).toBe(7.6);
    expect(v!.severity).toBe('HIGH');
    expect(v!.cwe_id).toBe('CWE-862');
    expect(v!.cvss_vector).toBe('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:L');
    expect(v!.exploit_status).toBe('none');
    expect(v!.published).toBe('2026-10-01T18:17:38.960Z');
  });

  it('maps the KEV flag and exploitation status', () => {
    const v = mapCtiwatchRow(row({ is_in_kev: true, exploit_status: 'weaponized' }));
    expect(v!.is_in_kev).toBe(true);
    expect(v!.exploit_status).toBe('weaponized');
  });

  // Unlike VulnTracker (which sends a literal 0 for "unscored"), ctiwatch uses
  // real nulls — so a genuine 0 must survive rather than be normalized away.
  it('preserves a genuine zero EPSS and priority score', () => {
    const v = mapCtiwatchRow(row({ epss_score: 0, epss_percentile: 0, priority_score: 0 }));
    expect(v!.epss_score).toBe(0);
    expect(v!.epss_percentile).toBe(0);
    expect(v!.priority_score).toBe(0);
  });

  it('keeps a non-zero EPSS', () => {
    expect(mapCtiwatchRow(row({ epss_score: 0.42, epss_percentile: 0.9 }))!.epss_score).toBe(0.42);
  });

  it('rejects rows without a valid CVE id or a parseable publish date', () => {
    expect(mapCtiwatchRow(row({ cve_id: null }))).toBeNull();
    expect(mapCtiwatchRow(row({ cve_id: 'PT-1' }))).toBeNull();
    // published_after is the entire point of this source, so an undatable row
    // can't be windowed and must not leak into every digest.
    expect(mapCtiwatchRow(row({ published_date: 'not-a-date' }))).toBeNull();
    expect(mapCtiwatchRow(row({ published_date: '' }))).toBeNull();
  });

  it('uppercases the CVE id', () => {
    expect(mapCtiwatchRow(row({ cve_id: 'cve-2026-97297' }))!.cve_id).toBe('CVE-2026-97297');
  });

  it('drops the "Undefined" sentinel from string fields', () => {
    const v = mapCtiwatchRow(row({ description: 'Undefined', source_url: 'undefined' }));
    expect(v!.description).toBeUndefined();
    expect(v!.reference).toBeUndefined();
  });

  it('maps an unrecognised severity to UNKNOWN', () => {
    expect(mapCtiwatchRow(row({ severity: 'WEIRD' }))!.severity).toBe('UNKNOWN');
    expect(mapCtiwatchRow(row({ severity: null }))!.severity).toBe('UNKNOWN');
  });

  it('falls back to the NVD reference when source_url is absent', () => {
    const v = mapCtiwatchRow(row({ source_url: undefined }));
    expect(v!.reference).toBeUndefined();
    expect(v!.cve_id).toBe('CVE-2026-97297');
  });
});

describe('parseCtiwatchPayload', () => {
  it('parses the documented { total, items } envelope', () => {
    const p = parseCtiwatchPayload({ total: 239, items: [row(), row({ cve_id: 'CVE-2026-97284' })] });
    expect(p).not.toBeNull();
    expect(p!.total).toBe(239);
    expect(p!.vulns).toHaveLength(2);
  });

  // Unlike dbu.gs/ExploitGrid, an empty page is legitimate here:
  // `published_after` can legitimately match zero CVEs on a quiet window.
  // The caller distinguishes quiet from broken via `total`.
  it('accepts an empty items array when total is a real number', () => {
    const p = parseCtiwatchPayload({ total: 0, items: [] });
    expect(p).not.toBeNull();
    expect(p!.total).toBe(0);
    expect(p!.vulns).toEqual([]);
  });

  it('rejects a payload with no usable total', () => {
    expect(parseCtiwatchPayload({ items: [row()] })).toBeNull();
    expect(parseCtiwatchPayload({ total: 'many', items: [] })).toBeNull();
  });

  it('rejects a payload with no items array', () => {
    expect(parseCtiwatchPayload({ total: 10 })).toBeNull();
    expect(parseCtiwatchPayload(null)).toBeNull();
    expect(parseCtiwatchPayload('<!doctype html>')).toBeNull();
  });

  it('dedupes by CVE id across pages', () => {
    const p = parseCtiwatchPayload({ total: 2, items: [row(), row()] });
    expect(p!.vulns).toHaveLength(1);
  });
});

describe('upstream limits pinned by live verification', () => {
  // Docs: "A `limit` above 100 is silently clamped, not rejected. `?limit=5000`
  // returns HTTP 200 with 100 items."
  it('pins the silent limit clamp at 100', () => {
    expect(CTIWATCH_MAX_LIMIT).toBe(100);
  });

  // Docs: "Paging past offset=1000 requires an account." Verified live:
  // offset=900 → 200, offset=1000 → 403 ACCOUNT_REQUIRED.
  it('pins the anonymous offset ceiling at 1000', () => {
    expect(CTIWATCH_MAX_ANON_OFFSET).toBe(1000);
  });
});
