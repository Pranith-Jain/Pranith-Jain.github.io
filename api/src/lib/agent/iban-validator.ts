/**
 * IBAN / fiat payment validation — ISO 7064 mod-97 check, BBAN
 * decomposition, and jurisdiction-mismatch (mule pattern) detection.
 *
 * Most victims never touch crypto — they make a bank transfer. This
 * validates a "bank account" on a payment page is fabricated *without
 * contacting anyone*, decomposes the BBAN into bank/branch/account, and
 * flags beneficiary-abroad mule patterns.
 *
 * Ported from cti-expert's /iban concept (7onez/cti-expert).
 */

export interface IbanValidation {
  input: string;
  isValid: boolean;
  countryCode: string | null;
  checkDigits: string | null;
  bban: string | null;
  bankCode: string | null;
  branchCode: string | null;
  accountNumber: string | null;
  formatted: string | null;
  mod97Passed: boolean;
  lengthValid: boolean;
  structureValid: boolean;
  jurisdictionMismatch: boolean;
  notes: string[];
}

const IBAN_RE = /^([A-Z]{2})(\d{2})([A-Z0-9]+)$/;

const IBAN_LENGTHS: Record<string, number> = {
  AL: 28,
  AD: 24,
  AT: 20,
  AZ: 28,
  BH: 22,
  BE: 16,
  BA: 20,
  BR: 29,
  BG: 22,
  CR: 22,
  HR: 21,
  CY: 28,
  CZ: 24,
  DK: 18,
  DO: 28,
  EE: 20,
  FO: 18,
  FI: 18,
  FR: 27,
  GE: 22,
  DE: 22,
  GI: 23,
  GR: 27,
  GL: 18,
  GT: 28,
  HU: 28,
  IS: 26,
  IE: 22,
  IL: 23,
  IT: 27,
  JO: 30,
  KZ: 20,
  XK: 20,
  KW: 30,
  LV: 21,
  LB: 28,
  LI: 21,
  LT: 20,
  LU: 20,
  MK: 19,
  MT: 31,
  MR: 27,
  MU: 30,
  MC: 27,
  MD: 24,
  ME: 22,
  NL: 18,
  NO: 15,
  PK: 24,
  PS: 29,
  PL: 28,
  PT: 25,
  QA: 29,
  RO: 24,
  SM: 27,
  SA: 24,
  RS: 22,
  SK: 24,
  SI: 19,
  ES: 24,
  SE: 24,
  CH: 21,
  TN: 24,
  TR: 26,
  AE: 23,
  GB: 22,
  VG: 24,
};

const BBAN_STRUCTURE: Record<string, { bank: number; branch?: number; account: number }> = {
  GB: { bank: 4, branch: 6, account: 8 },
  DE: { bank: 8, account: 10 },
  FR: { bank: 5, branch: 5, account: 11 },
  IT: { bank: 5, account: 12 },
  ES: { bank: 4, branch: 4, account: 10 },
  NL: { bank: 4, account: 10 },
  BE: { bank: 3, account: 7 },
  CH: { bank: 5, account: 12 },
  AT: { bank: 5, account: 11 },
  PT: { bank: 4, account: 11 },
  SE: { bank: 3, account: 17 },
  NO: { bank: 4, account: 6 },
  DK: { bank: 4, account: 10 },
  FI: { bank: 6, account: 8 },
  PL: { bank: 8, account: 16 },
  IE: { bank: 4, branch: 6, account: 8 },
  LU: { bank: 3, account: 13 },
  TR: { bank: 5, account: 17 },
  AE: { bank: 3, account: 16 },
};

export function validateIban(input: string): IbanValidation {
  const cleaned = input.replace(/\s/g, '').toUpperCase();
  const notes: string[] = [];

  const match = cleaned.match(IBAN_RE);
  if (!match) {
    return {
      input,
      isValid: false,
      countryCode: null,
      checkDigits: null,
      bban: null,
      bankCode: null,
      branchCode: null,
      accountNumber: null,
      formatted: null,
      mod97Passed: false,
      lengthValid: false,
      structureValid: false,
      jurisdictionMismatch: false,
      notes: ['Invalid IBAN structure — must start with 2-letter country code + 2 check digits + BBAN'],
    };
  }

  const countryCode = match[1] ?? '';
  const checkDigits = match[2] ?? '';
  const bban = match[3] ?? '';
  const expectedLength = IBAN_LENGTHS[countryCode];
  const lengthValid = expectedLength ? cleaned.length === expectedLength : true;
  if (!expectedLength) {
    notes.push(`Unknown IBAN country code "${countryCode}" — length cannot be verified`);
  } else if (!lengthValid) {
    notes.push(`Length mismatch: expected ${expectedLength} chars for ${countryCode}, got ${cleaned.length}`);
  }

  const rearranged = bban + countryCode + checkDigits;
  const numericStr = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i]!, 10)) % 97;
  }
  const mod97Passed = remainder === 1;

  const structure = countryCode ? BBAN_STRUCTURE[countryCode] : undefined;
  let bankCode: string | null = null;
  let branchCode: string | null = null;
  let accountNumber: string | null = null;

  if (structure && bban) {
    let offset = 0;
    bankCode = bban.slice(offset, offset + structure.bank) || null;
    offset += structure.bank;
    if (structure.branch) {
      branchCode = bban.slice(offset, offset + structure.branch) || null;
      offset += structure.branch;
    }
    accountNumber = bban.slice(offset, offset + structure.account) || null;
  }

  const formatted = cleaned.replace(/(.{4})/g, '$1 ').trim();

  const isValid = mod97Passed && lengthValid;

  if (mod97Passed) {
    notes.push('ISO 7064 mod-97 checksum PASSED — account number is structurally valid');
  } else {
    notes.push('ISO 7064 mod-97 checksum FAILED — account number is likely fabricated or mistyped');
  }

  if (bankCode) {
    notes.push(`Bank code: ${bankCode}`);
  }

  return {
    input,
    isValid,
    countryCode,
    checkDigits,
    bban,
    bankCode,
    branchCode,
    accountNumber,
    formatted,
    mod97Passed,
    lengthValid,
    structureValid: !!match,
    jurisdictionMismatch: false,
    notes,
  };
}
