import { describe, it, expect } from 'vitest';
import { parseBlockscoutNativeTxs } from '../../src/lib/blockscout';
const ADDR = '0xAbC0000000000000000000000000000000000001';
const OTHER = '0xdef0000000000000000000000000000000000002';
// Blockscout v2 /addresses/{addr}/transactions item (native value tx).
function item(over) {
    return {
        hash: '0xhash',
        timestamp: '2023-11-14T22:13:20.000000Z',
        from: { hash: ADDR },
        to: { hash: OTHER },
        value: '1000000000000000000', // 1 ETH in wei
        ...over,
    };
}
describe('parseBlockscoutNativeTxs', () => {
    it('parses an outbound native ETH transfer', () => {
        const [t] = parseBlockscoutNativeTxs({ items: [item({})] }, ADDR);
        expect(t).toMatchObject({
            direction: 'out',
            counterparty: OTHER,
            amount: '1 ETH',
            amount_num: 1,
            token: 'ETH',
            tx_hash: '0xhash',
            timestamp: '2023-11-14T22:13:20.000000Z',
            chain: 'evm',
            explorer_url: 'https://etherscan.io/tx/0xhash',
        });
    });
    it('derives inbound direction', () => {
        const [t] = parseBlockscoutNativeTxs({ items: [item({ from: { hash: OTHER }, to: { hash: ADDR } })] }, ADDR);
        expect(t.direction).toBe('in');
        expect(t.counterparty).toBe(OTHER);
    });
    it('drops zero-value txs and contract creations (null to)', () => {
        const items = [item({ value: '0' }), item({ to: null })];
        expect(parseBlockscoutNativeTxs({ items }, ADDR)).toHaveLength(0);
    });
    it('accepts either a raw array or a {items} envelope', () => {
        expect(parseBlockscoutNativeTxs([item({})], ADDR)).toHaveLength(1);
    });
    it('returns empty for non-array / missing items', () => {
        expect(parseBlockscoutNativeTxs(null, ADDR)).toEqual([]);
        expect(parseBlockscoutNativeTxs({ items: 'nope' }, ADDR)).toEqual([]);
    });
});
