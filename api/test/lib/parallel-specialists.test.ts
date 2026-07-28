import { describe, it, expect } from 'vitest';
import {
  getParallelGroups,
  runParallelSpecialists,
  type SpecialistExecutor,
} from '../../src/lib/agent/parallel-specialists';
import type { AgentTool, AgentToolResult } from '../../src/lib/agent/types';
import type { SpecialistRole } from '../../src/lib/agent/specialist-types';

describe('getParallelGroups', () => {
  it('groups specialists with disjoint tool sets together', () => {
    // vulnerability and detection-rules share no tools → one parallel group.
    const groups = getParallelGroups(['vulnerability', 'detection-rules']);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sort()).toEqual(['detection-rules', 'vulnerability']);
  });

  it('separates specialists that share tools', () => {
    // ioc-reputation and domain-host both list generate_yara_rule/maltiverse → overlap.
    const groups = getParallelGroups(['ioc-reputation', 'domain-host']);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g[0])).toEqual(['ioc-reputation', 'domain-host']);
  });

  it('preserves every specialist exactly once', () => {
    const roles: SpecialistRole[] = ['vulnerability', 'ioc-reputation', 'detection-rules', 'malware-analysis'];
    const groups = getParallelGroups(roles);
    const flat = groups.flat().sort();
    expect(flat).toEqual([...roles].sort());
  });
});

describe('runParallelSpecialists', () => {
  const tools: AgentTool[] = [
    { name: 'lookup_cve', description: 'cve.', params: [], execute: async () => ({}) },
    { name: 'generate_yara_rule', description: 'yara.', params: [], execute: async () => ({}) },
  ];

  function mockExecutor(): SpecialistExecutor & { planned: SpecialistRole[] } {
    const planned: SpecialistRole[] = [];
    return {
      planned,
      plan: async (role, _t, steps) => {
        planned.push(role);
        if (steps.length >= 1) return { reasoning: 'done', toolCalls: [], shouldSynthesize: true };
        const tool = role === 'vulnerability' ? 'lookup_cve' : 'generate_yara_rule';
        return { reasoning: `${role} step`, toolCalls: [{ tool, args: {}, reasoning: 'r' }], shouldSynthesize: false };
      },
      execute: async (calls): Promise<AgentToolResult[]> =>
        calls.map((c) => ({ tool: c.tool, args: c.args, status: 'ok', data: { ok: true }, durationMs: 1 })),
      observe: async () => ({ observation: 'observed' }),
    };
  }

  it('runs each specialist and collects their steps', async () => {
    const executor = mockExecutor();
    const results = await runParallelSpecialists(['vulnerability', 'detection-rules'], tools, 3, executor);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(r.steps.length).toBeGreaterThanOrEqual(1);
      expect(r.steps[0]!.observation).toBe('observed');
    }
    expect(executor.planned).toContain('vulnerability');
    expect(executor.planned).toContain('detection-rules');
  });

  it('applies the guardrail pass to proposed calls', async () => {
    const executor = mockExecutor();
    let guarded = 0;
    executor.guard = (_role, calls) => {
      guarded += 1;
      return calls;
    };
    await runParallelSpecialists(['vulnerability'], tools, 1, executor);
    expect(guarded).toBe(1);
  });
});
