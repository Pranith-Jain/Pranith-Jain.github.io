import { describe, it, expect } from 'vitest';
import { extractQueryEntities, hasIndicators } from '../../src/lib/agent/query-entities';
import { buildPivotChain } from '../../src/lib/agent/pivot-chain';
import { filterIocs, filterIocEntries, extractInfrastructure } from '../../src/lib/agent/ioc-filter';
import { pickCtiSkillForQuery, filterCtiSkills, type CtiSkillIndexEntry } from '../../src/lib/cti-skills-manifest';

// The Qilin report that exposed the false-IOC problem
const QILIN_FALSE_IOCS = [
  'duck.com', // from xenoz84@duck.com email
  'www.ransomlook.io', // citation URL
  'ransomlook.io', // citation URL
  'elumax.com', // victim domain
  'www.elumax.com', // victim domain
  'lasevillanita.com', // victim domain
  'www.integer.net', // victim domain
];

const CTI_INDEX = {
  source: 'test',
  license: 'MIT',
  generatedAt: '2026-08-06',
  counts: { skills: 6 },
  skills: [
    {
      slug: 'ransomware-actor-deep-dive',
      name: 'Ransomware Actor Deep-Dive',
      category: 'Investigation Methodology',
      description: 'Profile a ransomware group.',
      triggerKeywords: ['ransomware', 'lockbit', 'qilin', 'clop', 'leak site', 'double extortion'],
    },
    {
      slug: 'ioc-pivot-investigation',
      name: 'IOC Pivot Investigation',
      category: 'Investigation Methodology',
      description: 'Follow an indicator.',
      triggerKeywords: ['hash', 'sha256', 'domain', 'ip', 'url', 'c2', 'infrastructure', 'pivot', 'trace'],
    },
  ] as CtiSkillIndexEntry[],
};

describe('Qilin investigation integration', () => {
  it('extracts Qilin as an actor entity', () => {
    const entities = extractQueryEntities('Qilin ransomware');
    expect(entities.actors).toContain('Qilin');
    expect(hasIndicators(entities)).toBe(true);
  });

  it('picks the ransomware deep-dive CTI skill for a Qilin query', () => {
    const skill = pickCtiSkillForQuery(CTI_INDEX, 'Qilin ransomware', 'ransomware');
    expect(skill?.slug).toBe('ransomware-actor-deep-dive');
  });

  it('builds an actor pivot chain for Qilin (enrich_actor + timeline + group profile + activity)', () => {
    const entities = extractQueryEntities('Qilin ransomware');
    const chain = buildPivotChain(entities);
    expect(chain.length).toBeGreaterThanOrEqual(4);
    const tools = chain.map((c) => c.tool);
    expect(tools).toContain('enrich_actor');
    expect(tools).toContain('actor_timeline');
    expect(tools).toContain('get_ransomware_group_profile');
    expect(tools).toContain('get_ransomware_activity');
  });

  it('drops the Qilin false IOCs (citation URLs, email domains, victim domains)', () => {
    const filtered = filterIocs(QILIN_FALSE_IOCS);
    // duck.com and ransomlook.io MUST be dropped (source/email domains)
    expect(filtered).not.toContain('duck.com');
    expect(filtered).not.toContain('ransomlook.io');
    expect(filtered).not.toContain('www.ransomlook.io');
    // The filter drops source domains + their subdomains, but victim domains
    // (elumax.com etc.) are NOT in SOURCE_DOMAINS — they're dropped by the
    // victim-domain filter (filterIocEntriesWithVictims) which cross-references
    // against ransomware activity tool results.
  });

  it('drops victim domains from the action-card IOC list via filterIocEntriesWithVictims', async () => {
    const { filterIocEntriesWithVictims } = await import('../../src/lib/agent/ioc-filter');
    const entries = QILIN_FALSE_IOCS.map((v) => ({
      type: 'domain' as const,
      value: v,
      confidence: 'Probable' as const,
    }));
    // Simulate the ransomware activity tool results that contain the victim domains
    const steps = [
      {
        tool: 'get_ransomware_activity',
        data: { posts: [{ victim: 'elumax.com' }, { victim: 'lasevillanita.com' }, { victim: 'www.integer.net' }] },
      },
    ];
    const filtered = filterIocEntriesWithVictims(entries, steps);
    const values = filtered.map((e) => e.value);
    // Victim domains MUST be dropped
    expect(values).not.toContain('elumax.com');
    expect(values).not.toContain('www.elumax.com');
    expect(values).not.toContain('lasevillanita.com');
    expect(values).not.toContain('www.integer.net');
    // Source/email domains MUST also be dropped
    expect(values).not.toContain('duck.com');
    expect(values).not.toContain('ransomlook.io');
    expect(values).not.toContain('www.ransomlook.io');
    // The list should be EMPTY (all 7 were false IOCs)
    expect(values).toHaveLength(0);
  });

  it('extracts real Qilin infrastructure from tool results (onion + payment)', () => {
    const toolResults = [
      {
        tool: 'get_ransomware_group_profile',
        data: {
          name: 'Qilin',
          leak_url: 'http://qilinblogxyz4aiyfxes5njqm7t6i5ib6t4bxg4uqisi6f3nks2e3fjid.onion/',
          payment: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        },
      },
    ];
    const infra = extractInfrastructure(toolResults);
    expect(infra.some((a) => a.type === 'onion' && a.value.includes('.onion'))).toBe(true);
    expect(infra.some((a) => a.type === 'payment_address' && a.value.startsWith('bc1'))).toBe(true);
  });

  it('filterIocEntries drops false IOCs from the action-card IOC list', () => {
    const entries = QILIN_FALSE_IOCS.map((v) => ({
      type: 'domain' as const,
      value: v,
      confidence: 'Probable' as const,
    }));
    const filtered = filterIocEntries(entries);
    const values = filtered.map((e) => e.value);
    expect(values).not.toContain('duck.com');
    expect(values).not.toContain('ransomlook.io');
    expect(values).not.toContain('www.ransomlook.io');
  });
});
