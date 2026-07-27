/**
 * Pure-client encoder - counterpart to lib/dfir/decode.ts.
 *
 * Each encoder is reversible against the corresponding decoder pass.
 * The chain mode applies passes left-to-right so a "url -> base64"
 * chain wraps the URL-encoded form in base64. Useful for analysts
 * crafting test payloads or replicating obfuscation chains they're
 * about to triage.
 */

export type Encoding = 'base64' | 'url' | 'hex' | 'binary' | 'rot13' | 'urlsafe-base64';

export interface EncodeStep {
  encoding: Encoding;
  before: string;
  after: string;
}

const TXT = new TextEncoder();

function toBase64(s: string): string {
  const bytes = TXT.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toUrlSafeBase64(s: string): string {
  return toBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(s: string): string {
  const bytes = TXT.encode(s);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function toBinary(s: string): string {
  const bytes = TXT.encode(s);
  return Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join(' ');
}

function rot13(s: string): string {
  return s.replace(/[A-Za-z]/g, (ch) => {
    const c = ch.charCodeAt(0);
    const base = c >= 97 ? 97 : 65;
    return String.fromCharCode(((c - base + 13) % 26) + base);
  });
}

export function encode(input: string, encoding: Encoding): string {
  if (!input) return '';
  switch (encoding) {
    case 'base64':
      return toBase64(input);
    case 'urlsafe-base64':
      return toUrlSafeBase64(input);
    case 'url':
      return encodeURIComponent(input);
    case 'hex':
      return toHex(input);
    case 'binary':
      return toBinary(input);
    case 'rot13':
      return rot13(input);
    default:
      return input;
  }
}

/**
 * Apply a chain of encodings left-to-right. For each pass, returns the
 * before/after pair so the UI can render the transformation history.
 */
export function encodeChain(input: string, encodings: Encoding[]): EncodeStep[] {
  const steps: EncodeStep[] = [];
  let current = input;
  for (const enc of encodings) {
    const before = current;
    const after = encode(before, enc);
    steps.push({ encoding: enc, before, after });
    current = after;
  }
  return steps;
}
