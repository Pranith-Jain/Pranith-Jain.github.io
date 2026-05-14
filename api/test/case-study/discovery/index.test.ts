import { describe, it, expect } from 'vitest';
import { runDiscovery } from '../../../src/case-study/discovery/index';
import type { Candidate } from '../../../src/case-study/types';

const sampleC = (key: string, type: any, score: number): Candidate => ({
  key,
  type,
  title: key,
  rationale: '',
  score,
  evidence: {},
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
});

describe('runDiscovery', () => {
  it('keeps top 5 by score across all types and writes them', async () => {
    const writes: Candidate[] = [];
    const env = {
      runners: {
        cve: async () => [sampleC('cve-1', 'cve', 0.9), sampleC('cve-2', 'cve', 0.4)],
        actor: async () => [sampleC('actor-1', 'actor', 0.8)],
        malware: async () => [sampleC('mal-1', 'malware', 0.7)],
        ransom: async () => [sampleC('ran-1', 'ransom', 0.6), sampleC('ran-2', 'ransom', 0.3)],
      },
      putCandidate: async (c: Candidate) => {
        writes.push(c);
      },
      touchDedup: async () => {},
      now: new Date('2026-05-14T06:00:00Z'),
      limit: 5,
    };
    const result = await runDiscovery(env as any);
    expect(result.kept).toBe(5);
    expect(writes.map((w) => w.key).sort()).toEqual(['actor-1', 'cve-1', 'cve-2', 'mal-1', 'ran-1'].sort());
  });
});
