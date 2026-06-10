import { describe, it, expect } from 'vitest';
import { diffTransfers, evaluateAlerts, type WatchRow } from '../../src/lib/address-watch';
import type { Transfer } from '../../src/lib/chain-sources/types';

function tx(over: Partial<Transfer>): Transfer {
  return {
    counterparty: '0xcp',
    direction: 'in',
    amount: '5 USDT',
    amount_num: 5,
    token: 'USDT',
    tx_hash: 'h',
    timestamp: '2026-06-11T00:00:00.000Z',
    chain: 'evm',
    explorer_url: 'x',
    ...over,
  };
}
function watch(over: Partial<WatchRow>): WatchRow {
  return {
    address: '0xself',
    chain: 'evm',
    alert_types: ['new_transfer'],
    min_amount: null,
    webhook_url: null,
    label: null,
    added_at: 'a',
    last_checked: null,
    last_fingerprint: null,
    ...over,
  };
}

describe('diffTransfers', () => {
  it('returns the net-new transfers above the stored fingerprint', () => {
    const list = [tx({ tx_hash: 'c' }), tx({ tx_hash: 'b' }), tx({ tx_hash: 'a' })];
    expect(diffTransfers(list, 'b').map((t) => t.tx_hash)).toEqual(['c']);
  });
  it('returns all when the fingerprint is gone (or null on first run)', () => {
    const list = [tx({ tx_hash: 'c' }), tx({ tx_hash: 'b' })];
    expect(diffTransfers(list, 'zzz')).toHaveLength(2);
    expect(diffTransfers(list, null)).toHaveLength(2);
  });
  it('returns none when nothing is new', () => {
    expect(diffTransfers([tx({ tx_hash: 'c' })], 'c')).toHaveLength(0);
  });
});

describe('evaluateAlerts', () => {
  const empty = new Set<string>();
  it('new_transfer fires for any new transfer', () => {
    const a = evaluateAlerts(watch({ alert_types: ['new_transfer'] }), [tx({})], empty, empty);
    expect(a.map((x) => x.alert_type)).toEqual(['new_transfer']);
  });
  it('large_transfer respects min_amount', () => {
    const w = watch({ alert_types: ['large_transfer'], min_amount: 10 });
    expect(evaluateAlerts(w, [tx({ amount_num: 5 })], empty, empty)).toHaveLength(0);
    expect(evaluateAlerts(w, [tx({ amount_num: 50 })], empty, empty)).toHaveLength(1);
  });
  it('suspicious_counterparty fires on a sanctioned/scam counterparty', () => {
    const w = watch({ alert_types: ['suspicious_counterparty'] });
    const sanctioned = new Set(['0xbad']);
    expect(evaluateAlerts(w, [tx({ counterparty: '0xBAD' })], sanctioned, empty)).toHaveLength(1);
    expect(evaluateAlerts(w, [tx({ counterparty: '0xok' })], sanctioned, empty)).toHaveLength(0);
  });
});
