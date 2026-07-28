import { describe, it, expect } from 'vitest';
import { aggregateObservability } from '../../src/lib/agent/observability';

describe('aggregateObservability', () => {
  it('computes real per-tool latency and success rate from tool_timings', () => {
    const rows = [
      {
        tools_used: '["check_ioc"]',
        tool_timings: JSON.stringify([
          { name: 'check_ioc', ms: 100, ok: true },
          { name: 'lookup_cve', ms: 300, ok: false },
        ]),
        meta: '{}',
      },
      {
        tools_used: '["check_ioc"]',
        tool_timings: JSON.stringify([{ name: 'check_ioc', ms: 200, ok: true }]),
        meta: '{}',
      },
    ];
    const { topTools } = aggregateObservability(rows);
    const ioc = topTools.find((t) => t.tool === 'check_ioc')!;
    expect(ioc.count).toBe(2);
    expect(ioc.avgDurationMs).toBe(150);
    expect(ioc.successRate).toBe(100);
    const cve = topTools.find((t) => t.tool === 'lookup_cve')!;
    expect(cve.successRate).toBe(0);
  });

  it('falls back to the legacy tools_used name list when timings are absent', () => {
    const rows = [{ tools_used: '["enrich_actor","lookup_cve"]', tool_timings: '[]', meta: '{}' }];
    const { topTools } = aggregateObservability(rows);
    expect(topTools.map((t) => t.tool).sort()).toEqual(['enrich_actor', 'lookup_cve']);
    expect(topTools[0]!.avgDurationMs).toBe(0);
    expect(topTools[0]!.successRate).toBe(100);
  });

  it('aggregates feature telemetry across rows', () => {
    const rows = [
      {
        tools_used: '[]',
        tool_timings: '[]',
        meta: JSON.stringify({
          parallelBurst: true,
          selfCorrection: true,
          scoreDelta: 20,
          routingRefined: true,
          findings: 4,
        }),
      },
      {
        tools_used: '[]',
        tool_timings: '[]',
        meta: JSON.stringify({ selfCorrection: true, scoreDelta: 10, findings: 6 }),
      },
    ];
    const { features } = aggregateObservability(rows);
    expect(features.parallelBurst).toBe(1);
    expect(features.selfCorrection).toBe(2);
    expect(features.avgScoreDelta).toBe(15);
    expect(features.routingRefinements).toBe(1);
    expect(features.avgFindings).toBe(5);
  });

  it('tolerates malformed JSON without throwing', () => {
    const rows = [{ tools_used: '{bad', tool_timings: 'not-json', meta: 'oops' }];
    const { topTools, features } = aggregateObservability(rows);
    expect(topTools).toEqual([]);
    expect(features.parallelBurst).toBe(0);
  });
});
