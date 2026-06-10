import { describe, it, expect } from 'vitest';
import { applyFilter } from '../../../src/lib/chain-sources/filter';
import type { Transfer } from '../../../src/lib/chain-sources/types';

function tx(over: Partial<Transfer>): Transfer {
  return {
    counterparty: '0xaaa',
    direction: 'out',
    amount: '1 USDT',
    amount_num: 1,
    token: 'USDT',
    tx_hash: '0xhash',
    timestamp: '2026-06-10T12:00:00.000Z',
    chain: 'evm',
    explorer_url: 'https://x',
    ...over,
  };
}

describe('applyFilter', () => {
  it('filters by time window [from,to] inclusive', () => {
    const list = [
      tx({ tx_hash: 'a', timestamp: '2026-06-10T11:00:00.000Z' }),
      tx({ tx_hash: 'b', timestamp: '2026-06-10T12:00:00.000Z' }),
      tx({ tx_hash: 'c', timestamp: '2026-06-10T13:00:00.000Z' }),
    ];
    const r = applyFilter(list, { from: '2026-06-10T11:30:00.000Z', to: '2026-06-10T12:30:00.000Z' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['b']);
    expect(r.truncated).toBe(false);
  });

  it('filters by token symbol case-insensitively', () => {
    const list = [tx({ tx_hash: 'a', token: 'USDT' }), tx({ tx_hash: 'b', token: 'DAI' })];
    const r = applyFilter(list, { token: 'usdt' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['a']);
  });

  it('filters by minAmount', () => {
    const list = [tx({ tx_hash: 'a', amount_num: 0.5 }), tx({ tx_hash: 'b', amount_num: 5 })];
    const r = applyFilter(list, { minAmount: 1 });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['b']);
  });

  it('caps at maxTransfers and sets truncated', () => {
    const list = [tx({ tx_hash: 'a' }), tx({ tx_hash: 'b' }), tx({ tx_hash: 'c' })];
    const r = applyFilter(list, { maxTransfers: 2 });
    expect(r.transfers).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('keeps transfers with null timestamp when a window is set', () => {
    const list = [tx({ tx_hash: 'a', timestamp: null })];
    const r = applyFilter(list, { from: '2026-06-10T00:00:00.000Z' });
    expect(r.transfers.map((t) => t.tx_hash)).toEqual(['a']);
  });
});
