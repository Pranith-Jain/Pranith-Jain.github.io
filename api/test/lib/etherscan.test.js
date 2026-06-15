import { describe, it, expect } from 'vitest';
import { parseEtherscanTxlist } from '../../src/lib/etherscan';
const ADDR = '0xAbC0000000000000000000000000000000000001';
const OTHER = '0xdef0000000000000000000000000000000000002';
// Etherscan V2 account/txlist result items (native ETH txs). timeStamp is epoch SECONDS.
function tx(over) {
    return {
        hash: '0xhash',
        from: ADDR,
        to: OTHER,
        value: '1000000000000000000', // 1 ETH in wei
        timeStamp: '1700000000',
        isError: '0',
        ...over,
    };
}
describe('parseEtherscanTxlist', () => {
    it('parses an outbound native ETH transfer', () => {
        const [t] = parseEtherscanTxlist([tx({})], ADDR);
        expect(t).toMatchObject({
            direction: 'out',
            counterparty: OTHER,
            amount: '1 ETH',
            amount_num: 1,
            token: 'ETH',
            tx_hash: '0xhash',
            chain: 'evm',
            explorer_url: 'https://etherscan.io/tx/0xhash',
        });
        expect(t.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    });
    it('derives inbound direction when the address is the recipient', () => {
        const [t] = parseEtherscanTxlist([tx({ from: OTHER, to: ADDR })], ADDR);
        expect(t.direction).toBe('in');
        expect(t.counterparty).toBe(OTHER);
    });
    it('marks a self-send as self', () => {
        const [t] = parseEtherscanTxlist([tx({ from: ADDR, to: ADDR })], ADDR);
        expect(t.direction).toBe('self');
    });
    it('matches the address case-insensitively (checksummed input)', () => {
        const [t] = parseEtherscanTxlist([tx({ from: ADDR.toLowerCase(), to: OTHER })], ADDR.toUpperCase());
        expect(t.direction).toBe('out');
    });
    it('formats fractional ETH amounts', () => {
        const [t] = parseEtherscanTxlist([tx({ value: '2500000000000000000' })], ADDR);
        expect(t.amount).toBe('2.5 ETH');
        expect(t.amount_num).toBe(2.5);
    });
    it('drops zero-value txs (contract calls with no ETH)', () => {
        expect(parseEtherscanTxlist([tx({ value: '0' })], ADDR)).toHaveLength(0);
    });
    it('drops rows missing a hash or counterparty', () => {
        expect(parseEtherscanTxlist([tx({ hash: '' }), tx({ to: '' })], ADDR)).toHaveLength(0);
    });
    it('returns an empty array for non-array input', () => {
        expect(parseEtherscanTxlist(null, ADDR)).toEqual([]);
        expect(parseEtherscanTxlist('Max rate limit reached', ADDR)).toEqual([]);
    });
});
