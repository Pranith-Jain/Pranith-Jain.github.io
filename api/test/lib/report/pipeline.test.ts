import { describe, it, expect } from 'vitest';
import { advance, initState, type ReportState, type PipelineDeps } from '../../../src/lib/report/pipeline';
import type { SourceResult } from '../../../src/lib/report/types';

// Fake gatherer: one ok source per call.
const fakeGather = async (_plan: unknown, phase: number): Promise<SourceResult[]> => [
  {
    id: `src-${phase}`,
    name: `Src ${phase}`,
    authority: 'B',
    fetched_at: '2026-06-04T00:00:00Z',
    status: 'ok',
    total: 1,
    items: [{ text: 'LockBit uses T1486' }],
  },
];

// Fake model: outline returns one section; section/summary return prose citing [1].
const fakeRun = async (_ai: unknown, input: { system: string }) =>
  input.system.includes('OUTLINE')
    ? { text: JSON.stringify({ sections: [{ id: 'overview', evidenceRefs: [1] }] }), modelUsed: 'fake' }
    : { text: 'LockBit operates as RaaS [1].', modelUsed: 'fake' };

const deps = (): PipelineDeps => ({
  env: {} as never,
  write: { ai: {} as never, groqKey: undefined, runCompletion: fakeRun as never },
  gather: fakeGather as never,
  now: () => Date.parse('2026-06-04T00:00:00Z'),
});

async function runToCompletion(start: ReportState, d: PipelineDeps): Promise<ReportState[]> {
  const trace: ReportState[] = [start];
  let s = start;
  for (let i = 0; i < 30 && s.phase !== 'done' && s.phase !== 'error'; i++) {
    s = await advance(s, d);
    trace.push(s);
  }
  return trace;
}

describe('pipeline advance', () => {
  it('walks resolve→plan→gather→validate→rank→write→assemble→done', async () => {
    const trace = await runToCompletion(initState('rep-1', 'LockBit', 'ransomware-group', 'AMBER'), deps());
    const phases = trace.map((s) => s.phase);
    expect(phases[0]).toBe('resolve');
    expect(phases).toContain('plan');
    expect(phases).toContain('gather');
    expect(phases).toContain('validate');
    expect(phases).toContain('rank');
    expect(phases).toContain('write');
    expect(phases).toContain('assemble');
    expect(phases[phases.length - 1]).toBe('done');
  });

  it('produces a done Report with the input TLP', async () => {
    const trace = await runToCompletion(initState('rep-1', 'LockBit', 'ransomware-group', 'RED'), deps());
    const final = trace[trace.length - 1]!;
    expect(final.report).toBeDefined();
    expect(final.report!.meta.status).toBe('done');
    expect(final.report!.cover.tlp).toBe('RED');
    expect(final.report!.sections.length).toBeGreaterThan(0);
  });

  it('auto-selects a template when none is given', async () => {
    const first = await advance(initState('rep-2', 'CVE-2024-1709', undefined, 'AMBER'), deps());
    expect(first.input.template).toBe('cve');
  });

  it('captures errors into the error phase instead of throwing', async () => {
    const boom: PipelineDeps = {
      ...deps(),
      gather: (async () => {
        throw new Error('gather boom');
      }) as never,
    };
    const trace = await runToCompletion(initState('rep-3', 'LockBit', 'ransomware-group', 'AMBER'), boom);
    const final = trace[trace.length - 1]!;
    expect(final.phase).toBe('error');
    expect(final.error).toContain('gather boom');
  });
});
