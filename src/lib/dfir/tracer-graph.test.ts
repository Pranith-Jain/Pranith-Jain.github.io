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

import { findPathToCategory } from './tracer-graph';

describe('findPathToCategory', () => {
  function graphWith(nodes: { id: string; category: string }[], edges: [string, string][]) {
    const g = emptyGraph(nodes[0].id);
    for (const n of nodes) {
      g.nodes.set(n.id, {
        id: n.id,
        address: n.id.split(':')[1] ?? n.id,
        chain: 'evm',
        label: null,
        category: n.category,
        risk: { level: 'low', score: 0, signals: [] },
        is_root: n.id === nodes[0].id,
        explorer_url: '',
      });
    }
    edges.forEach(([s, t], i) => {
      g.edges.set(`e${i}`, {
        id: `e${i}`,
        source: s,
        target: t,
        direction: 'out',
        amount: '',
        token: '',
        tx_hash: `tx${i}`,
        timestamp: null,
        confidence: 'candidate',
      });
    });
    return g;
  }

  it('finds the shortest path from seed to the nearest exchange/mixer', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:a', category: 'wallet' },
        { id: 'evm:cex', category: 'exchange' },
      ],
      [
        ['evm:seed', 'evm:a'],
        ['evm:a', 'evm:cex'],
      ]
    );
    expect(findPathToCategory(g, ['exchange', 'mixer'])).toEqual(['evm:seed', 'evm:a', 'evm:cex']);
  });

  it('returns null when no target category is reachable', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:a', category: 'wallet' },
      ],
      [['evm:seed', 'evm:a']]
    );
    expect(findPathToCategory(g, ['exchange', 'mixer'])).toBeNull();
  });

  it('treats edges as undirected for reachability', () => {
    const g = graphWith(
      [
        { id: 'evm:seed', category: 'wallet' },
        { id: 'evm:cex', category: 'exchange' },
      ],
      [['evm:cex', 'evm:seed']]
    );
    expect(findPathToCategory(g, ['exchange'])).toEqual(['evm:seed', 'evm:cex']);
  });
});

import { serializeGraph, deserializeGraph } from './tracer-graph';

describe('serialize/deserialize round-trip', () => {
  function sampleGraph() {
    const g = emptyGraph('evm:0xroot');
    g.nodes.set('evm:0xroot', {
      id: 'evm:0xroot',
      address: '0xroot',
      chain: 'evm',
      label: 'Binance 14',
      category: 'exchange',
      risk: { level: 'low', score: 0, signals: [] },
      is_root: true,
      explorer_url: 'https://x',
    });
    g.nodes.set('evm:0xa', {
      id: 'evm:0xa',
      address: '0xa',
      chain: 'evm',
      label: null,
      category: 'unknown',
      risk: { level: 'critical', score: 100, signals: ['OFAC-sanctioned address'] },
      is_root: false,
      explorer_url: 'https://x',
    });
    g.edges.set('tx1:evm:0xa', {
      id: 'tx1:evm:0xa',
      source: 'evm:0xroot',
      target: 'evm:0xa',
      direction: 'out',
      amount: '1 ETH',
      token: 'ETH',
      tx_hash: 'tx1',
      timestamp: null,
      confidence: 'confirmed',
    });
    return g;
  }
  it('round-trips nodes, edges, seedId and confirmed state', () => {
    const restored = deserializeGraph(JSON.parse(JSON.stringify(serializeGraph(sampleGraph()))));
    expect(restored.seedId).toBe('evm:0xroot');
    expect(restored.nodes.size).toBe(2);
    expect(restored.edges.size).toBe(1);
    expect(restored.edges.get('tx1:evm:0xa')!.confidence).toBe('confirmed');
    expect(restored.nodes.get('evm:0xa')!.risk.level).toBe('critical');
  });
  it('deserialize tolerates malformed input → empty graph', () => {
    expect(deserializeGraph(null).nodes.size).toBe(0);
    expect(deserializeGraph({ nodes: 'nope' }).edges.size).toBe(0);
    expect(deserializeGraph(42).seedId).toBe('');
  });
});
