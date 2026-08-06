import { describe, it, expect } from 'vitest';
import { buildPivotChain, buildPivotFollowUps } from '../../src/lib/agent/pivot-chain';
import type { QueryEntities } from '../../src/lib/agent/query-entities';
import type { AgentToolResult } from '../../src/lib/agent/types';

const noEntities: QueryEntities = { ips: [], hashes: [], cves: [], domains: [], urls: [], actors: [] };

describe('buildPivotChain', () => {
  it('returns empty for CVE queries (no indicator to pivot)', () => {
    expect(buildPivotChain({ ...noEntities, cves: ['CVE-2017-0199'] })).toHaveLength(0);
  });

  it('builds a hash pivot chain starting with traceix_lookup', () => {
    const chain = buildPivotChain({
      ...noEntities,
      hashes: ['6f6ee01e9dc2d8c4c260ef4131fe88dc152e53ee8afd3e66e92d4e1bf5fd2e92'],
    });
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(chain[0]!.tool).toBe('traceix_lookup');
    expect(chain[0]!.args.hash).toBe('6f6ee01e9dc2d8c4c260ef4131fe88dc152e53ee8afd3e66e92d4e1bf5fd2e92');
  });

  it('builds a domain pivot chain with lookup_domain + passive_dns + relationships', () => {
    const chain = buildPivotChain({ ...noEntities, domains: ['thyssenkrupp-marinesystems.org'] });
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('lookup_domain');
    expect(tools).toContain('passive_dns_lookup');
    expect(tools).toContain('get_relationships');
    expect(chain[0]!.args.domain).toBe('thyssenkrupp-marinesystems.org');
  });

  it('builds an IP pivot chain with check_ioc + enrich + reverse_dns + relationships', () => {
    const chain = buildPivotChain({ ...noEntities, ips: ['89.245.139.187'] });
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('check_ioc');
    expect(tools).toContain('enrich_ioc_deep');
    expect(tools).toContain('lookup_reverse_dns');
    expect(tools).toContain('get_relationships');
    expect(chain[0]!.args.indicator).toBe('89.245.139.187');
  });

  it('builds a URL pivot chain extracting the host domain', () => {
    const chain = buildPivotChain({ ...noEntities, urls: ['http://evil.tld/payload.doc'] });
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('lookup_domain');
    expect(chain[0]!.args.domain).toBe('evil.tld');
  });

  it('does not double-enrich a domain that is also in a URL', () => {
    const chain = buildPivotChain({
      ...noEntities,
      domains: ['evil.tld'],
      urls: ['http://evil.tld/payload.doc'],
    });
    // domain takes precedence — URL host is the same domain, so no duplicate
    const domainCalls = chain.filter((c) => c.tool === 'lookup_domain');
    expect(domainCalls).toHaveLength(1);
  });

  it('builds an actor pivot chain with enrich_actor + timeline + group profile + activity', () => {
    const chain = buildPivotChain({ ...noEntities, actors: ['Qilin'] });
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('enrich_actor');
    expect(tools).toContain('actor_timeline');
    expect(tools).toContain('get_ransomware_group_profile');
    expect(tools).toContain('get_ransomware_activity');
    expect(chain[0]!.args.actor).toBe('qilin');
    expect(chain[2]!.args.slug).toBe('qilin');
    expect(chain[3]!.args.group).toBe('qilin');
  });

  it('normalizes APT actor names to slugs (APT40 → apt-40)', () => {
    const chain = buildPivotChain({ ...noEntities, actors: ['APT40'] });
    expect(chain[0]!.args.actor).toBe('apt-40');
  });

  it('does not run actor pivot when an IOC is also present (IOC pivot takes precedence)', () => {
    const chain = buildPivotChain({ ...noEntities, actors: ['Qilin'], ips: ['1.2.3.4'] });
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('check_ioc');
    expect(tools).not.toContain('enrich_actor');
  });
});

describe('buildPivotFollowUps', () => {
  it('extracts discovered IPs from traceix/passive-dns results and enqueues check_ioc', () => {
    const primary: QueryEntities = { ...noEntities, hashes: ['a'.repeat(64)] };
    const results: AgentToolResult[] = [
      {
        tool: 'traceix_lookup',
        args: { hash: 'a'.repeat(64) },
        status: 'ok',
        data: { contacted_ips: ['89.245.139.187', '8.8.8.8'], verdicts: [] },
        durationMs: 100,
      },
    ];
    const followUps = buildPivotFollowUps(primary, results);
    const tools = followUps.map((f) => f.tool);
    expect(tools).toContain('check_ioc');
    const ipCall = followUps.find((f) => f.tool === 'check_ioc')!;
    expect(['89.245.139.187', '8.8.8.8']).toContain(ipCall.args.indicator);
  });

  it('extracts discovered domains and enqueues passive_dns_lookup', () => {
    const primary: QueryEntities = { ...noEntities, ips: ['1.2.3.4'] };
    const results: AgentToolResult[] = [
      {
        tool: 'passive_dns_lookup',
        args: { q: 'evil.tld' },
        status: 'ok',
        data: { subdomains: ['media4football.thyssenkrupp-marinesystems.org'] },
        durationMs: 100,
      },
    ];
    const followUps = buildPivotFollowUps(primary, results);
    const domainCalls = followUps.filter((f) => f.tool === 'passive_dns_lookup');
    expect(domainCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not re-enqueue the primary indicator', () => {
    const primary: QueryEntities = { ...noEntities, ips: ['89.245.139.187'] };
    const results: AgentToolResult[] = [
      {
        tool: 'check_ioc',
        args: { indicator: '89.245.139.187' },
        status: 'ok',
        data: { related: ['89.245.139.187', '1.1.1.1'] },
        durationMs: 100,
      },
    ];
    const followUps = buildPivotFollowUps(primary, results);
    const indicators = followUps.map((f) => f.args.indicator);
    expect(indicators).not.toContain('89.245.139.187');
    expect(indicators).toContain('1.1.1.1');
  });

  it('returns empty when no indicators discovered', () => {
    const primary: QueryEntities = { ...noEntities, ips: ['1.2.3.4'] };
    const results: AgentToolResult[] = [
      { tool: 'check_ioc', args: { indicator: '1.2.3.4' }, status: 'ok', data: {}, durationMs: 100 },
    ];
    expect(buildPivotFollowUps(primary, results)).toHaveLength(0);
  });

  it('caps follow-ups at MAX_PARALLEL (4)', () => {
    const primary: QueryEntities = { ...noEntities, ips: ['1.2.3.4'] };
    const manyIps = Array.from({ length: 10 }, (_, i) => `10.0.0.${i}`);
    const results: AgentToolResult[] = [
      {
        tool: 'check_ioc',
        args: { indicator: '1.2.3.4' },
        status: 'ok',
        data: { ips: manyIps },
        durationMs: 100,
      },
    ];
    const followUps = buildPivotFollowUps(primary, results);
    expect(followUps.length).toBeLessThanOrEqual(4);
  });
});
