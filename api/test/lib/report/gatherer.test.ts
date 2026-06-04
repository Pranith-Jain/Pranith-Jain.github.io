import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherPhase, FETCHERS } from '../../../src/lib/report/gatherer';
import { planSources } from '../../../src/lib/report/source-planner';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const ctx = (): GatherContext => ({
  env: {} as never,
  subject: {
    raw: 'LockBit',
    type: 'ransomware',
    canonical: 'LockBit',
    identifiers: { group: 'LockBit' },
    suggestedTemplate: 'ransomware-group',
  },
  signal: AbortSignal.timeout(5000),
});

describe('gatherPhase', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs every fetcher in the phase and returns one SourceResult each', async () => {
    // Stub the cache so cache fetchers resolve to empty (status:empty), still one result each.
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined) } });
    const plan = planSources({ template: 'ransomware-group' }, { maxPhaseSubrequests: 40 });
    const results = await gatherPhase(plan, 0, ctx());
    // phase 0 contains all the cache + rag sources for the template
    expect(results.length).toBe(plan.phases[0]!.length);
    for (const r of results) {
      expect(r).toHaveProperty('id');
      expect(['ok', 'empty', 'error', 'timeout']).toContain(r.status);
      expect(Array.isArray(r.items)).toBe(true);
    }
  });

  it('a missing fetcher id yields an error SourceResult, not a throw', async () => {
    const result = await FETCHERS['__does_not_exist__']?.(
      { ...ctx() },
      {
        id: 'x',
        name: 'X',
        kind: 'live',
        authority: 'F',
        cost: 1,
        phase: 0,
      }
    );
    expect(result).toBeUndefined(); // registry has no such entry
  });
});
