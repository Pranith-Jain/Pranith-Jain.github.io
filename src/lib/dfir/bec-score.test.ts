import { describe, it, expect } from 'vitest';
import { assess } from './bec-score';
import type { DomainApiResponse } from './bec-score';

function mockDomain(overrides: Partial<DomainApiResponse['email_auth']> = {}): DomainApiResponse {
  return {
    domain: 'example.com',
    email_auth: {
      spf: { present: true, policy: 'fail', record: 'v=spf1 -all' },
      dmarc: {
        present: true,
        policy: 'reject',
        pct: 100,
        record: 'v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@example.com',
      },
      dkim: { selectors_found: ['google'] },
      bimi: { present: true, logo: 'https://example.com/logo.svg' },
      mta_sts: { present: true, mode: 'enforce' },
      tls_rpt: { present: true, rua: 'mailto:tls@example.com' },
      ...overrides,
    },
  };
}

describe('assess', () => {
  it('returns safe for fully configured domain', () => {
    const r = assess(mockDomain());
    expect(r.grade).toBe('safe');
    expect(r.spoofScore).toBeLessThanOrEqual(10);
    expect(r.gaps).toHaveLength(0);
    expect(r.positives.length).toBeGreaterThanOrEqual(4);
  });

  it('flags missing SPF', () => {
    const r = assess(mockDomain({ spf: { present: false }, dmarc: { present: false } }));
    expect(r.gaps.some((g) => g.id === 'spf-missing')).toBe(true);
    expect(r.spoofScore).toBeGreaterThanOrEqual(30);
    expect(r.spoofScore).toBeLessThanOrEqual(100);
  });

  it('flags missing DMARC as critical', () => {
    const r = assess(mockDomain({ dmarc: { present: false } }));
    expect(r.gaps.some((g) => g.id === 'dmarc-missing')).toBe(true);
    expect(r.spoofScore).toBeGreaterThanOrEqual(35);
  });

  it('flags DMARC p=none', () => {
    const r = assess(mockDomain({ dmarc: { present: true, policy: 'none', pct: 100 } }));
    expect(r.gaps.some((g) => g.id === 'dmarc-none')).toBe(true);
  });

  it('flags no DKIM selectors', () => {
    const r = assess(mockDomain({ dkim: { selectors_found: [] } }));
    expect(r.gaps.some((g) => g.id === 'dkim-no-selector')).toBe(true);
  });

  it('flags missing MTA-STS', () => {
    const r = assess(mockDomain({ mta_sts: { present: false } }));
    expect(r.gaps.some((g) => g.id === 'mta-sts-missing')).toBe(true);
  });

  it('flags missing BIMI', () => {
    const r = assess(mockDomain({ bimi: { present: false } }));
    expect(r.gaps.some((g) => g.id === 'bimi-missing')).toBe(true);
  });

  it('flags missing TLS-RPT', () => {
    const r = assess(mockDomain({ tls_rpt: { present: false } }));
    expect(r.gaps.some((g) => g.id === 'tls-rpt-missing')).toBe(true);
  });

  it('flags SPF softfail', () => {
    const r = assess(mockDomain({ spf: { present: true, policy: 'softfail' } }));
    expect(r.gaps.some((g) => g.id === 'spf-softfail')).toBe(true);
  });

  it('detects missing subdomain policy', () => {
    const r = assess(mockDomain({ dmarc: { present: true, policy: 'reject', record: 'v=DMARC1; p=reject' } }));
    expect(r.gaps.some((g) => g.id === 'dmarc-no-sp')).toBe(true);
  });

  it('detects DMARC pct < 100', () => {
    const r = assess(
      mockDomain({ dmarc: { present: true, policy: 'reject', pct: 50, record: 'v=DMARC1; p=reject; pct=50' } })
    );
    expect(r.gaps.some((g) => g.id === 'dmarc-pct')).toBe(true);
  });

  it('detects missing DMARC rua', () => {
    const r = assess(
      mockDomain({ dmarc: { present: true, policy: 'reject', pct: 100, record: 'v=DMARC1; p=reject; sp=reject' } })
    );
    expect(r.gaps.some((g) => g.id === 'dmarc-no-rua')).toBe(true);
  });

  it('caps score at 100', () => {
    const r = assess(mockDomain({ spf: { present: false }, dmarc: { present: false } }));
    expect(r.spoofScore).toBeLessThanOrEqual(100);
  });

  it('score >= 0', () => {
    const r = assess(mockDomain());
    expect(r.spoofScore).toBeGreaterThanOrEqual(0);
  });
});
