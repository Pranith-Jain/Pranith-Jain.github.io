import { describe, it, expect } from 'vitest';
import { parseSolanaTransfers } from '../../../src/lib/chain-sources/solana';
const ADDR = 'AddrWa11et00000000000000000000000000000001';
const OTHER = 'OtherWa11et0000000000000000000000000000002';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// getTransaction(jsonParsed) result with one native SOL transfer (out) and one
// SPL USDC transferChecked (in). accountKeys index maps token accounts to owners
// via meta.postTokenBalances.
const NATIVE_TX = {
    blockTime: 1_700_000_000,
    transaction: {
        signatures: ['sigNative'],
        message: {
            accountKeys: [{ pubkey: ADDR }, { pubkey: OTHER }],
            instructions: [
                {
                    program: 'system',
                    parsed: { type: 'transfer', info: { source: ADDR, destination: OTHER, lamports: 1_500_000_000 } },
                },
            ],
        },
    },
    meta: { err: null, innerInstructions: [], preTokenBalances: [], postTokenBalances: [] },
};
const SPL_TX = {
    blockTime: 1_700_000_500,
    transaction: {
        signatures: ['sigSpl'],
        message: {
            accountKeys: [{ pubkey: ADDR }, { pubkey: OTHER }, { pubkey: 'ataSource' }, { pubkey: 'ataDest' }],
            instructions: [
                {
                    program: 'spl-token',
                    parsed: {
                        type: 'transferChecked',
                        info: {
                            source: 'ataSource',
                            destination: 'ataDest',
                            mint: USDC_MINT,
                            tokenAmount: { amount: '2500000', decimals: 6, uiAmountString: '2.5' },
                        },
                    },
                },
            ],
        },
    },
    meta: {
        err: null,
        innerInstructions: [],
        preTokenBalances: [],
        postTokenBalances: [
            { accountIndex: 2, mint: USDC_MINT, owner: OTHER },
            { accountIndex: 3, mint: USDC_MINT, owner: ADDR },
        ],
    },
};
describe('parseSolanaTransfers', () => {
    it('parses an outbound native SOL transfer', () => {
        const [t] = parseSolanaTransfers(NATIVE_TX, ADDR);
        expect(t).toMatchObject({
            counterparty: OTHER,
            direction: 'out',
            amount: '1.5 SOL',
            amount_num: 1.5,
            token: 'SOL',
            tx_hash: 'sigNative',
            chain: 'solana',
            explorer_url: 'https://solscan.io/tx/sigNative',
        });
        expect(t.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    });
    it('parses an inbound SPL USDC transfer, resolving token accounts to owners', () => {
        const [t] = parseSolanaTransfers(SPL_TX, ADDR);
        expect(t).toMatchObject({
            counterparty: OTHER,
            direction: 'in',
            amount: '2.5 USDC',
            amount_num: 2.5,
            token: 'USDC',
            tx_hash: 'sigSpl',
            chain: 'solana',
        });
    });
    it('ignores transfers that do not involve the queried address', () => {
        const [t] = parseSolanaTransfers(NATIVE_TX, 'UnrelatedWa11et00000000000000000000000009');
        expect(t).toBeUndefined();
    });
    it('skips failed transactions (meta.err set)', () => {
        const failed = { ...NATIVE_TX, meta: { ...NATIVE_TX.meta, err: { InstructionError: [0, 'X'] } } };
        expect(parseSolanaTransfers(failed, ADDR)).toHaveLength(0);
    });
    it('returns empty for malformed input', () => {
        expect(parseSolanaTransfers(null, ADDR)).toEqual([]);
        expect(parseSolanaTransfers({}, ADDR)).toEqual([]);
    });
});
