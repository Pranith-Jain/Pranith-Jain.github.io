import { describe, it, expect } from 'vitest';
import {
  emptyGraph,
  mergeExpand,
  toGraphResponse,
  riskToNodeType,
  confirmEdge,
  type ExpandResponse,
} from './tracer-graph';

function resp(over: Partial<ExpandResponse> = {}): ExpandResponse {
  return {
    root: {
      id: 'evm:0xroot',
      address: '0xroot',
      chain: 'evm',
      label: 'Binance 14',
      category: 'exchange',
      risk: { level: 'low', score: 0, signals: [] },
      is_root: true,
      explorer_url: 'https://x',
    },
    nodes: [
      {
        id: 'evm:0xroot',
        address: '0xroot',
        chain: 'evm',
        label: 'Binance 14',
        category: 'exchange',
        risk: { level: 'low', score: 0, signals: [] },
        is_root: true,
        explorer_url: 'https://x',
      },
      {
        id: 'evm:0xa',
        address: '0xa',
        chain: 'evm',
        label: null,
        category: 'unknown',
        risk: { level: 'critical', score: 100, signals: ['OFAC-sanctioned address'] },
        is_root: false,
        explorer_url: 'https://x',
      },
    ],
    edges: [
      {
        id: 'tx1:evm:0xa',
        source: 'evm:0xroot',
        target: 'evm:0xa',
        direction: 'out',
        amount: '1 ETH',
        token: 'ETH',
        tx_hash: 'tx1',
        timestamp: null,
        confidence: 'candidate',
      },
    ],
    truncated: false,
    generated_at: '2026-06-10T12:00:00.000Z',
    ...over,
  };
}

describe('tracer-graph', () => {
  it('riskToNodeType maps level → crypto node type', () => {
    expect(riskToNodeType('low')).toBe('crypto_low');
    expect(riskToNodeType('critical')).toBe('crypto_critical');
  });

  it('mergeExpand adds nodes + edges to an empty graph', () => {
    const g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
  });

  it('mergeExpand dedupes nodes + edges by id', () => {
    let g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    g = mergeExpand(g, resp());
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
  });

  it('toGraphResponse renders crypto node types + edge labels', () => {
    const g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    const gr = toGraphResponse(g);
    const sanctioned = gr.nodes.find((n) => n.id === 'evm:0xa')!;
    expect(sanctioned.type).toBe('crypto_critical');
    const edge = gr.edges[0];
    expect(edge.label).toMatch(/out/i);
    expect(edge.data?.confidence).toBe('candidate');
  });

  it('confirmEdge flips an edge to confirmed', () => {
    let g = mergeExpand(emptyGraph('evm:0xroot'), resp());
    g = confirmEdge(g, 'tx1:evm:0xa');
    expect(g.edges.get('tx1:evm:0xa')!.confidence).toBe('confirmed');
  });
});
