import { describe, it, expect } from 'vitest';
import { buildPriorIntelNote, type InvestigationMemoryEntry } from '../../src/lib/agent/investigation-memory';

function entry(partial: Partial<InvestigationMemoryEntry>): InvestigationMemoryEntry {
  return {
    id: 'x',
    query: 'q',
    queryType: 'cve',
    iocs: [],
    actors: [],
    mitre: [],
    cves: [],
    keyFindings: [],
    qualityScore: 80,
    modelUsed: 'm',
    completedAt: '2026-01-01',
    ...partial,
  };
}

describe('buildPriorIntelNote', () => {
  it('returns empty string for no related investigations', () => {
    expect(buildPriorIntelNote([])).toBe('');
  });

  it('summarises related investigations with actors/CVEs/findings', () => {
    const note = buildPriorIntelNote([
      entry({
        query: 'CVE-2024-1234',
        cves: ['CVE-2024-1234'],
        actors: ['APT28'],
        keyFindings: ['Exploited in the wild'],
      }),
    ]);
    expect(note).toContain('<prior_intelligence>');
    expect(note).toContain('CVE-2024-1234');
    expect(note).toContain('APT28');
    expect(note).toContain('Exploited in the wild');
    expect(note).toContain('quality 80/100');
  });

  it('caps the number of entries', () => {
    const entries = [1, 2, 3, 4, 5].map((i) => entry({ query: `q${i}` }));
    const note = buildPriorIntelNote(entries, 2);
    expect(note).toContain('q1');
    expect(note).toContain('q2');
    expect(note).not.toContain('q3');
  });
});
