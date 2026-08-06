import { describe, it, expect } from 'vitest';
import { filterCtiSkills, pickCtiSkillForQuery, type CtiSkillIndexEntry } from '../../src/lib/cti-skills-manifest';

const MOCK_INDEX = {
  source: 'test',
  license: 'MIT',
  generatedAt: '2026-08-06',
  counts: { skills: 6 },
  skills: [
    {
      slug: 'ioc-pivot-investigation',
      name: 'IOC Pivot Investigation',
      category: 'Investigation Methodology',
      description: 'Follow an indicator through its infrastructure graph.',
      triggerKeywords: ['hash', 'sha256', 'domain', 'ip', 'url', 'c2', 'infrastructure', 'pivot', 'trace'],
    },
    {
      slug: 'ransomware-actor-deep-dive',
      name: 'Ransomware Actor Deep-Dive',
      category: 'Investigation Methodology',
      description: 'Profile a ransomware group.',
      triggerKeywords: ['ransomware', 'lockbit', 'qilin', 'clop', 'leak site', 'double extortion'],
    },
    {
      slug: 'cve-triage-and-exploitation',
      name: 'CVE Triage & Exploitation Analysis',
      category: 'Investigation Methodology',
      description: 'Triage a CVE.',
      triggerKeywords: ['cve', 'vulnerability', 'cvss', 'kev', 'exploit', 'patch', 'rce', 'zero-day', 'cisa'],
    },
    {
      slug: 'apt-actor-profiling',
      name: 'APT Actor Profiling',
      category: 'Investigation Methodology',
      description: 'Profile a nation-state/APT actor.',
      triggerKeywords: ['apt', 'nation-state', 'lazarus', 'sandworm', 'espionage'],
    },
  ] as CtiSkillIndexEntry[],
};

describe('filterCtiSkills', () => {
  it('returns all skills with no filter', () => {
    const result = filterCtiSkills(MOCK_INDEX);
    expect(result).toHaveLength(4);
  });

  it('filters by category (case-insensitive substring)', () => {
    const result = filterCtiSkills(MOCK_INDEX, { category: 'investigation' });
    expect(result).toHaveLength(4);
  });

  it('filters by keyword (matches name, description, triggerKeywords)', () => {
    const result = filterCtiSkills(MOCK_INDEX, { keyword: 'ransomware' });
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('ransomware-actor-deep-dive');
  });

  it('keyword matches trigger keywords', () => {
    const result = filterCtiSkills(MOCK_INDEX, { keyword: 'sha256' });
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('ioc-pivot-investigation');
  });

  it('respects the limit', () => {
    const result = filterCtiSkills(MOCK_INDEX, { limit: 2 });
    expect(result).toHaveLength(2);
  });
});

describe('pickCtiSkillForQuery', () => {
  it('picks the IOC pivot skill for a hash query', () => {
    const skill = pickCtiSkillForQuery(
      MOCK_INDEX,
      'analyze 6f6ee01e9dc2d8c4c260ef4131fe88dc152e53ee8afd3e66e92d4e1bf5fd2e92',
      'ioc'
    );
    expect(skill?.slug).toBe('ioc-pivot-investigation');
  });

  it('picks the ransomware skill for a Qilin query', () => {
    const skill = pickCtiSkillForQuery(MOCK_INDEX, 'Qilin ransomware group', 'ransomware');
    expect(skill?.slug).toBe('ransomware-actor-deep-dive');
  });

  it('picks the CVE skill for a CVE query', () => {
    const skill = pickCtiSkillForQuery(MOCK_INDEX, 'CVE-2024-3094 exploitation', 'cve');
    expect(skill?.slug).toBe('cve-triage-and-exploitation');
  });

  it('picks the APT skill for a nation-state query', () => {
    const skill = pickCtiSkillForQuery(MOCK_INDEX, 'APT28 Fancy Bear espionage', 'actor');
    expect(skill?.slug).toBe('apt-actor-profiling');
  });

  it('returns null when no trigger keywords match', () => {
    const skill = pickCtiSkillForQuery(MOCK_INDEX, 'what is the weather today', 'generic');
    expect(skill).toBeNull();
  });

  it('scores longer keyword matches higher (ransomware + leak site beats just ransomware)', () => {
    // "ransomware leak site" matches both 'ransomware' (1 word) and 'leak site' (2 words)
    // in the ransomware skill, so it should win over a skill with only 'ransomware'
    const skill = pickCtiSkillForQuery(MOCK_INDEX, 'ransomware leak site analysis', 'ransomware');
    expect(skill?.slug).toBe('ransomware-actor-deep-dive');
  });
});
