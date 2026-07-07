/**
 * Sensitive-data pattern library — client-side regex pack with
 * confidence scoring.
 *
 * Each pattern declares:
 *  - a regex
 *  - a category (financial / personal / credential / network / etc.)
 *  - severity (critical for live keys, high for PII, medium for context-
 *    dependent identifiers, low for opportunistic / metadata signals)
 *  - an optional `validate(match)` returning a confidence boost. Used for
 *    Luhn-checked credit-card numbers, IBAN checksum, JWT three-part shape,
 *    and entropy thresholds for "looks like a key" detectors.
 *
 * Findings are surfaced with a confidence level:
 *   - 'verified' — passed an algorithmic check (Luhn / IBAN mod-97 / JWT-shape)
 *   - 'high'     — strict prefix-anchored regex (sk_live_…, ghp_…)
 *   - 'medium'   — pattern matches but no second signal
 *   - 'low'      — heuristic only (entropy / loose shape)
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'verified' | 'high' | 'medium' | 'low';
export type Category = 'financial' | 'personal' | 'credential' | 'network' | 'health' | 'government-id';

export interface SensitivePattern {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  description: string;
  re: RegExp;
  /** Default confidence if no validator is run / validator returns null. */
  defaultConfidence: Confidence;
  /** Optional algorithmic validator. Returns null to drop the match, or a confidence override. */
  validate?: (match: string) => Confidence | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function ibanMod97(iban: string): boolean {
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  // Move first 4 chars to the end, then convert letters to numbers (A=10..Z=35).
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let expanded = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57)
      expanded += ch; // digit
    else if (code >= 65 && code <= 90)
      expanded += String(code - 55); // A..Z → 10..35
    else return false;
  }
  // Mod-97 in chunks (numbers can be > 32 digits).
  let r = 0;
  for (const c of expanded) r = (r * 10 + (c.charCodeAt(0) - 48)) % 97;
  return r === 1;
}

function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  const len = s.length;
  let h = 0;
  for (const k in freq) {
    const p = freq[k]! / len;
    h -= p * Math.log2(p);
  }
  return h;
}

// Aadhaar Verhoeff checksum
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeff(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length !== 12) return false;
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![parseInt(reversed[i]!, 10)]!]!;
  }
  return c === 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────────────────────────────────

