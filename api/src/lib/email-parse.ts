import { refang } from './indicator';

export interface ParsedHeaders {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  message_id?: string;
  'reply-to'?: string;
  'return-path'?: string;
  'authentication-results'?: string;
  _received_hops: number;
  [key: string]: string | number | undefined;
}

export interface AuthResults {
  spf: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dkim: 'pass' | 'fail' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dmarc: 'pass' | 'fail' | 'none' | 'temperror' | 'permerror' | 'unknown';
}

const HEADER_LINE_RE = /^([!-9;-~]+):\s?(.*)$/;

export function parseHeaders(source: string): ParsedHeaders {
  // Split header section (everything before first blank line)
  const idx = source.search(/\r?\n\r?\n/);
  const headerSection = idx >= 0 ? source.slice(0, idx) : source;

  // Unfold continuations: lines starting with whitespace are continuations of previous line
  const unfolded: string[] = [];
  for (const line of headerSection.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ' ' + line.trim();
    } else {
      unfolded.push(line);
    }
  }

  const out: ParsedHeaders = { _received_hops: 0 };
  for (const line of unfolded) {
    const m = line.match(HEADER_LINE_RE);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === 'received') {
      out._received_hops = (out._received_hops as number) + 1;
      continue;
    }
    // Map message-id to message_id for cleaner access
    const outKey = key === 'message-id' ? 'message_id' : key;
    out[outKey] = out[outKey] ? `${out[outKey]}\n${val}` : val;
  }
  return out;
}

const URL_RE = /\b(https?|hxxps?):\/\/[^\s<>"')]+/gi;

export function extractUrls(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(URL_RE)) {
    const refanged = refang(match[0]);
    found.add(refanged);
  }
  return Array.from(found);
}

const VERDICT_VALUES = new Set(['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror']);

function extractVerdict(haystack: string, key: string): AuthResults['spf'] {
  const re = new RegExp(`\\b${key}=(\\w+)`, 'i');
  const m = haystack.match(re);
  if (!m) return 'unknown';
  const v = m[1].toLowerCase();
  return VERDICT_VALUES.has(v) ? (v as AuthResults['spf']) : 'unknown';
}

export function parseAuthResults(authResultsHeader: string): AuthResults {
  return {
    spf: extractVerdict(authResultsHeader, 'spf'),
    dkim: extractVerdict(authResultsHeader, 'dkim') as AuthResults['dkim'],
    dmarc: extractVerdict(authResultsHeader, 'dmarc') as AuthResults['dmarc'],
  };
}

export function normalizeAddress(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return m ? m[1] : value.trim();
}
