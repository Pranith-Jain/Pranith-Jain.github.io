import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractBtcTransfers } from '../../../src/lib/chain-sources/btc';
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
        const out = extractBtcTransfers(ADDR, txs);
        expect(out).toHaveLength(2);
        const t1 = out.find((t) => t.tx_hash === 't1');
        expect(t1.direction).toBe('out');
        expect(t1.counterparty).toBe('bc1qcounter');
        expect(t1.token).toBe('BTC');
        const t2 = out.find((t) => t.tx_hash === 't2');
        expect(t2.direction).toBe('in');
        expect(t2.counterparty).toBe('bc1qsender');
    });
    it('produces ISO timestamps from block_time', () => {
        const out = extractBtcTransfers(ADDR, txs);
        expect(out.find((t) => t.tx_hash === 't1').timestamp).toBe('2024-06-10T12:00:00.000Z');
    });
});
import { clusterCommonInputs } from '../../../src/lib/chain-sources/btc';
describe('clusterCommonInputs', () => {
    const ADDR = 'bc1qself';
    const txs = [
        {
            txid: 'a',
            status: { confirmed: true },
            vin: [
                { prevout: { scriptpubkey_address: ADDR, value: 1 } },
                { prevout: { scriptpubkey_address: 'bc1qco1', value: 1 } },
            ],
            vout: [],
        },
        {
            txid: 'b',
            status: { confirmed: true },
            vin: [
                { prevout: { scriptpubkey_address: ADDR, value: 1 } },
                { prevout: { scriptpubkey_address: 'bc1qco1', value: 1 } },
                { prevout: { scriptpubkey_address: 'bc1qco2', value: 1 } },
            ],
            vout: [],
        },
        {
            txid: 'c',
            status: { confirmed: true },
            vin: [{ prevout: { scriptpubkey_address: 'bc1qother', value: 1 } }],
            vout: [],
        },
    ];
    it('aggregates co-input addresses by shared tx count, excluding self', () => {
        const out = clusterCommonInputs(txs, ADDR);
        expect(out.find((c) => c.address === 'bc1qco1').shared_tx_count).toBe(2);
        expect(out.find((c) => c.address === 'bc1qco2').shared_tx_count).toBe(1);
        expect(out.find((c) => c.address === ADDR)).toBeUndefined();
        expect(out.find((c) => c.address === 'bc1qother')).toBeUndefined();
        expect(out[0]?.address).toBe('bc1qco1');
    });
});
