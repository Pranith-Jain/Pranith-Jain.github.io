import { describe, it, expect } from 'vitest';
import { analyzeCalldata } from '../../src/lib/calldata-analysis';

// ERC-20 transfer(to, amount): selector + 32-byte addr (12 zero bytes + 20) + small amount.
const TRANSFER =
  '0xa9059cbb' +
  '000000000000000000000000abcabcabcabcabcabcabcabcabcabcabcabcabca' +
  '0000000000000000000000000000000000000000000000000de0b6b3a7640000';

// selector + one full-entropy 32-byte word (32 nonzero bytes → tx-hash-looking pointer).
const WITH_POINTER = '0x12345678' + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// selector + a long run of printable ASCII ("AAAA..." = 0x41) → embedded text.
const WITH_ASCII = '0x12345678' + '41'.repeat(40);

describe('analyzeCalldata', () => {
  it('recognises a plain transfer as clean with no pointers', () => {
    const r = analyzeCalldata(TRANSFER);
    expect(r.selector).toBe('0xa9059cbb');
    expect(r.known_method).toBe('transfer');
    expect(r.embedded_pointers).toHaveLength(0);
    expect(r.verdict).toBe('clean');
  });

  it('flags an embedded tx-hash-looking pointer as data-hiding', () => {
    const r = analyzeCalldata(WITH_POINTER);
    expect(r.embedded_pointers).toHaveLength(1);
    const ptr = r.embedded_pointers[0]!;
    expect(ptr.value).toBe('0x' + 'aa'.repeat(32));
    expect(ptr.offset).toBe(4);
    expect(r.verdict).toBe('data-hiding');
  });

  it('flags an embedded ASCII payload as data-hiding', () => {
    const r = analyzeCalldata(WITH_ASCII);
    expect(r.flags.some((f: string) => /ascii|text/i.test(f))).toBe(true);
    expect(r.verdict).toBe('data-hiding');
  });

  it('handles empty / too-short input', () => {
    expect(analyzeCalldata('0x').selector).toBeNull();
    expect(analyzeCalldata('0x').verdict).toBe('clean');
  });
});
