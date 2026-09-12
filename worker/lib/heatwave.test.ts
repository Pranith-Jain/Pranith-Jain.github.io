/**
 * Tests for the Heatwave lookup parser.
 * Fixtures are trimmed-but-faithful snapshots of lookup.validity.tools
 * result pages (verified live 2026-09-12). Run via:
 *   npx vitest run worker/lib/heatwave.test.ts
 */
import { describe, it, expect } from 'vitest';
import { parseHeatwavePage, normalizeHeatwaveDomain, heatwaveVerdict } from './heatwave';

const WARMING = [
  'Domain Lookup - Heatwave Domain Blocklist',
  'Check domain Enter a domain, such as example.com . Do not enter a URL, email address, or IP address.',
  'Listed Warming connectionmanleycreative.com Synthetic reputation warming observed',
  'Validity observed and validated synthetic reputation-warming activity associated with this domain.',
  'Classification Warming Observation age < 7 days since first observation Listing score 71 / 100',
  'relative band vs recent listings First observed 2026-09-12 Last observed 2026-09-12 Listed since 2026-09-12',
  'DNS answer connectionmanleycreative.com.bl.validity.tools → 127.0.71.2',
  'How to read this DNS answer Octet Field Possible values Meaning 127 Prefix 127 Fixed.',
].join(' ');

const ACTIVE = [
  'Listed Active tryversafiteam.com Active cold outreach observed',
  'Classification Active outreach Observation age 30 – 90 days Listing score 49 / 100',
  'First observed 2026-06-01 Last observed 2026-09-12 Listed since 2026-06-01',
  'DNS answer tryversafiteam.com.bl.validity.tools → 127.2.49.3',
].join(' ');

const PREWARM = [
  'Listed Pre-warming topoffunnelcreator.com Pre-warming observation',
  'Classification Pre-warming Listing score 0 / 100',
  'DNS answer topoffunnelcreator.com.bl.validity.tools → 127.0.0.4',
].join(' ');

const NOT_LISTED = [
  'Do not enter a URL, email address, or IP address.',
  'Not currently listed example.com This domain is not on the Heatwave Domain Blocklist.',
  'Related listed domains may warrant investigation Heatwave found 3 listed domains with names similar to example .',
  'Showing 3 of 3. Domain Classification Listing score Listed',
  'appexample.org Warming 89 / 100 2026-07-30',
  'pollexample.com Warming 82 / 100 2026-07-30',
  'dockexample.com Active 58 / 100 2026-08-17',
].join(' ');

describe('normalizeHeatwaveDomain', () => {
  it('reduces URLs, emails and case to a bare domain', () => {
    expect(normalizeHeatwaveDomain('https://Mail.Example.COM/x')).toBe('mail.example.com');
    expect(normalizeHeatwaveDomain('user@example.com')).toBe('example.com');
    expect(normalizeHeatwaveDomain('  EXAMPLE.COM. ')).toBe('example.com');
  });

  it('rejects IPs, garbage and bare TLDs', () => {
    expect(normalizeHeatwaveDomain('1.2.3.4')).toBeNull();
    expect(normalizeHeatwaveDomain('not a domain')).toBeNull();
    expect(normalizeHeatwaveDomain('com')).toBeNull();
    expect(normalizeHeatwaveDomain('')).toBeNull();
  });
});

describe('parseHeatwavePage', () => {
  it('parses a warming listing with DNS decode', () => {
    const r = parseHeatwavePage('connectionmanleycreative.com', WARMING);
    expect(r?.listed).toBe(true);
    expect(r?.status).toBe('warming');
    expect(r?.stage).toBe(2);
    expect(r?.score).toBe(71);
    expect(r?.observation_age).toBe('< 7 days');
    expect(r?.first_observed).toBe('2026-09-12');
    expect(r?.listed_since).toBe('2026-09-12');
    expect(r?.dns_answer).toBe('connectionmanleycreative.com.bl.validity.tools → 127.0.71.2');
  });

  it('parses an active listing as stage 3', () => {
    const r = parseHeatwavePage('tryversafiteam.com', ACTIVE);
    expect(r?.listed).toBe(true);
    expect(r?.status).toBe('active');
    expect(r?.stage).toBe(3);
    expect(r?.score).toBe(49);
  });

  it('parses a pre-warming listing as stage 4 with score 0', () => {
    const r = parseHeatwavePage('topoffunnelcreator.com', PREWARM);
    expect(r?.listed).toBe(true);
    expect(r?.status).toBe('pre-warming');
    expect(r?.stage).toBe(4);
    expect(r?.score).toBe(0);
  });

  it('parses not-listed with the related-domains pivot table', () => {
    const r = parseHeatwavePage('example.com', NOT_LISTED);
    expect(r?.listed).toBe(false);
    expect(r?.status).toBe('not-listed');
    expect(r?.related).toHaveLength(3);
    expect(r?.related[2]).toMatchObject({ domain: 'dockexample.com', classification: 'Active', score: 58 });
  });

  it('requires the queried domain echo — foreign tables do not false-positive', () => {
    // WARMING text names a different domain than queried.
    const r = parseHeatwavePage('unrelated.example', WARMING);
    expect(r).toBeNull();
  });

  it('returns null on unrecognized pages (bot-wall / redesign)', () => {
    expect(parseHeatwavePage('x.example', 'Just a moment… verifying you are human')).toBeNull();
  });
});

describe('heatwaveVerdict', () => {
  it('grades active above warming, pre-warming advisory, not-listed unknown', () => {
    const active = heatwaveVerdict(parseHeatwavePage('tryversafiteam.com', ACTIVE)!);
    expect(active).toMatchObject({ verdict: 'suspicious', score: 65 });
    expect(active.tags).toContain('stage:3');

    const warming = heatwaveVerdict(parseHeatwavePage('connectionmanleycreative.com', WARMING)!);
    expect(warming).toMatchObject({ verdict: 'suspicious', score: 40 });

    const pre = heatwaveVerdict(parseHeatwavePage('topoffunnelcreator.com', PREWARM)!);
    expect(pre.verdict).toBe('unknown');
    expect(pre.tags).toContain('not-observed-sending');

    const clean = heatwaveVerdict(parseHeatwavePage('example.com', NOT_LISTED)!);
    expect(clean).toMatchObject({ verdict: 'unknown', score: 0 });
  });
});
