import { describe, it, expect } from 'vitest';
import { toJSON, toCSV } from './tracer-export';
import { emptyGraph } from './tracer-graph';

function graph() {
  const g = emptyGraph('evm:0xroot');
  g.edges.set('tx1:evm:0xa', {
    id: 'tx1:evm:0xa',
    source: 'evm:0xroot',
    target: 'evm:0xa',
    direction: 'out',
    amount: '1,234 USDT',
    token: 'USDT',
    tx_hash: 'tx1',
    timestamp: '2026-06-11T00:00:00.000Z',
    confidence: 'candidate',
  });
  return g;
}

describe('tracer-export', () => {
  it('toJSON parses back to the serialized shape', () => {
    const parsed = JSON.parse(toJSON(graph())) as { seedId: string; edges: unknown[] };
    expect(parsed.seedId).toBe('evm:0xroot');
    expect(parsed.edges).toHaveLength(1);
  });

  it('toCSV emits a header + one row per edge with quoting', () => {
    const lines = toCSV(graph()).split('\n');
    expect(lines[0]).toBe('from,to,amount,token,tx_hash,direction,confidence,timestamp');
    expect(lines[1]).toContain('"1,234 USDT"');
    expect(lines[1]).toContain('evm:0xroot');
  });
});
