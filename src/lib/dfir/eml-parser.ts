/**
 * Pure-client RFC 5322 / MIME parser focused on attachment extraction.
 *
 * Scope: extract Content-Disposition: attachment parts (and inline parts
 * with a filename) plus their decoded bytes, then SHA-256 each one. Used
 * by /dfir/eml. Not a full mail parser - header decoding is best-effort,
 * we don't follow message/rfc822 nesting unless the user pastes the
 * inner message manually.
 *
 * Encodings handled:
 *   - 7bit / 8bit / binary  (passthrough)
 *   - base64                (atob with padding fix)
 *   - quoted-printable      (=XX hex + soft line breaks)
 *
 * Charset of HEADERS handled via RFC 2047 encoded-word (=?utf-8?B?...?=
 * and =?iso-8859-1?Q?...?=). Body charset stays as bytes - we hash bytes,
 * we don't decode bodies as text.
 *
 * Hard limits: 10 MB total .eml input, 5 MB per part. Beyond those, the
 * parser bails with a clear error.
 */

import { md5HexFromBytes } from './md5';

const MAX_INPUT = 10 * 1024 * 1024;
const MAX_PART_BYTES = 5 * 1024 * 1024;

export interface EmlHeader {
  name: string;
  value: string;
}

export interface EmlAttachment {
  /** Decoded filename, or "(unnamed)" if none. */
  filename: string;
  /** MIME content-type without parameters. */
  contentType: string;
  /** content-disposition: attachment | inline | (none). */
  disposition: 'attachment' | 'inline' | 'unknown';
  /** Decoded byte length. */
  size: number;
  /** Hex-encoded SHA-256 of the decoded bytes. */
  sha256: string;
  /** Hex-encoded SHA-1 of the decoded bytes (for compatibility with older corpora). */
  sha1: string;
  /** Hex-encoded MD5 of the decoded bytes (legacy IOC compatibility). */
  md5: string;
  /** True if the part exceeded the per-part byte cap and was truncated. */
  truncated: boolean;
}

export interface ParsedEml {
  headers: EmlHeader[];
  /** Decoded subject (RFC 2047 unwrapped). */
  subject?: string;
  /** Decoded from header (display + addr-spec). */
  from?: string;
  to?: string;
  date?: string;
  /** Top-level Content-Type. */
  contentType?: string;
  attachments: EmlAttachment[];
  /** Soft warnings - parsing continued, but something was odd. */
  warnings: string[];
}

/* ──────────────────────────────────────────────────────────────────
 * Header decoding (RFC 2047 encoded-word)
 * ────────────────────────────────────────────────────────────────── */

function decodeQ(s: string): string {
  // =XX → byte; underscore → space
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '=' && i + 2 < s.length) {
      const hex = s.slice(i + 1, i + 3);
      const code = parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        out += String.fromCharCode(code);
        i += 2;
        continue;
      }
    }
    if (ch === '_') out += ' ';
    else out += ch;
  }
  return out;
}

function decodeEncodedWord(token: string): string {
  // =?charset?encoding?text?=
  const m = /^=\?([^?]+)\?([BbQq])\?([^?]*)\?=$/.exec(token);
  if (!m || !m[1] || !m[2] || m[3] == null) return token;
  const charset = m[1].toLowerCase();
  const encoding = m[2].toUpperCase();
  const text = m[3];
  let bytes: Uint8Array;
  try {
    if (encoding === 'B') {
      const bin = atob(text);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } else {
      const decoded = decodeQ(text);
      bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i) & 0xff;
    }
    return new TextDecoder(charset === 'utf8' ? 'utf-8' : charset, { fatal: false }).decode(bytes);
  } catch {
    return token;
  }
}

function decodeHeaderValue(value: string): string {
  // Replace encoded-words inline. "Adjacent" encoded-words have whitespace
  // collapsed between them per RFC.
  return value.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)(\s+(?==\?))?/g, (_full, word: string) => decodeEncodedWord(word));
}

/* ──────────────────────────────────────────────────────────────────
 * Header parsing
 * ────────────────────────────────────────────────────────────────── */

interface ParsedHeader {
  raw: string;
  name: string;
  value: string;
  /** Map of param name → value, with quotes stripped. */
  params: Record<string, string>;
}

