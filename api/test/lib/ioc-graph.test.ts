import { describe, it, expect } from 'vitest';
import { extractGraphFromSteps } from '../../src/lib/agent/ioc-graph';

describe('extractGraphFromSteps', () => {
  it('returns an empty graph for no steps', () => {
    expect(extractGraphFromSteps([])).toEqual({ nodes: [], edges: [] });
  });

  it('builds IOC nodes with related-domain edges from enrichment results', () => {
    const graph = extractGraphFromSteps([
      {
        results: [
          {
            tool: 'enrich_ioc_deep',
            status: 'ok',
            data: { indicator: '1.2.3.4', verdict: 'malicious', related_domains: ['evil.com', 'bad.net'] },
          },
        ],
      },
    ]);
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('1.2.3.4');
    expect(ids).toContain('evil.com');
    expect(
      graph.edges.some((e) => e.source === '1.2.3.4' && e.target === 'evil.com' && e.relationship === 'resolves_to')
    ).toBe(true);
  });

  it('links actors to their malware families and aliases', () => {
    const graph = extractGraphFromSteps([
      {
        results: [
          {
            tool: 'enrich_actor',
            status: 'ok',
            data: { name: 'APT28', aliases: ['Fancy Bear'], malware: ['X-Agent'] },
          },
        ],
      },
    ]);
    expect(graph.nodes.some((n) => n.type === 'actor' && n.label === 'APT28')).toBe(true);
    expect(graph.edges.some((e) => e.relationship === 'alias')).toBe(true);
    expect(graph.edges.some((e) => e.relationship === 'uses')).toBe(true);
  });

  it('skips errored results and dedupes edges', () => {
    const step = {
      results: [
        { tool: 'check_ioc', status: 'error', data: undefined },
        { tool: 'check_ioc', status: 'ok', data: { indicator: '9.9.9.9', verdict: 'clean' } },
        { tool: 'check_ioc', status: 'ok', data: { indicator: '9.9.9.9', verdict: 'clean' } },
      ],
    };
    const graph = extractGraphFromSteps([step, step]);
    const iocNodes = graph.nodes.filter((n) => n.id === '9.9.9.9');
    expect(iocNodes).toHaveLength(1);
  });
});
