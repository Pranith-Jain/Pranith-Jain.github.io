import { describe, it, expect } from 'vitest';
import { mapTrc20Rows } from '../../../src/lib/chain-sources/tron';
const ADDR = 'TSelfAddr';
const rows = [
    {
        transaction_id: 'x1',
        block_timestamp: 1718020800000,
        from: ADDR,
        to: 'TCounter',
        value: '1500000',
        token_info: { symbol: 'USDT', decimals: 6 },
    },
    {
        transaction_id: 'x2',
        block_timestamp: 1718024400000,
        from: 'TSender',
        to: ADDR,
        value: '2000000',
        token_info: { symbol: 'USDT', decimals: 6 },
    },
];
describe('mapTrc20Rows', () => {
    it('maps direction, counterparty, and decimal-scaled amount', () => {
        const out = mapTrc20Rows(ADDR, rows);
        const x1 = out.find((t) => t.tx_hash === 'x1');
        expect(x1.direction).toBe('out');
        expect(x1.counterparty).toBe('TCounter');
        expect(x1.amount_num).toBeCloseTo(1.5);
        expect(x1.token).toBe('USDT');
        const x2 = out.find((t) => t.tx_hash === 'x2');
        expect(x2.direction).toBe('in');
        expect(x2.counterparty).toBe('TSender');
        expect(x2.amount_num).toBeCloseTo(2);
    });
});
