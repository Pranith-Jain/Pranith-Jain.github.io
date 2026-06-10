export interface EmbeddedPointer {
  value: string; // '0x' + 64 hex
  offset: number; // byte offset within the calldata
}

export interface CalldataAnalysis {
  selector: string | null;
  known_method: string | null;
  input_size: number; // bytes
  flags: string[];
  embedded_pointers: EmbeddedPointer[];
  verdict: 'clean' | 'suspicious' | 'data-hiding';
}

const KNOWN_SELECTORS: Record<string, string> = {
  '0xa9059cbb': 'transfer',
  '0x095ea7b3': 'approve',
  '0x23b872dd': 'transferFrom',
  '0xa22cb465': 'setApprovalForAll',
  '0xac9650d8': 'multicall',
  '0x38ed1739': 'swapExactTokensForTokens',
};

const EXPECTED_SIZE: Record<string, number> = {
  transfer: 68,
  approve: 68,
  transferFrom: 100,
  setApprovalForAll: 68,
};

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

export function analyzeCalldata(input: string): CalldataAnalysis {
  const hex = input.replace(/^0x/i, '').toLowerCase();
  const bytes = hexToBytes(hex);
  const size = bytes.length;
  const flags: string[] = [];
  const embedded_pointers: EmbeddedPointer[] = [];

  if (size < 4) {
    return { selector: null, known_method: null, input_size: size, flags, embedded_pointers, verdict: 'clean' };
  }

  const selector = '0x' + hex.slice(0, 8);
  const known_method = KNOWN_SELECTORS[selector] ?? null;

  for (let off = 4; off + 32 <= size; off += 32) {
    const word = bytes.slice(off, off + 32);
    const nonZero = word.filter((b) => b !== 0).length;
    if (nonZero >= 28) {
      embedded_pointers.push({ value: '0x' + hex.slice(off * 2, off * 2 + 64), offset: off });
    }
  }

  if (known_method && EXPECTED_SIZE[known_method] !== undefined && size > EXPECTED_SIZE[known_method] + 4) {
    flags.push(`input larger than ${known_method}'s ABI footprint`);
  }

  const payload = bytes.slice(4);
  if (payload.length >= 64) {
    const nz = payload.filter((b) => b !== 0).length / payload.length;
    if (nz > 0.6) flags.push('high-entropy payload after selector');
  }

  let run = 0;
  let maxRun = 0;
  for (const b of payload) {
    if (b >= 0x20 && b <= 0x7e) {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else run = 0;
  }
  if (maxRun >= 8) flags.push('embedded ASCII text');

  if (embedded_pointers.length > 0) flags.push('embedded tx-hash-looking pointer(s)');

  const hasHidingSignal = embedded_pointers.length > 0 || flags.includes('embedded ASCII text');
  const hasSuspicious = flags.some((f) => /larger than|high-entropy/.test(f));
  const verdict: CalldataAnalysis['verdict'] = hasHidingSignal ? 'data-hiding' : hasSuspicious ? 'suspicious' : 'clean';

  return { selector, known_method, input_size: size, flags, embedded_pointers, verdict };
}
