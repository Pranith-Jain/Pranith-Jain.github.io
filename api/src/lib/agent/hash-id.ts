/**
 * Hash type identification — determines the algorithm of a hash string
 * before any lookup, so file hashes go to MalwareBazaar/VT and credential
 * hashes go to breach databases. 32-hex is MD5 *or* NTLM — one is a file
 * hash, the other is credential material, and querying the wrong service
 * returns a confident "unknown sample" that reads as exculpatory.
 *
 * Ported from cti-expert's /hash-id concept (7onez/cti-expert).
 */

export type HashCategory = 'file' | 'credential' | 'both' | 'unknown';

export interface HashIdentification {
  input: string;
  bitLength: number;
  hexLength: number;
  algorithms: Array<{
    name: string;
    category: HashCategory;
    description: string;
  }>;
  recommendedLookup: string;
  isCredential: boolean;
}

const HEX_RE = /^[a-f0-9]+$/i;

const ALGO_MAP: Record<number, Array<{ name: string; category: HashCategory; description: string }>> = {
  32: [
    { name: 'MD5', category: 'file', description: '128-bit file hash — lookup on MalwareBazaar / VirusTotal' },
    {
      name: 'NTLM',
      category: 'credential',
      description: 'Windows credential hash — lookup on breach databases, NOT file scanners',
    },
    { name: 'MD4', category: 'credential', description: 'Legacy NTLM variant — credential material' },
  ],
  40: [
    { name: 'SHA-1', category: 'file', description: '160-bit file hash — lookup on MalwareBazaar / VirusTotal' },
    { name: 'SHA1', category: 'file', description: 'Same as SHA-1' },
  ],
  56: [{ name: 'SHA-224', category: 'file', description: '224-bit file hash' }],
  64: [
    {
      name: 'SHA-256',
      category: 'file',
      description: '256-bit file hash — lookup on MalwareBazaar / VirusTotal / Traceix',
    },
    { name: 'SHA3-256', category: 'file', description: 'Keccak-256 variant' },
  ],
  96: [
    { name: 'SHA-384', category: 'file', description: '384-bit file hash' },
    { name: 'SHA3-384', category: 'file', description: 'Keccak-384 variant' },
  ],
  128: [
    { name: 'SHA-512', category: 'file', description: '512-bit file hash — lookup on MalwareBazaar / VirusTotal' },
    { name: 'SHA3-512', category: 'file', description: 'Keccak-512 variant' },
    { name: 'Whirlpool', category: 'file', description: '512-bit file hash' },
  ],
  8: [{ name: 'CRC32', category: 'file', description: '32-bit checksum — not a cryptographic hash, no lookup value' }],
  16: [{ name: 'CRC64', category: 'file', description: '64-bit checksum — not a cryptographic hash' }],
};

export function identifyHash(input: string): HashIdentification {
  const trimmed = input.trim();

  if (!trimmed || !HEX_RE.test(trimmed)) {
    return {
      input: trimmed,
      bitLength: 0,
      hexLength: 0,
      algorithms: [],
      recommendedLookup: 'unknown — input is not a valid hex string',
      isCredential: false,
    };
  }

  const hexLength = trimmed.length;
  const bitLength = hexLength * 4;
  const algos = ALGO_MAP[hexLength] ?? [];

  const hasCredential = algos.some((a) => a.category === 'credential');
  const hasFile = algos.some((a) => a.category === 'file');

  let recommendedLookup: string;
  if (algos.length === 0) {
    recommendedLookup = `unknown — no standard algorithm produces a ${hexLength}-char hex hash`;
  } else if (hasCredential && hasFile) {
    recommendedLookup =
      'AMBIGUOUS — could be a file hash (MD5 → MalwareBazaar/VT) OR credential material (NTLM → breach databases). Run /breach-deep for NTLM, /threat-check for MD5. Do NOT query a public cracking service.';
  } else if (hasCredential) {
    recommendedLookup = 'credential hash — lookup on breach databases (/breach-deep), NOT file scanners';
  } else {
    recommendedLookup = 'file hash — lookup on MalwareBazaar / VirusTotal / Traceix (/threat-check)';
  }

  return {
    input: trimmed,
    bitLength,
    hexLength,
    algorithms: algos,
    recommendedLookup,
    isCredential: hasCredential,
  };
}
