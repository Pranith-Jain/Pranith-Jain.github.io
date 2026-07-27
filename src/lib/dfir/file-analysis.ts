/**
 * Pure-client static file analysis for the malware-scan tool.
 *
 * Computes hashes (SHA-256 / SHA-1 / MD5), detects file type from magic
 * bytes, calculates Shannon entropy, and extracts ASCII strings ≥ 4
 * chars. Doesn't disassemble or sandbox - that's what /dfir/malware-scan
 * routes you to (VirusTotal, MalwareBazaar, ANY.RUN, Joe Sandbox).
 *
 * MD5 implementation lives in eml-parser.ts because SubtleCrypto.digest
 * doesn't ship MD5; we re-import it here rather than duplicating.
 */

import { md5HexFromBytes } from './md5';

export interface FileAnalysis {
  filename: string;
  size: number;
  /** Magic-byte detected file type, or "unknown". */
  fileType: string;
  /** Two-letter file-family classifier ("PE", "ELF", "Mach-O", "PDF", "ZIP", "Office", "Image", "Script", "Other"). */
  family: string;
  sha256: string;
  sha1: string;
  md5: string;
  /** Shannon entropy 0-8. >7.5 = packed/encrypted. */
  entropy: number;
  /** First N ASCII strings ≥ 4 chars. Capped at 200 entries. */
  strings: string[];
  /** True if the file was truncated for analysis (size > MAX_BYTES). */
  truncated: boolean;
  /** Heuristic tags ("packed", "high-entropy", "embedded-pe", "dropper-strings", etc). */
  tags: string[];
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB hard cap for in-browser analysis
const MAX_STRINGS = 200;
const MIN_STRING_LEN = 4;

/* ──────────────────────────────────────────────────────────────────
 * Magic-byte detection
 * ────────────────────────────────────────────────────────────────── */

interface MagicSig {
  bytes: number[];
  /** Optional offset (default 0). */
  offset?: number;
  type: string;
  family: string;
}

const MAGIC_SIGS: MagicSig[] = [
  { bytes: [0x4d, 0x5a], type: 'Windows PE / DOS executable', family: 'PE' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], type: 'ELF executable', family: 'ELF' },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], type: 'Mach-O 32-bit', family: 'Mach-O' },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], type: 'Mach-O 64-bit', family: 'Mach-O' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], type: 'Mach-O 32-bit (LE)', family: 'Mach-O' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], type: 'Mach-O 64-bit (LE)', family: 'Mach-O' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], type: 'Mach-O fat / Java class', family: 'Mach-O / Java' },
  { bytes: [0x25, 0x50, 0x44, 0x46], type: 'PDF', family: 'PDF' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], type: 'ZIP / Office (DOCX/XLSX/PPTX) / JAR / APK', family: 'ZIP/Office' },
  { bytes: [0x50, 0x4b, 0x05, 0x06], type: 'ZIP (empty archive)', family: 'ZIP/Office' },
  {
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    type: 'Microsoft OLE2 / DOC / XLS / MSI',
    family: 'Office',
  },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], type: 'RAR archive', family: 'Archive' },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], type: '7-Zip archive', family: 'Archive' },
  { bytes: [0x1f, 0x8b], type: 'gzip', family: 'Archive' },
  { bytes: [0x42, 0x5a, 0x68], type: 'bzip2', family: 'Archive' },
  { bytes: [0xff, 0xd8, 0xff], type: 'JPEG image', family: 'Image' },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type: 'PNG image', family: 'Image' },
  { bytes: [0x47, 0x49, 0x46, 0x38], type: 'GIF image', family: 'Image' },
  { bytes: [0x52, 0x49, 0x46, 0x46], type: 'RIFF (WebP / WAV / AVI)', family: 'Media' },
  { bytes: [0x23, 0x21, 0x2f], type: 'Shebang script (#!/...)', family: 'Script' },
  { bytes: [0x3c, 0x3f, 0x70, 0x68, 0x70], type: 'PHP script (<?php)', family: 'Script' },
  { bytes: [0x3c, 0x68, 0x74, 0x6d, 0x6c], type: 'HTML', family: 'Script' },
];

