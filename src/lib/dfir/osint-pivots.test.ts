import { describe, it, expect } from 'vitest';
import { buildDorkQueries, deriveOsintTargets, tier2Pivots } from './osint-pivots';

describe('osint-pivots', () => {
  it('buildDorkQueries emits site-scoped dorks with the quoted address', () => {
    const qs = buildDorkQueries('0xABC');
    expect(qs.length).toBeGreaterThanOrEqual(6);
    const etherscan = qs.find((q) => /etherscan/i.test(q.label))!;
    expect(etherscan.q).toBe('"0xABC" site:etherscan.io');
    expect(etherscan.webUrl).toContain('google.com/search?q=');
    expect(etherscan.webUrl).toContain(encodeURIComponent('"0xABC" site:etherscan.io'));
    expect(etherscan.apiPath).toBe(`/api/v1/google-dorks?q=${encodeURIComponent('"0xABC" site:etherscan.io')}`);
  });

  it('deriveOsintTargets extracts a username from an ENS name', () => {
    const t = deriveOsintTargets('vitalik.eth');
    expect(t.ens).toBe('vitalik.eth');
    expect(t.usernames).toContain('vitalik');
  });

  it('deriveOsintTargets extracts a domain from a domain-shaped label', () => {
    expect(deriveOsintTargets('lazarus-group.io').domains).toContain('lazarus-group.io');
  });

  it('deriveOsintTargets returns no targets for a bare hex address', () => {
    const t = deriveOsintTargets('0x28c6c06298d514db089934071355e5743bf21d60');
    expect(t.ens).toBeNull();
    expect(t.domains).toHaveLength(0);
    expect(t.usernames).toHaveLength(0);
  });

  it('tier2Pivots maps a domain target to the real breach-route paths and is empty with no targets', () => {
    const links = tier2Pivots({ ens: null, domains: ['foo.com'], usernames: [] });
    const paths = links.map((l) => l.apiPath);
    expect(paths).toContain('/api/v1/breach/domain?domain=foo.com');
    expect(paths).toContain('/api/v1/breach/hudsonrock/domain?domain=foo.com');
    expect(paths).toContain('/api/v1/breach/leakix?q=foo.com');
    expect(tier2Pivots({ ens: null, domains: [], usernames: [] })).toHaveLength(0);
  });

  it('tier2Pivots username pivots use the real breach/threat-hunt paths', () => {
    const paths = tier2Pivots({ ens: null, domains: [], usernames: ['vitalik'] }).map((l) => l.apiPath);
    expect(paths).toContain('/api/v1/threat-hunt?q=vitalik');
    expect(paths).toContain('/api/v1/breach/proxynova?q=vitalik');
  });

  it('deriveOsintTargets never returns a non-.eth string as ens', () => {
    expect(deriveOsintTargets(null, '0x742d35Cc6634C0532925a3b844Bc454e4438f44e').ens).toBeNull();
    expect(deriveOsintTargets(null, 'somelabel').ens).toBeNull();
  });
});