/**
 * Split eml into header block + body, then unfold header continuations
 * (lines starting with whitespace are continuations of the prior header).
 */
function splitHeaderBody(eml: string): { headers: string[]; body: string } {
  const sep = eml.search(/\r?\n\r?\n/);
  if (sep < 0) return { headers: [], body: eml };
  const headerBlock = eml.slice(0, sep);
  const body = eml.slice(sep).replace(/^(\r?\n){2}/, '');
  const lines = headerBlock.split(/\r?\n/);
  const folded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && folded.length > 0) {
      folded[folded.length - 1] += ' ' + line.trim();
    } else if (line.length > 0) {
      folded.push(line);
    }
  }
  return { headers: folded, body };
}

function parseHeaderLine(line: string): ParsedHeader | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const name = line.slice(0, idx).trim();
  const rest = line.slice(idx + 1).trim();

  // Split off parameters at "; key=value; key2=value2"
  const params: Record<string, string> = {};
  const segments: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  for (const ch of rest) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === '(' && !inQuote) depth += 1;
    if (ch === ')' && !inQuote) depth = Math.max(0, depth - 1);
    if (ch === ';' && !inQuote && depth === 0) {
      segments.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) segments.push(cur);

  const value = (segments[0] ?? '').trim();
  for (let i = 1; i < segments.length; i += 1) {
    const seg = segments[i]!.trim();
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    const k = seg.slice(0, eq).trim().toLowerCase();
    let v = seg.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    params[k] = v;
  }
  return { raw: line, name, value, params };
}

/* ──────────────────────────────────────────────────────────────────
 * Body decoding
 * ────────────────────────────────────────────────────────────────── */

function decodeBase64ToBytes(s: string): Uint8Array {
  // Strip whitespace, fix padding
  const cleaned = s.replace(/[\r\n\s]/g, '');
  const padded = cleaned.padEnd(cleaned.length + ((4 - (cleaned.length % 4)) % 4), '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeQpToBytes(s: string): Uint8Array {
  // Soft line breaks: =\r?\n → empty
  const noSoft = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < noSoft.length; i += 1) {
    const ch = noSoft[i];
    if (ch === '=' && i + 2 < noSoft.length) {
      const hex = noSoft.slice(i + 1, i + 3);
      const code = parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        out.push(code);
        i += 2;
        continue;
      }
    }
    out.push((ch ?? '\0').charCodeAt(0) & 0xff);
  }
  return new Uint8Array(out);
}

function passthroughToBytes(s: string): Uint8Array {
  // 7bit / 8bit / binary: each char becomes a byte (low 8 bits).
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * MIME multipart walker
 * ────────────────────────────────────────────────────────────────── */

interface MimePart {
  headers: ParsedHeader[];
  body: string;
}

function splitParts(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  const closeMarker = `--${boundary}--`;
  const parts: string[] = [];
  // Normalise line endings so split is consistent.
  const normalised = body.replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line === marker) {
      if (cur) parts.push(cur.join('\n'));
      cur = [];
      continue;
    }
    if (line === closeMarker) {
      if (cur) parts.push(cur.join('\n'));
      cur = null;
      break;
    }
    if (cur) cur.push(line);
  }
  return parts;
}

function parsePart(raw: string): MimePart {
  const { headers, body } = splitHeaderBody(raw);
  const parsedHeaders: ParsedHeader[] = [];
  for (const h of headers) {
    const ph = parseHeaderLine(h);
    if (ph) parsedHeaders.push(ph);
  }
  return { headers: parsedHeaders, body };
}

function findHeader(headers: ParsedHeader[], name: string): ParsedHeader | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower);
}

/* ──────────────────────────────────────────────────────────────────
 * Hashing
 * ────────────────────────────────────────────────────────────────── */

async function digestHex(algorithm: 'SHA-256' | 'SHA-1' | 'MD5', bytes: Uint8Array): Promise<string> {
  // SubtleCrypto doesn't ship MD5. We compute MD5 via the shared module
  // (lib/dfir/md5.ts) - legacy IOC databases still key by MD5.
  if (algorithm === 'MD5') return md5HexFromBytes(bytes);
  const buf = await crypto.subtle.digest(algorithm, bytes as unknown as BufferSource);
  const arr = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < arr.length; i += 1) out += arr[i]!.toString(16).padStart(2, '0');
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────────────── */

