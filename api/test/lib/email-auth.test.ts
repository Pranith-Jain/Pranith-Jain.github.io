import { describe, it, expect } from 'vitest';
import { parseSpf, parseDmarc, parseBimi, parseMtaSts, parseTlsRpt, evaluateEmailAuth } from '../../src/lib/email-auth';

describe('parseSpf', () => {
  it('detects strict policy with -all', () => {
    expect(parseSpf(['v=spf1 ip4:1.2.3.4 -all'])).toEqual({
      present: true,
      policy: 'fail',
      record: 'v=spf1 ip4:1.2.3.4 -all',
    });
  });
  it('detects soft-fail', () => {
    expect(parseSpf(['v=spf1 ~all']).policy).toBe('softfail');
  });
  it('detects neutral', () => {
    expect(parseSpf(['v=spf1 ?all']).policy).toBe('neutral');
  });
  it('absent when no v=spf1', () => {
    expect(parseSpf(['random text'])).toEqual({ present: false });
  });
});

describe('parseDmarc', () => {
  it('extracts policy + percentage', () => {
    expect(parseDmarc(['v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@example.com'])).toMatchObject({
      present: true,
      policy: 'reject',
      pct: 100,
    });
  });
  it('absent when no v=DMARC1', () => {
    expect(parseDmarc(['v=spf1 -all'])).toEqual({ present: false });
  });
});

describe('parseBimi', () => {
  it('extracts logo URI', () => {
    expect(parseBimi(['v=BIMI1; l=https://example.com/logo.svg'])).toEqual({
      present: true,
      logo: 'https://example.com/logo.svg',
    });
  });
});

describe('parseMtaSts', () => {
  it('parses valid policy', () => {
    const policy = 'version: STSv1\nmode: enforce\nmx: mail.example.com\nmax_age: 86400';
    expect(parseMtaSts(policy)).toEqual({ present: true, mode: 'enforce', maxAge: 86400 });
  });
  it('absent on empty body', () => {
    expect(parseMtaSts('')).toEqual({ present: false });
  });
});

describe('parseTlsRpt', () => {
  it('extracts rua', () => {
    expect(parseTlsRpt(['v=TLSRPTv1; rua=mailto:tls@example.com'])).toEqual({
      present: true,
      rua: 'mailto:tls@example.com',
    });
  });
});

describe('evaluateEmailAuth', () => {
  it('strong when SPF -all + DMARC reject + DKIM + MTA-STS enforce', () => {
    const e = evaluateEmailAuth({
      spf: { present: true, policy: 'fail' },
      dmarc: { present: true, policy: 'reject', pct: 100 },
      dkimSelectorsFound: ['default'],
      bimi: { present: false },
      mtaSts: { present: true, mode: 'enforce' },
      tlsRpt: { present: true },
    });
    expect(e.score).toBeGreaterThanOrEqual(80);
    expect(e.verdict).toBe('strong');
  });

  it('weak when nothing is present', () => {
    const e = evaluateEmailAuth({
      spf: { present: false },
      dmarc: { present: false },
      dkimSelectorsFound: [],
      bimi: { present: false },
      mtaSts: { present: false },
      tlsRpt: { present: false },
    });
    expect(e.verdict).toBe('weak');
    expect(e.weaknesses.length).toBeGreaterThan(0);
  });
});
