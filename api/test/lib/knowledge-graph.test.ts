import { describe, it, expect } from 'vitest';
import { extractKnowledgeGraph } from '../../src/lib/agent/knowledge-graph';
import type { AgentStep } from '../../src/lib/agent/types';

function step(observer: AgentStep['observerFindings']): AgentStep {
  return {
    stepNumber: 1,
    plan: 'p',
    toolCalls: [],
    results: [],
    status: 'done',
    observerFindings: observer,
  };
}

describe('extractKnowledgeGraph', () => {
  it('returns an empty graph with no findings', () => {
    expect(extractKnowledgeGraph([])).toEqual({ nodes: [], edges: [] });
  });

  it('builds actor→malware, actor→CVE, and CVE→MITRE relationships', () => {
    const graph = extractKnowledgeGraph([
      step({
        iocs: ['1.2.3.4'],
        actors: ['APT28'],
        cves: ['CVE-2024-3400'],
        malware: ['X-Agent'],
        mitre: ['T1190'],
        keyFacts: [],
        gaps: [],
      }),
    ]);
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('actor:APT28');
    expect(ids).toContain('malware:X-Agent');
    expect(ids).toContain('CVE-2024-3400');
    expect(ids).toContain('technique:T1190');

    const rel = (s: string, t: string) => graph.edges.find((e) => e.source === s && e.target === t);
    expect(rel('actor:APT28', 'malware:X-Agent')?.relationship).toBe('uses');
    expect(rel('actor:APT28', 'CVE-2024-3400')?.relationship).toBe('exploits');
    expect(rel('CVE-2024-3400', 'technique:T1190')?.relationship).toBe('maps_to');
  });

  it('aggregates entities across multiple steps and dedupes edges', () => {
    const graph = extractKnowledgeGraph([
      step({ iocs: [], actors: ['LockBit'], cves: ['CVE-2023-1'], malware: [], mitre: [], keyFacts: [], gaps: [] }),
      step({ iocs: [], actors: ['LockBit'], cves: ['CVE-2023-1'], malware: [], mitre: [], keyFacts: [], gaps: [] }),
    ]);
    expect(graph.nodes.filter((n) => n.id === 'actor:LockBit')).toHaveLength(1);
    // No malware so no actor→malware edges; CVE node deduped
    expect(graph.nodes.filter((n) => n.id === 'CVE-2023-1')).toHaveLength(1);
  });
});
