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

  // ─────────────────────────────────────────────────────────────────────────
  // REGRESSION (audit 2026-08): prior intel must be ordered by quality desc so
  // the highest-quality investigation anchors the planner, and the instruction
  // must frame it as a hint to verify (not established fact) so a stale/wrong
  // prior attribution does not get re-asserted.
  // ─────────────────────────────────────────────────────────────────────────
  it('orders entries by quality score desc (highest-quality wins the slice)', () => {
    const entries = [
      entry({ query: 'low-quality-prior', qualityScore: 40, completedAt: '2026-01-03' }),
      entry({ query: 'high-quality-prior', qualityScore: 95, completedAt: '2026-01-01' }),
      entry({ query: 'mid-quality-prior', qualityScore: 70, completedAt: '2026-01-02' }),
    ];
    const note = buildPriorIntelNote(entries, 2);
    // The two highest-quality entries should appear; the low-quality one should not
    expect(note).toContain('high-quality-prior');
    expect(note).toContain('mid-quality-prior');
    expect(note).not.toContain('low-quality-prior');
    // high-quality should appear before mid-quality (quality desc)
    const highIdx = note.indexOf('high-quality-prior');
    const midIdx = note.indexOf('mid-quality-prior');
    expect(highIdx).toBeLessThan(midIdx);
  });

  it('frames prior intel as a hint to verify, not established fact', () => {
    const note = buildPriorIntelNote([entry({ query: 'q' })]);
    expect(note).toContain('NOT as established fact');
    expect(note).toContain('verify each prior finding');
    expect(note).toContain('current tool wins');
    // The old instruction that risked re-asserting stale attributions is gone
    expect(note).not.toContain('do not re-discover what is already known');
  });
});