function detectMagic(bytes: Uint8Array): { type: string; family: string } {
  for (const sig of MAGIC_SIGS) {
    const off = sig.offset ?? 0;
    if (bytes.length < off + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i += 1) {
      if (bytes[off + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return { type: sig.type, family: sig.family };
  }
  return { type: 'unknown / unrecognised magic', family: 'Other' };
}

/* ──────────────────────────────────────────────────────────────────
 * Entropy
 * ────────────────────────────────────────────────────────────────── */

/** Shannon entropy in bits-per-byte. 0 = constant; 8 = uniform random. */
function shannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const freq = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    freq[b] = (freq[b] ?? 0) + 1;
  }
  let h = 0;
  const len = bytes.length;
  for (let i = 0; i < 256; i += 1) {
    const c = freq[i];
    if (!c) continue;
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
}

/* ──────────────────────────────────────────────────────────────────
 * String extraction
 * ────────────────────────────────────────────────────────────────── */

function extractStrings(bytes: Uint8Array, max = MAX_STRINGS, minLen = MIN_STRING_LEN): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < bytes.length && out.length < max; i += 1) {
    const b = bytes[i] ?? 0;
    if (b >= 0x20 && b < 0x7f) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= minLen) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen && out.length < max) out.push(cur);
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Heuristic tagging
 * ────────────────────────────────────────────────────────────────── */

const SUSPICIOUS_STRINGS = [
  /\bpowershell\b.*-enc/i,
  /\bDownloadString\b/i,
  /\bIEX\b/,
  /VirtualAlloc/i,
  /WriteProcessMemory/i,
  /CreateRemoteThread/i,
  /Mimikatz/i,
  /\bcobaltstrike\b/i,
  /\bshellcode\b/i,
  /\.onion\b/i,
  /amsi/i,
  /ETWEnableLevel/i,
  /Sleep\(/,
];

function tagHeuristics(analysis: FileAnalysis, bytes: Uint8Array): string[] {
  const tags: string[] = [];
  if (analysis.entropy > 7.5) tags.push('high-entropy (likely packed/encrypted)');
  else if (analysis.entropy > 7.0) tags.push('elevated entropy');

  // Embedded PE inside non-PE container
  if (analysis.family !== 'PE') {
    for (let i = 0; i + 1 < bytes.length; i += 1) {
      if (bytes[i] === 0x4d && bytes[i + 1] === 0x5a && i > 0) {
        // require nearby "PE\0\0" within 1KB to reduce false positives
        for (let j = i; j < Math.min(i + 1024, bytes.length - 4); j += 1) {
          if (bytes[j] === 0x50 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0 && bytes[j + 3] === 0) {
            tags.push(`embedded PE at offset ${i}`);
            break;
          }
        }
        if (tags.find((t) => t.startsWith('embedded PE'))) break;
      }
    }
  }

  // Strings-based heuristics
  const blob = analysis.strings.join('\n');
  for (const re of SUSPICIOUS_STRINGS) {
    if (re.test(blob)) tags.push(`suspicious string match: ${re.source.slice(0, 30)}`);
  }

  return tags;
}

/* ──────────────────────────────────────────────────────────────────
 * Hashing
 * ────────────────────────────────────────────────────────────────── */

async function digestHex(algorithm: 'SHA-256' | 'SHA-1', bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(algorithm, bytes as unknown as BufferSource);
  const arr = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < arr.length; i += 1) out += arr[i]!.toString(16).padStart(2, '0');
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Public entry point
 * ────────────────────────────────────────────────────────────────── */

export async function analyseFile(file: File): Promise<FileAnalysis> {
  const truncated = file.size > MAX_BYTES;
  const usable = truncated ? file.slice(0, MAX_BYTES) : file;
  const buf = await usable.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const { type: fileType, family } = detectMagic(bytes);
  const [sha256, sha1, md5] = await Promise.all([
    digestHex('SHA-256', bytes),
    digestHex('SHA-1', bytes),
    Promise.resolve(md5HexFromBytes(bytes)),
  ]);
  const entropy = shannonEntropy(bytes);
  const strings = extractStrings(bytes);

  const partial: FileAnalysis = {
    filename: file.name || '(unnamed)',
    size: file.size,
    fileType,
    family,
    sha256,
    sha1,
    md5,
    entropy,
    strings,
    truncated,
    tags: [],
  };
  partial.tags = tagHeuristics(partial, bytes);
  return partial;
}
