import { describe, it, expect } from 'vitest';
import { buildRansomMap, checkRansomwhere } from '../../src/lib/ransomwhere-set';

const EVM_ADDR = '0xAbC0000000000000000000000000000000000001';
const BTC_ADDR = 'bc1qransomwallet000000000000000000000000';

const RESULT = [
  { address: EVM_ADDR, blockchain: 'ethereum', family: 'LockBit' },
  { address: BTC_ADDR, blockchain: 'bitcoin', family: 'Conti' },
  { address: '44monero000000000000000000000', blockchain: 'monero', family: 'REvil' },
  { address: '0xnoFamily000000000000000000000000000000ff', blockchain: 'ethereum', family: '' },
  { blockchain: 'ethereum', family: 'NoAddress' }, // missing address — dropped
];

describe('buildRansomMap', () => {
  it('maps ethereum→evm and bitcoin→btc wallets, lowercasing EVM keys', () => {
    const map = buildRansomMap(RESULT);
    expect(map.get(EVM_ADDR.toLowerCase())).toBe('LockBit');
    expect(map.get(BTC_ADDR)).toBe('Conti');
  });

  it('drops untraceable chains (monero) and addressless rows', () => {
    const map = buildRansomMap(RESULT);
    expect(map.has('44monero000000000000000000000')).toBe(false);
    // Only evm(2) + btc(1) survive; the addressless ethereum row is dropped.
    expect(map.size).toBe(3);
  });

  it('returns an empty map for non-array input', () => {
    expect(buildRansomMap(null).size).toBe(0);
    expect(buildRansomMap(undefined).size).toBe(0);
    expect(buildRansomMap({ result: [] } as unknown as null).size).toBe(0);
  });
});

describe('checkRansomwhere', () => {
  const map = buildRansomMap(RESULT);

  it('flags an EVM hit case-insensitively and returns the family', () => {
    expect(checkRansomwhere(map, 'evm', EVM_ADDR.toUpperCase())).toEqual({ flagged: true, family: 'LockBit' });
  });

  it('flags a BTC hit', () => {
    expect(checkRansomwhere(map, 'btc', BTC_ADDR)).toEqual({ flagged: true, family: 'Conti' });
  });

  it('returns family null (still flagged) when the upstream family is blank', () => {
    expect(checkRansomwhere(map, 'evm', '0xnoFamily000000000000000000000000000000ff')).toEqual({
      flagged: true,
      family: null,
    });
  });

  it('misses an unknown address', () => {
    expect(checkRansomwhere(map, 'evm', '0x0000000000000000000000000000000000000000')).toEqual({
      flagged: false,
      family: null,
    });
  });

  it('never matches on tron (Ransomwhere has no tron coverage)', () => {
    expect(checkRansomwhere(map, 'tron', BTC_ADDR)).toEqual({ flagged: false, family: null });
  });
});
