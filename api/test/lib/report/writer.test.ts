import { describe, it, expect } from 'vitest';
import { writeReport } from '../../../src/lib/report/writer';
import type { RankedItem } from '../../../src/lib/report/ranker';

const evidence: RankedItem[] = [
  { sourceId: 'ransomwarelive-profile', authority: 'B', text: 'LockBit is a RaaS operation.', score: 0.9 },
  { sourceId: 'mitre-group', authority: 'A', text: 'T1486 Data Encrypted for Impact (Impact)', score: 0.95 },
];

// Fake model: returns an outline for the outline pass, else a section body that cites [1].
const fakeRun = async (_ai: unknown, input: { system: string; user: string }) => {
  if (input.system.includes('OUTLINE')) {
    return {
      text: JSON.stringify({
        sections: [
          { id: 'overview', evidenceRefs: [1] },
          { id: 'ttps', evidenceRefs: [2] },
        ],
      }),
      modelUsed: 'fake',
    };
  }
  return { text: 'LockBit operates as RaaS [1]. It uses T1486 [2].', modelUsed: 'fake' };
};

describe('writeReport', () => {
  it('produces sections + an executive summary citing only known refs', async () => {
    const out = await writeReport(
      { subject: 'LockBit', template: 'ransomware-group', evidence, conflicts: [] },
      { ai: {} as never, groqKey: undefined, runCompletion: fakeRun as never }
    );
    expect(out.sections.length).toBeGreaterThan(0);
    expect(out.executive_summary.length).toBeGreaterThan(0);
    expect(out.modelUsed).toBe('fake');
    // citations resolve: every [n] in any section body has an entry
    const maxRef = out.citations.length;
    const refsUsed = out.sections.flatMap((s) => s.refs);
    refsUsed.forEach((r) => expect(r).toBeLessThanOrEqual(maxRef));
  });

  it('strips an unverified bracket id the model invented', async () => {
    const hallucinate = async (_ai: unknown, input: { system: string }) =>
      input.system.includes('OUTLINE')
        ? { text: JSON.stringify({ sections: [{ id: 'overview', evidenceRefs: [1] }] }), modelUsed: 'fake' }
        : { text: 'It exploits CVE-2099-0001 [1].', modelUsed: 'fake' };
    const out = await writeReport(
      {
        subject: 'LockBit',
        template: 'ransomware-group',
        evidence,
        conflicts: [],
        allowlist: { cves: [], mitre: ['T1486'], actors: ['LockBit'] },
      },
      { ai: {} as never, groqKey: undefined, runCompletion: hallucinate as never }
    );
    // CVE-2099-0001 is not on the allowlist → flagged
    expect(out.sections[0]?.body_md).toContain('[unverified]');
  });
});