export async function parseEml(eml: string): Promise<ParsedEml> {
  const warnings: string[] = [];
  if (eml.length > MAX_INPUT) {
    throw new Error(`Input too large: ${eml.length} bytes > ${MAX_INPUT} bytes max`);
  }

  const { headers: hdrLines, body } = splitHeaderBody(eml);
  const headers: ParsedHeader[] = [];
  for (const line of hdrLines) {
    const ph = parseHeaderLine(line);
    if (ph) headers.push(ph);
  }

  const decodedHeaders: EmlHeader[] = headers.map((h) => ({
    name: h.name,
    value: decodeHeaderValue(h.value),
  }));

  const subject = decodedHeaders.find((h) => h.name.toLowerCase() === 'subject')?.value;
  const from = decodedHeaders.find((h) => h.name.toLowerCase() === 'from')?.value;
  const to = decodedHeaders.find((h) => h.name.toLowerCase() === 'to')?.value;
  const date = decodedHeaders.find((h) => h.name.toLowerCase() === 'date')?.value;

  const ct = findHeader(headers, 'content-type');
  const contentType = ct?.value;

  const attachments: EmlAttachment[] = [];

  // Recursive walker - flat-walks every leaf MIME part. message/rfc822
  // nesting is treated as a leaf (the user can paste the inner message).
  async function walk(partHeaders: ParsedHeader[], partBody: string, depth: number): Promise<void> {
    if (depth > 20) {
      warnings.push('multipart nesting too deep - bailing at depth 20');
      return;
    }
    const ctHeader = findHeader(partHeaders, 'content-type');
    const ctValue = (ctHeader?.value ?? '').toLowerCase();
    const boundary = ctHeader?.params['boundary'];
    if (ctValue.startsWith('multipart/') && boundary) {
      const subParts = splitParts(partBody, boundary);
      for (const sp of subParts) {
        const parsed = parsePart(sp);
        await walk(parsed.headers, parsed.body, depth + 1);
      }
      return;
    }

    // Leaf part. Is it an attachment?
    const cdHeader = findHeader(partHeaders, 'content-disposition');
    const cdValue = (cdHeader?.value ?? '').toLowerCase();
    const filename =
      cdHeader?.params['filename'] ??
      cdHeader?.params['filename*'] ??
      ctHeader?.params['name'] ??
      ctHeader?.params['name*'] ??
      null;

    const isAttachment = cdValue === 'attachment' || (filename != null && cdValue !== 'inline-only');
    const hasFilename = filename != null && filename.length > 0;

    // We treat any leaf part with a filename as an attachment for
    // forensics purposes - analysts typically want every embedded file
    // hashed, not just those flagged disposition: attachment.
    if (!isAttachment && !hasFilename) return;

    const cteHeader = findHeader(partHeaders, 'content-transfer-encoding');
    const cte = (cteHeader?.value ?? '7bit').toLowerCase();

    let bytes: Uint8Array;
    try {
      if (cte === 'base64') bytes = decodeBase64ToBytes(partBody);
      else if (cte === 'quoted-printable') bytes = decodeQpToBytes(partBody);
      else bytes = passthroughToBytes(partBody);
    } catch (e) {
      warnings.push(`failed to decode part "${filename ?? '(unnamed)'}": ${(e as Error).message}`);
      return;
    }

    let truncated = false;
    if (bytes.length > MAX_PART_BYTES) {
      bytes = bytes.slice(0, MAX_PART_BYTES);
      truncated = true;
    }

    const [sha256, sha1, md5] = await Promise.all([
      digestHex('SHA-256', bytes),
      digestHex('SHA-1', bytes),
      digestHex('MD5', bytes),
    ]);

    attachments.push({
      filename: hasFilename ? decodeHeaderValue(filename!) : '(unnamed)',
      contentType: ctValue.split(';')[0]!.trim() || 'application/octet-stream',
      disposition: cdValue === 'attachment' ? 'attachment' : cdValue === 'inline' ? 'inline' : 'unknown',
      size: bytes.length,
      sha256,
      sha1,
      md5,
      truncated,
    });
  }

  await walk(headers, body, 0);

  return {
    headers: decodedHeaders,
    subject,
    from,
    to,
    date,
    contentType,
    attachments,
    warnings,
  };
}
