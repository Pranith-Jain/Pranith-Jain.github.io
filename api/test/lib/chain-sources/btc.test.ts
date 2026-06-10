import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractBtcTransfers } from '../../../src/lib/chain-sources/btc';
import type { Transfer } from '../../../src/lib/chain-sources/types';

afterEach(() => vi.restoreAllMocks());

const ADDR = 'bc1qself';

const txs = [
  {
    txid: 't1',
    status: { confirmed: true, block_time: 1718020800 },
    vin: [{ prevout: { scriptpubkey_address: ADDR, value: 100000 } }],
    vout: [
      { scriptpubkey_address: 'bc1qcounter', value: 90000 },
      { scriptpubkey_address: ADDR, value: 9000 },
    ],
  },
  {
    txid: 't2',
    status: { confirmed: true, block_time: 1718024400 },
    vin: [{ prevout: { scriptpubkey_address: 'bc1qsender', value: 50000 } }],
    vout: [{ scriptpubkey_address: ADDR, value: 50000 }],
  },
];

describe('extractBtcTransfers', () => {
  it('derives direction + counterparty from vin/vout', () => {
    const out = extractBtcTransfers(ADDR, txs as never);
    expect(out).toHaveLength(2);
    const t1 = out.find((t) => t.tx_hash === 't1')!;
    expect(t1.direction).toBe('out');
    expect(t1.counterparty).toBe('bc1qcounter');
    expect(t1.token).toBe('BTC');
    const t2 = out.find((t) => t.tx_hash === 't2')!;
    expect(t2.direction).toBe('in');
    expect(t2.counterparty).toBe('bc1qsender');
  });

  it('produces ISO timestamps from block_time', () => {
    const out = extractBtcTransfers(ADDR, txs as never);
    expect(out.find((t) => t.tx_hash === 't1')!.timestamp).toBe('2024-06-10T12:00:00.000Z');
  });
});