export const PATTERNS: SensitivePattern[] = [
  // ── Financial ──────────────────────────────────────────────────────────
  {
    id: 'credit-card',
    name: 'Credit / debit card (PAN)',
    category: 'financial',
    severity: 'critical',
    description: 'Primary Account Number — 13-19 digits with Luhn checksum.',
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    defaultConfidence: 'low',
    validate: (m) => (luhn(m) ? 'verified' : null),
  },
  {
    id: 'iban',
    name: 'IBAN',
    category: 'financial',
    severity: 'high',
    description: 'International Bank Account Number — country code + check digits + BBAN, mod-97 verified.',
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}[A-Z0-9]{6,28}\b/g,
    defaultConfidence: 'medium',
    validate: (m) => (ibanMod97(m) ? 'verified' : null),
  },
  {
    id: 'us-routing',
    name: 'US ABA routing number',
    category: 'financial',
    severity: 'medium',
    description: '9-digit ABA routing/transit number (ABA RTN).',
    re: /\b\d{9}\b/g,
    defaultConfidence: 'low',
  },

  // ── Government ID ──────────────────────────────────────────────────────
  {
    id: 'us-ssn',
    name: 'US Social Security Number',
    category: 'government-id',
    severity: 'critical',
    description: 'AAA-GG-SSSS. Excludes obvious invalid ranges (000, 666, 9XX area).',
    re: /\b(?!000|666|9\d\d)\d{3}[ -]?(?!00)\d{2}[ -]?(?!0000)\d{4}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'aadhaar',
    name: 'AADHAAR (India)',
    category: 'government-id',
    severity: 'critical',
    description: '12-digit Indian national ID with Verhoeff checksum.',
    re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
    defaultConfidence: 'medium',
    validate: (m) => (verhoeff(m) ? 'verified' : null),
  },
  {
    id: 'pan',
    name: 'PAN (India)',
    category: 'government-id',
    severity: 'high',
    description: 'Permanent Account Number — five letters, four digits, one letter.',
    re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'uk-nino',
    name: 'UK National Insurance Number',
    category: 'government-id',
    severity: 'high',
    description: 'NINO — two letters + 6 digits + suffix letter.',
    re: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]?\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'us-passport',
    name: 'US passport number',
    category: 'government-id',
    severity: 'high',
    description: '9-digit US passport number.',
    re: /\b[0-9]{9}\b/g,
    defaultConfidence: 'low',
  },

  // ── Health ──────────────────────────────────────────────────────────
  {
    id: 'nhs',
    name: 'NHS number (UK)',
    category: 'health',
    severity: 'critical',
    description: 'UK NHS patient identifier — 10 digits with mod-11 checksum.',
    re: /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g,
    defaultConfidence: 'low',
    validate: (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length !== 10) return null;
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(digits[i]!, 10) * (10 - i);
      let check = 11 - (sum % 11);
      if (check === 11) check = 0;
      if (check === 10) return null; // invalid by spec
      return check === parseInt(digits[9]!, 10) ? 'verified' : null;
    },
  },

  // ── Credentials & secrets ─────────────────────────────────────────────
  {
    id: 'aws-access-key',
    name: 'AWS access key ID',
    category: 'credential',
    severity: 'critical',
    description: 'AKIA / ASIA-prefixed 20-char key.',
    re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'aws-secret-key',
    name: 'AWS secret access key (likely)',
    category: 'credential',
    severity: 'critical',
    description: '40-char base64-ish secret near an AWS context.',
    re: /\b[A-Za-z0-9/+=]{40}\b/g,
    defaultConfidence: 'low',
    validate: (m) => (shannonEntropy(m) >= 4.5 ? 'medium' : null),
  },
  {
    id: 'gh-pat',
    name: 'GitHub Personal Access Token',
    category: 'credential',
    severity: 'critical',
    description: 'Classic ghp_ / fine-grained github_pat_ tokens.',
    re: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,255})\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'gh-oauth',
    name: 'GitHub OAuth / app token',
    category: 'credential',
    severity: 'critical',
    description: 'gho_ / ghu_ / ghs_ / ghr_ prefixed tokens.',
    re: /\b(?:gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'stripe-live',
    name: 'Stripe live key',
    category: 'credential',
    severity: 'critical',
    description: 'sk_live_ / rk_live_ / pk_live_ prefixed Stripe keys.',
    re: /\b(?:sk|rk|pk)_live_[A-Za-z0-9]{24,}\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'openai-key',
    name: 'OpenAI API key',
    category: 'credential',
    severity: 'critical',
    description: 'sk-… (legacy ~51 char) or sk-proj-…',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'anthropic-key',
    name: 'Anthropic API key',
    category: 'credential',
    severity: 'critical',
    description: 'sk-ant- prefixed Anthropic keys.',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'slack-token',
    name: 'Slack token',
    category: 'credential',
    severity: 'critical',
    description: 'xoxa / xoxb / xoxp / xoxs / xoxr prefixed tokens.',
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'jwt',
    name: 'JSON Web Token (JWT)',
    category: 'credential',
    severity: 'high',
    description: 'Three-part base64url with eyJ header start.',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'pem-private',
    name: 'PEM private key',
    category: 'credential',
    severity: 'critical',
    description: '-----BEGIN … PRIVATE KEY----- block.',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    defaultConfidence: 'verified',
  },
  {
    id: 'twilio-sid',
    name: 'Twilio Account SID',
    category: 'credential',
    severity: 'high',
    description: 'AC-prefixed 32-char identifier.',
    re: /\bAC[a-f0-9]{32}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'gcp-key',
    name: 'GCP service-account key (JSON fragment)',
    category: 'credential',
    severity: 'critical',
    description: 'GCP service-account "type": "service_account" header.',
    re: /"type"\s*:\s*"service_account"/g,
    defaultConfidence: 'high',
  },

  // ── Personal contact ───────────────────────────────────────────────────
  {
    id: 'email',
    name: 'Email address',
    category: 'personal',
    severity: 'medium',
    description: 'RFC-5321-ish email address.',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'phone-e164',
    name: 'Phone number (E.164)',
    category: 'personal',
    severity: 'medium',
    description: 'International E.164 — +CCNNNNNNNNNN.',
    re: /\+\d{7,15}\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'phone-us',
    name: 'Phone number (US)',
    category: 'personal',
    severity: 'medium',
    description: 'US-formatted phone — (NNN) NNN-NNNN or NNN-NNN-NNNN.',
    re: /\b(?:\(\d{3}\)\s?|\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g,
    defaultConfidence: 'medium',
  },

  // ── Network ────────────────────────────────────────────────────────────
  {
    id: 'ipv4-private',
    name: 'IPv4 in RFC1918 private range',
    category: 'network',
    severity: 'low',
    description: '10/8, 172.16/12, 192.168/16 — internal infrastructure leak.',
    re: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
    defaultConfidence: 'high',
  },
  {
    id: 'ipv4-public',
    name: 'IPv4 (public)',
    category: 'network',
    severity: 'low',
    description: 'Plain IPv4 outside RFC1918 / loopback / link-local.',
    re: /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g,
    defaultConfidence: 'medium',
  },
  {
    id: 'mac',
    name: 'MAC address',
    category: 'network',
    severity: 'low',
    description: 'IEEE 802 hardware address.',
    re: /\b(?:[A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}\b/g,
    defaultConfidence: 'high',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Detection driver
// ─────────────────────────────────────────────────────────────────────────

export interface Finding {
  pattern: SensitivePattern;
  text: string;
  index: number;
  confidence: Confidence;
}

export function detect(input: string): Finding[] {
  if (!input) return [];
  const out: Finding[] = [];
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      let confidence: Confidence | null = p.defaultConfidence;
      if (p.validate) {
        const v = p.validate(m[0]);
        if (v === null) {
          // Validator says drop.
          continue;
        }
        confidence = v;
      }
      out.push({ pattern: p, text: m[0], index: m.index, confidence });
      if (out.length > 1000) return out;
    }
  }
  // Drop overlapping findings — keep the higher-severity / earlier one.
  out.sort((a, b) => a.index - b.index || rankSeverity(b) - rankSeverity(a));
  const filtered: Finding[] = [];
  let lastEnd = -1;
  for (const f of out) {
    if (f.index >= lastEnd) {
      filtered.push(f);
      lastEnd = f.index + f.text.length;
    }
  }
  return filtered;
}

function rankSeverity(f: Finding): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[f.pattern.severity];
}

export function summary(findings: Finding[]): {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  worst: Severity;
} {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Record<Category, number> = {
    financial: 0,
    personal: 0,
    credential: 0,
    network: 0,
    health: 0,
    'government-id': 0,
  };
  for (const f of findings) {
    bySeverity[f.pattern.severity]++;
    byCategory[f.pattern.category]++;
  }
  const worst = (['critical', 'high', 'medium', 'low'] as const).find((s) => bySeverity[s] > 0) ?? 'low';
  return { total: findings.length, bySeverity, byCategory, worst };
}

/**
 * Apply a redaction mask to the input — replace every detected match with
 * `[REDACTED:<short id>]`.
 */
export function redact(input: string, findings: Finding[]): string {
  if (!findings.length) return input;
  const sorted = [...findings].sort((a, b) => b.index - a.index);
  let out = input;
  for (const f of sorted) {
    out = out.slice(0, f.index) + `[REDACTED:${f.pattern.id}]` + out.slice(f.index + f.text.length);
  }
  return out;
}
