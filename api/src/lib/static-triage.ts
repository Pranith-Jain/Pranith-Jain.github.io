/**
 * Static file triage — magic-byte identification, entropy profiling and
 * PE/archive inspection with packer + embedded-artifact heuristics.
 *
 * Fleet-parity with the STATIC half of a sandbox pipeline, minus any
 * execution/detonation: everything runs in-process on the raw bytes.
 *
 * Pipeline:
 *   1. Size guard      — inputs above MAX_TRIAGE_BYTES throw ('too large');
 *                        the REST route maps that to a 400.
 *   2. Magic sniffing  — ordered signature checks: MZ→PE, ELF, Mach-O,
 *                        %PDF-, PK zip/ooxml, {\rtf, script text, pcap,
 *                        pcapng, OLE compound document.
 *   3. Hashing         — SHA-256 + SHA-1 via crypto.subtle; MD5 via a
 *                        compact embedded pure-JS implementation (WebCrypto
 *                        deliberately exposes no MD5).
 *   4. Entropy         — Shannon entropy (0..8, 2 decimals) overall, per PE
 *                        section, and on the PE overlay when > 64 KB.
 *   5. Deep inspection — COFF header, optional header (0x10b/0x20b), guarded
 *                        section table (≤96 entries), import-directory walk
 *                        for DLL names (cap 64), overlay detection, ZIP
 *                        central-directory walk, embedded-MZ/PE scan.
 *   6. Heuristics      — packer signals (UPX names, high-entropy sections,
 *                        few imports, overlay entropy) and script indicators
 *                        (powershell -enc/-w hidden/IEX/DownloadString,
 *                        cmd /c, certutil, rundll32, regsvr32, long base64,
 *                        Office macro markers). Case-insensitive throughout.
 */

export type FileFamily =
  'pe' | 'elf' | 'macho' | 'pdf' | 'zip' | 'ooxml' | 'rtf' | 'script' | 'pcap' | 'pcapng' | 'unknown';

export interface PeSectionInfo {
  name: string;
  virtualSize: number;
  rawSize: number;
  entropy: number;
  characteristics: string[];
}

export interface PeInfo {
  machine: 'x86' | 'x64' | 'ARM64';
  timestamp: number;
  subsystem: number;
  isDLL: boolean;
  isDriver: boolean;
  sections: PeSectionInfo[];
  /** Imported DLL names, capped at 64. */
  importsSummary?: string[];
  hasDigitalSignature: boolean;
  overlayOffset?: number;
  overlaySize?: number;
}

export type PackerSignalName =
  | 'UPX'
  | 'high_entropy_sections'
  | 'few_imports'
  | 'suspicious_section_name'
  | 'overlay_high_entropy'
  | 'low_imports_no_kernel32';

export interface PackerSignal {
  name: PackerSignalName;
  evidence: string;
  severity: 'info' | 'low' | 'medium' | 'high';
}

export interface EmbeddedArtifact {
  kind: 'embedded_pe' | 'nested_zip' | 'ole_cdf';
  offset: number;
  note: string;
}

export interface ScriptIndicators {
  powershellEnc: boolean;
  powershellHidden: boolean;
  iex: boolean;
  downloadString: boolean;
  cmdC: boolean;
  certutil: boolean;
  rundll32: boolean;
  regsvr32: boolean;
  /** True when a contiguous base64-looking run longer than 512 chars exists. */
  longBase64: boolean;
  /** Matched macro markers ('AutoOpen', 'Document_Open'). */
  macroMarkers: string[];
}

export interface StaticTriageResult {
  fileSize: number;
  fileType: { family: FileFamily; detail?: string };
  mimeHint: string;
  sha256: string;
  md5?: string;
  sha1?: string;
  entropy: { overall: number; perSection?: Array<{ name: string; entropy: number }> };
  pe?: PeInfo;
  packerSignals: PackerSignal[];
  embeddedArtifacts: EmbeddedArtifact[];
  scriptIndicators?: ScriptIndicators;
  zipMembers?: Array<{ name: string; size: number }>;
  notes: string[];
}

/** Hard ceiling for triaged inputs (8 MB). Larger inputs throw Error('too large'). */
export const MAX_TRIAGE_BYTES = 8 * 1024 * 1024;

/** Cap for the embedded-PE scan before bailing (first-N-wins). */
const EMBEDDED_PE_MAX_HITS = 5;

/** PE section tables larger than this are treated as corrupt. */
const MAX_PE_SECTIONS = 96;

/** Minimum section raw size considered meaningful for entropy signals. */
const MIN_SIGNAL_SECTION_BYTES = 512;

/** Entropy threshold for "high entropy" section/overlay signals. */
const HIGH_ENTROPY_THRESHOLD = 7.2;

/** Overlay entropy is computed only when the overlay exceeds this size. */
const OVERLAY_ENTROPY_MIN_BYTES = 64 * 1024;

/** Overall entropy at/above which a packing note is emitted. */
const OVERALL_ENTROPY_NOTE_THRESHOLD = 7.4;

const SUSPICIOUS_SECTION_NAMES = new Set(['.aspack', '.adata', '.themida', '.petite', '.nspack']);

const MIME_BY_FAMILY: Record<FileFamily, string> = {
  pe: 'application/vnd.microsoft.portable-executable',
  elf: 'application/x-elf',
  macho: 'application/x-mach-binary',
  pdf: 'application/pdf',
  zip: 'application/zip',
  ooxml: 'application/zip',
  rtf: 'application/rtf',
  script: 'text/x-script',
  pcap: 'application/vnd.tcpdump.pcap',
  pcapng: 'application/vnd.tcpdump.pcapng',
  unknown: 'application/octet-stream',
};

const SCRIPT_EXT_DETAIL: Record<string, string> = {
  ps1: 'powershell script',
  psm1: 'powershell module',
  bat: 'batch script',
  cmd: 'batch script',
  sh: 'shell script',
  py: 'python script',
  vbs: 'vbscript',
};

// ─── Small binary helpers ──────────────────────────────────────────────────

/** Little-endian u16 with an out-of-bounds guard (returns 0 past the end). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function u16le(dv: DataView, off: number): number {
  if (off < 0 || off + 2 > dv.byteLength) return 0;
  return dv.getUint16(off, true);
}

/** Little-endian u32 with an out-of-bounds guard (returns 0 past the end). */
function u32le(dv: DataView, off: number): number {
  if (off < 0 || off + 4 > dv.byteLength) return 0;
  return dv.getUint32(off, true);
}

/** Big-endian u32 with an out-of-bounds guard (returns 0 past the end). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function u32be(dv: DataView, off: number): number {
  if (off < 0 || off + 4 > dv.byteLength) return 0;
  return dv.getUint32(off, false);
}

/** Decode a NUL-terminated ASCII string starting at `start` (cap `maxLen`). */
function asciiZ(bytes: Uint8Array, start: number, maxLen: number): string {
  let out = '';
  const end = Math.min(start + maxLen, bytes.length);
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    if (b === undefined || b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

// ─── Entropy ───────────────────────────────────────────────────────────────

function byteHistogram(data: Uint8Array): Int32Array {
  const hist = new Int32Array(256);
  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    if (b !== undefined) hist[b] = (hist[b] ?? 0) + 1;
  }
  return hist;
}

function entropyFromHistogram(hist: Int32Array, total: number): number {
  if (total <= 0) return 0;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    const c = hist[i];
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

/** Shannon entropy of a byte range, 0 (constant) .. 8 (uniformly random). */
export function computeEntropy(data: Uint8Array): number {
  return entropyFromHistogram(byteHistogram(data), data.length);
}

// ─── MD5 (compact pure-JS — WebCrypto has no MD5) ──────────────────────────

const MD5_K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8,
  0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87,
  0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039,
  0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
  0xeb86d391,
]);

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function hexLE32(v: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  return out;
}

/** MD5 digest hex, implemented locally because crypto.subtle omits MD5. */
export function md5Hex(bytes: Uint8Array): string {
  const origLen = bytes.length;
  const bitLenLow = (origLen << 3) >>> 0;
  const bitLenHigh = Math.floor(origLen / 0x20000000);
  const paddedLen = (((origLen + 8) >> 6) << 6) + 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[origLen] = 0x80;
  const pdv = new DataView(padded.buffer);
  pdv.setUint32(paddedLen - 8, bitLenLow, true);
  pdv.setUint32(paddedLen - 4, bitLenHigh, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Int32Array(16);

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) m[i] = pdv.getInt32(chunk + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const ki = MD5_K[i] ?? 0;
      const mi = m[g] ?? 0;
      const si = MD5_S[i] ?? 0;
      f = (f + a + ki + mi) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << si) | (f >>> (32 - si)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  return hexLE32(a0) + hexLE32(b0) + hexLE32(c0) + hexLE32(d0);
}

// ─── Hashing via WebCrypto ────────────────────────────────────────────────

async function digestHex(algorithm: 'SHA-256' | 'SHA-1', bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, bytes as unknown as ArrayBuffer);
  const view = new Uint8Array(digest);
  let hex = '';
  for (const b of view) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// ─── Magic sniffing ───────────────────────────────────────────────────────

interface SniffResult {
  family: FileFamily;
  detail?: string;
  /** Set when an MZ header was found: the parsed e_lfanew value. */
  lfanew?: number;
  /** True when MZ was found but the PE\0\0 signature check failed. */
  mzInvalidPe?: boolean;
  /** True when the OLE compound-document magic (D0 CF 11 E0) matched. */
  oleCdf?: boolean;
}

/** Ratio of text-like bytes in the leading sample (tab/LF/FF/CR, 0x20–0x7E, ≥0x80). */
function printableRatio(bytes: Uint8Array): number {
  const n = Math.min(bytes.length, 4096);
  if (n === 0) return 0;
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === undefined) continue;
    if (b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d) printable++;
    else if (b >= 0x20 && b <= 0x7e) printable++;
    else if (b >= 0x80) printable++; // lenient UTF-8/high-bit text heuristic
  }
  return printable / n;
}

function sniffMagic(dv: DataView, bytes: Uint8Array, len: number): SniffResult {
  // 1. MZ → PE (parse e_lfanew; invalid → flagged, not fatal)
  if (len >= 2 && dv.getUint8(0) === 0x4d && dv.getUint8(1) === 0x5a) {
    const lfanew = u32le(dv, 0x3c);
    // 'PE\0\0' stored little-endian == 0x00004550
    const peSigOk = lfanew >= 0x40 && lfanew + 4 <= len && dv.getUint32(lfanew, true) === 0x00004550;
    if (peSigOk) return { family: 'pe', lfanew };
    return { family: 'unknown', detail: 'dos-mz (no valid PE header)', mzInvalidPe: true, lfanew };
  }
  // 2. ELF
  if (len >= 6 && dv.getUint8(0) === 0x7f && asciiZ(bytes, 1, 3) === 'ELF') {
    const eiClass = len >= 5 ? dv.getUint8(4) : 0;
    return { family: 'elf', detail: eiClass === 2 ? 'elf64' : eiClass === 1 ? 'elf32' : 'elf' };
  }
  // 3. Mach-O — check both endianness readings of the two canonical magics
  if (len >= 4) {
    const mLe = dv.getUint32(0, true);
    const mBe = dv.getUint32(0, false);
    if (mLe === 0xfeedface || mLe === 0xfeedfacf || mBe === 0xfeedface || mBe === 0xfeedfacf) {
      const is64 = mLe === 0xfeedfacf || mBe === 0xfeedfacf;
      return { family: 'macho', detail: is64 ? 'mach-o 64-bit' : 'mach-o 32-bit' };
    }
  }
  // 4. %PDF-
  if (len >= 5 && asciiZ(bytes, 0, 5) === '%PDF-') {
    return { family: 'pdf', detail: `header ${asciiZ(bytes, 0, 8).trim()}` };
  }
  // 5. PK zip family (local-file header, or empty archive EOCD)
  if (len >= 4) {
    const sig = asciiZ(bytes, 0, 4);
    if (sig.startsWith('PK')) {
      if (sig.charCodeAt(2) === 3) return { family: 'zip' };
      if (sig.charCodeAt(2) === 5) return { family: 'zip', detail: 'empty archive' };
    }
  }
  // 6. RTF
  if (len >= 5 && asciiZ(bytes, 0, 5) === '{\\rtf') return { family: 'rtf' };
  // 7. Script / text (shebang, or printable ratio > 0.9 under 1 MB)
  if (len >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21) {
    return { family: 'script', detail: 'shebang script' };
  }
  if (len > 0 && len < 1024 * 1024 && printableRatio(bytes) > 0.9) {
    return { family: 'script' };
  }
  // 8. pcap (both endian magics + nanosecond variants). The detail reflects
  //    how the FILE was written, not the byte order of our read: an LE read
  //    of 0xa1b2c3d4 means the on-disk bytes were D4 C3 B2 A1, i.e. the
  //    producing system wrote little-endian values.
  if (len >= 4) {
    const m = dv.getUint32(0, true);
    if (m === 0xd4c3b2a1 || m === 0x4d3cb2a1) return { family: 'pcap', detail: 'big-endian' };
    if (m === 0xa1b2c3d4 || m === 0xa1b23c4d) return { family: 'pcap', detail: 'little-endian' };
    // 9. pcapng section-header-block
    if (m === 0x0a0d0d0a) return { family: 'pcapng' };
  }
  // 10. OLE compound document (legacy Office) — kept as an artifact, family unknown
  if (len >= 8 && dv.getUint32(0, true) === 0xe011cfd0 && dv.getUint16(4, true) === 0xb1a1) {
    return { family: 'unknown', detail: 'ole-cdf-compound-document', oleCdf: true };
  }
  return { family: 'unknown' };
}

// ─── PE parsing ───────────────────────────────────────────────────────────

interface RawSection {
  name: string;
  virtualSize: number;
  virtAddr: number;
  rawSize: number;
  rawPtr: number;
  chars: number;
}

interface PeParseResult {
  pe: PeInfo;
  signals: PackerSignal[];
  notes: string[];
  perSection: Array<{ name: string; entropy: number }>;
}

function machineName(machine: number): 'x86' | 'x64' | 'ARM64' | null {
  if (machine === 0x014c) return 'x86';
  if (machine === 0x8664) return 'x64';
  if (machine === 0xaa64) return 'ARM64';
  return null;
}

const SCN_FLAGS: Array<[number, string]> = [
  [0x20, 'code'],
  [0x40, 'initialized_data'],
  [0x80, 'uninitialized_data'],
  [0x02000000, 'discardable'],
  [0x20000000, 'execute'],
  [0x40000000, 'read'],
  [0x80000000, 'write'],
];

function decodeSectionCharacteristics(chars: number): string[] {
  const out: string[] = [];
  for (const [bit, name] of SCN_FLAGS) if (chars & bit) out.push(name);
  return out;
}

/** Map an RVA to a file offset via the section table (null when unmappable). */
function rvaToOffset(rva: number, sections: RawSection[]): number | null {
  for (const s of sections) {
    const span = Math.max(s.virtualSize, s.rawSize);
    if (span === 0 || s.rawSize === 0) continue;
    if (rva >= s.virtAddr && rva < s.virtAddr + span) {
      const off = s.rawPtr + (rva - s.virtAddr);
      if (off >= 0 && off < Number.MAX_SAFE_INTEGER) return off;
    }
  }
  return null;
}

function parsePe(bytes: Uint8Array, dv: DataView, len: number, lfanew: number): PeParseResult | null {
  const notes: string[] = [];
  const signals: PackerSignal[] = [];

  const coff = lfanew + 4;
  if (coff + 20 > len) {
    notes.push(`COFF header at 0x${coff.toString(16)} exceeds file size`);
    return null;
  }
  const machineRaw = dv.getUint16(coff, true);
  const machine = machineName(machineRaw);
  if (!machine) {
    notes.push(`unknown PE machine 0x${machineRaw.toString(16)}`);
    return null;
  }
  const numSections = dv.getUint16(coff + 2, true);
  const timestamp = dv.getUint32(coff + 4, true);
  // COFF layout: SizeOfOptionalHeader @ +16, Characteristics @ +18.
  const sizeOptHeader = dv.getUint16(coff + 16, true);
  const coffCharacteristics = dv.getUint16(coff + 18, true);

  const optHeader = coff + 20;
  if (optHeader + 2 > len) {
    notes.push('optional header missing (truncated PE)');
    return null;
  }
  const optMagic = dv.getUint16(optHeader, true);
  if (optMagic !== 0x10b && optMagic !== 0x20b) {
    notes.push(`unexpected optional-header magic 0x${optMagic.toString(16)}`);
    return null;
  }
  const isPe32Plus = optMagic === 0x20b;
  // Subsystem sits at the same offset (68) in both PE32 and PE32+ layouts.
  const subsystem = dv.getUint16(optHeader + 68, true);
  const numDirsOff = isPe32Plus ? optHeader + 108 : optHeader + 92;
  const numDirs = dv.getUint32(numDirsOff, true);
  const dirsBase = numDirsOff + 4;

  const importRva = numDirs >= 2 ? u32le(dv, dirsBase + 8) : 0;
  const certRva = numDirs >= 5 ? u32le(dv, dirsBase + 32) : 0;
  const certSize = numDirs >= 5 ? u32le(dv, dirsBase + 36) : 0;
  const hasDigitalSignature = certRva !== 0 && certSize !== 0;

  // ── Section table (guarded ≤ 96 entries) ──
  const secTableOff = optHeader + sizeOptHeader;
  const sectionCount = Math.min(numSections, MAX_PE_SECTIONS);
  if (numSections > MAX_PE_SECTIONS) {
    notes.push(`section count ${numSections} exceeds sane limit; parsing first ${MAX_PE_SECTIONS}`);
  }
  const rawSections: RawSection[] = [];
  const sectionsOut: PeSectionInfo[] = [];
  const perSection: Array<{ name: string; entropy: number }> = [];
  const oversizedVirtual: string[] = [];
  const highEntropySections: string[] = [];
  const upxSections: string[] = [];
  const suspiciousNamed: string[] = [];

  for (let i = 0; i < sectionCount; i++) {
    const entry = secTableOff + i * 40;
    if (entry + 40 > len) {
      notes.push(`section table entry ${i} extends past end of file`);
      break;
    }
    const name = asciiZ(bytes, entry, 8).trim();
    const raw: RawSection = {
      name,
      virtualSize: dv.getUint32(entry + 8, true),
      virtAddr: dv.getUint32(entry + 12, true),
      rawSize: dv.getUint32(entry + 16, true),
      rawPtr: dv.getUint32(entry + 20, true),
      chars: dv.getUint32(entry + 36, true),
    };
    rawSections.push(raw);

    let entropy = 0;
    const rawEnd = raw.rawPtr + raw.rawSize;
    if (raw.rawSize > 0 && rawEnd <= len) {
      entropy = computeEntropy(bytes.subarray(raw.rawPtr, rawEnd));
    } else {
      notes.push(`section '${name}' raw data at 0x${raw.rawPtr.toString(16)} truncated or absent`);
    }
    perSection.push({ name, entropy });
    sectionsOut.push({
      name,
      virtualSize: raw.virtualSize,
      rawSize: raw.rawSize,
      entropy,
      characteristics: decodeSectionCharacteristics(raw.chars),
    });

    if (raw.virtualSize > raw.rawSize * 2 && raw.virtualSize >= 0x1000) {
      oversizedVirtual.push(`${name} (virtual 0x${raw.virtualSize.toString(16)} >> raw 0x${raw.rawSize.toString(16)})`);
    }
    if (/^upx\d*$/i.test(name)) {
      upxSections.push(name);
    } else if (SUSPICIOUS_SECTION_NAMES.has(name.toLowerCase())) {
      suspiciousNamed.push(name);
    }
    if (entropy >= HIGH_ENTROPY_THRESHOLD && raw.rawSize >= MIN_SIGNAL_SECTION_BYTES) {
      highEntropySections.push(`${name}=${entropy.toFixed(2)}`);
    }
  }

  if (oversizedVirtual.length > 0) {
    notes.push(`virtual size far exceeds raw size for: ${oversizedVirtual.join(', ')} (packer stub behavior)`);
  }
  if (upxSections.length > 0) {
    signals.push({
      name: 'UPX',
      evidence: `UPX-style section names: ${upxSections.join(', ')}`,
      severity: 'medium',
    });
  }
  if (suspiciousNamed.length > 0) {
    signals.push({
      name: 'suspicious_section_name',
      evidence: `known packer section names: ${suspiciousNamed.join(', ')}`,
      severity: 'medium',
    });
  }
  if (highEntropySections.length > 0) {
    signals.push({
      name: 'high_entropy_sections',
      evidence: `entropy ≥ ${HIGH_ENTROPY_THRESHOLD.toFixed(1)}: ${highEntropySections.join(', ')}`,
      severity: 'high',
    });
  }

  // ── Import directory walk (DLL names, cap 64) ──
  const importsSummary: string[] = [];
  if (importRva === 0) {
    notes.push('no import directory (zero imports)');
  } else {
    const descStart = rvaToOffset(importRva, rawSections);
    if (descStart === null) {
      notes.push(`import directory RVA 0x${importRva.toString(16)} does not map to any section`);
    } else {
      for (let i = 0; i < 1024 && importsSummary.length < 64; i++) {
        const desc = descStart + i * 20;
        if (desc + 20 > len) break;
        const originalFirstThunk = dv.getUint32(desc, true);
        const nameRva = dv.getUint32(desc + 12, true);
        if (originalFirstThunk === 0 && nameRva === 0) break; // terminator
        const nameOff = rvaToOffset(nameRva, rawSections);
        if (nameOff === null) {
          notes.push(`import descriptor ${i}: DLL name RVA 0x${nameRva.toString(16)} unmappable`);
          break;
        }
        const dll = asciiZ(bytes, nameOff, 256).trim();
        if (dll) importsSummary.push(dll);
      }
    }
  }

  if (importsSummary.length < 10) {
    signals.push({
      name: 'few_imports',
      evidence: `${importsSummary.length} imported DLL(s) (< 10)`,
      severity: importsSummary.length <= 1 ? 'medium' : 'low',
    });
  }
  const hasKernel32 = importsSummary.some((d) => /kernel32\.dll$/i.test(d));
  if (importsSummary.length > 0 && !hasKernel32) {
    signals.push({
      name: 'low_imports_no_kernel32',
      evidence: `imports present (${importsSummary.slice(0, 4).join(', ')}${importsSummary.length > 4 ? ', …' : ''}) but kernel32.dll absent`,
      severity: 'high',
    });
  }

  // ── Overlay (bytes after the last raw section) ──
  let lastRawEnd = 0;
  for (const s of rawSections) lastRawEnd = Math.max(lastRawEnd, s.rawPtr + s.rawSize);
  const overlayOffset = lastRawEnd > 0 && lastRawEnd < len ? lastRawEnd : undefined;
  const overlaySize = overlayOffset !== undefined ? len - overlayOffset : undefined;
  if (overlayOffset !== undefined && overlaySize !== undefined) {
    let note = `overlay present: ${overlaySize} bytes at offset 0x${overlayOffset.toString(16)}`;
    if (overlaySize > OVERLAY_ENTROPY_MIN_BYTES) {
      const overlayEntropy = computeEntropy(bytes.subarray(overlayOffset, len));
      note += `, entropy ${overlayEntropy.toFixed(2)}`;
      if (overlayEntropy >= HIGH_ENTROPY_THRESHOLD) {
        signals.push({
          name: 'overlay_high_entropy',
          evidence: `overlay entropy ${overlayEntropy.toFixed(2)} ≥ ${HIGH_ENTROPY_THRESHOLD.toFixed(1)} (${overlaySize} bytes)`,
          severity: 'medium',
        });
      }
    }
    notes.push(note);
  }

  const pe: PeInfo = {
    machine,
    timestamp,
    subsystem,
    isDLL: (coffCharacteristics & 0x2000) !== 0,
    isDriver: subsystem === 1,
    sections: sectionsOut,
    hasDigitalSignature,
  };
  if (importsSummary.length > 0) pe.importsSummary = importsSummary;
  if (overlayOffset !== undefined && overlaySize !== undefined) {
    pe.overlayOffset = overlayOffset;
    pe.overlaySize = overlaySize;
  }

  return { pe, signals, notes, perSection };
}

// ─── Embedded PE scan ─────────────────────────────────────────────────────

function scanEmbeddedPes(bytes: Uint8Array, dv: DataView, len: number): EmbeddedArtifact[] {
  const artifacts: EmbeddedArtifact[] = [];
  const scanLimit = Math.min(len, MAX_TRIAGE_BYTES);
  if (scanLimit < 0x200 + 0x40 + 4) return artifacts;
  for (let off = 0x200; off <= scanLimit - 2; off++) {
    const b0 = bytes[off];
    const b1 = off + 1 < len ? bytes[off + 1] : undefined;
    if (b0 !== 0x4d || b1 !== 0x5a) continue;
    // e_lfanew sanity + PE\0\0 verification (little-endian sig constant)
    const lfanew = u32le(dv, off + 0x3c);
    const sigAbs = off + lfanew;
    if (lfanew < 0x40 || sigAbs + 4 > len || dv.getUint32(sigAbs, true) !== 0x00004550) continue;
    artifacts.push({
      kind: 'embedded_pe',
      offset: off,
      note: `embedded MZ/PE image at 0x${off.toString(16)} (e_lfanew 0x${lfanew.toString(16)}, PE signature verified)`,
    });
    if (artifacts.length >= EMBEDDED_PE_MAX_HITS) {
      break;
    }
  }
  return artifacts;
}

// ─── ZIP central directory ────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  size: number;
  localHeaderOffset: number;
}

function parseZipCentralDirectory(bytes: Uint8Array, dv: DataView, len: number): { entries: ZipEntry[] } | null {
  // Locate EOCD (0x06054b50) scanning backwards: comment ≤ 65 535 + fixed 22.
  const lowest = Math.max(0, len - (22 + 65535));
  let eocd = -1;
  for (let i = len - 22; i >= lowest; i--) {
    // EOCD sig 'PK\x05\x06' stored little-endian == 0x06054b50
    if (u32le(dv, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const totalEntries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (cdOffset >= len) return null;

  const entries: ZipEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > len || u32le(dv, pos) !== 0x02014b50) break;
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const uncompressedSize = dv.getUint32(pos + 24, true);
    const localHeaderOffset = dv.getUint32(pos + 42, true);
    const name = asciiZ(bytes, pos + 46, nameLen);
    entries.push({ name, size: uncompressedSize, localHeaderOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { entries };
}

// ─── Script indicators ────────────────────────────────────────────────────

function detectScriptIndicators(text: string): ScriptIndicators {
  const lower = text.toLowerCase();
  const macroMarkers: string[] = [];
  for (const marker of ['AutoOpen', 'Document_Open']) {
    if (lower.includes(marker.toLowerCase())) macroMarkers.push(marker);
  }
  return {
    powershellEnc: lower.includes('-enc'),
    powershellHidden: /-(?:w|window|windowstyle)\s+"?'?(?:hidden|h)(?![a-z])/i.test(lower),
    iex: /\biex\b|invoke-expression/.test(lower),
    downloadString: lower.includes('downloadstring'),
    cmdC: /\bcmd(?:\.exe)?["']?\s+\/c\b/.test(lower),
    certutil: /\bcertutil\b/.test(lower),
    rundll32: /\brundll32\b/.test(lower),
    regsvr32: /\bregsvr32\b/.test(lower),
    longBase64: /[A-Za-z0-9+/]{513,}={0,2}/.test(text),
    macroMarkers,
  };
}

/** Decode the full buffer as a latin-1 string (safe for indicator scans). */
function toLatin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    out += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
  }
  return out;
}

// ─── Core entry point ─────────────────────────────────────────────────────

/**
 * Triage raw bytes statically: identify format, hash, profile entropy, and
 * surface PE/archive/script heuristics. Throws Error('too large') for inputs
 * above MAX_TRIAGE_BYTES — routes map that onto a 400.
 */
export async function triageBytes(bytes: Uint8Array, nameHint?: string): Promise<StaticTriageResult> {
  if (bytes.byteLength > MAX_TRIAGE_BYTES) throw new Error('too large');

  const len = bytes.byteLength;
  const notes: string[] = [];
  const packerSignals: PackerSignal[] = [];
  const embeddedArtifacts: EmbeddedArtifact[] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Hashes: SHA-256/SHA-1 via WebCrypto, MD5 via the embedded implementation.
  const [sha256, sha1] = await Promise.all([digestHex('SHA-256', bytes), digestHex('SHA-1', bytes)]);
  const md5 = md5Hex(bytes);
  notes.push('md5 computed via embedded pure-JS implementation (WebCrypto exposes no MD5)');

  // Format identification.
  const sniff = sniffMagic(dv, bytes, len);
  let family = sniff.family;
  let detail = sniff.detail;

  if (sniff.mzInvalidPe) {
    notes.push(
      `MZ header present but PE signature invalid (e_lfanew 0x${(sniff.lfanew ?? 0).toString(16)}) — treating as unknown`
    );
  }
  if (sniff.oleCdf) {
    embeddedArtifacts.push({
      kind: 'ole_cdf',
      offset: 0,
      note: 'OLE compound document magic (D0 CF 11 E0) — legacy Office/container format',
    });
  }

  // Entropy profile.
  const overall = computeEntropy(bytes);
  if (overall >= OVERALL_ENTROPY_NOTE_THRESHOLD) {
    notes.push(`overall entropy ${overall.toFixed(2)} is high — packed, compressed, or encrypted content likely`);
  }

  // Family-specific deep parsing.
  let pe: PeInfo | undefined;
  let perSection: Array<{ name: string; entropy: number }> | undefined;
  let zipMembers: Array<{ name: string; size: number }> | undefined;
  let scriptIndicators: ScriptIndicators | undefined;

  if (family === 'pe' && sniff.lfanew !== undefined) {
    const parsed = parsePe(bytes, dv, len, sniff.lfanew);
    if (parsed) {
      pe = parsed.pe;
      packerSignals.push(...parsed.signals);
      notes.push(...parsed.notes);
      perSection = parsed.perSection;
    } else {
      notes.push('PE structure parse failed — see preceding notes');
    }
  }

  if (family === 'zip') {
    const cd = parseZipCentralDirectory(bytes, dv, len);
    if (!cd) {
      notes.push('ZIP end-of-central-directory record not found — archive truncated or corrupt');
    } else {
      zipMembers = cd.entries.map((e) => ({ name: e.name, size: e.size }));
      const hasContentTypes = cd.entries.some((e) => e.name === '[Content_Types].xml');
      if (hasContentTypes) {
        // An OPC manifest member promotes a plain zip to OOXML.
        family = 'ooxml';
        detail = 'opc package ([Content_Types].xml present)';
      }
      for (const entry of cd.entries) {
        if (entry.name.toLowerCase().endsWith('.zip')) {
          embeddedArtifacts.push({
            kind: 'nested_zip',
            offset: entry.localHeaderOffset,
            note: `central-directory member '${entry.name}' looks like a nested zip archive (${entry.size} bytes uncompressed)`,
          });
        }
      }
    }
  }

  if (family === 'script') {
    scriptIndicators = detectScriptIndicators(toLatin1(bytes));
    if (nameHint) {
      const dot = nameHint.lastIndexOf('.');
      const ext = dot >= 0 ? nameHint.slice(dot + 1).toLowerCase() : '';
      const hintDetail = SCRIPT_EXT_DETAIL[ext];
      if (hintDetail) detail = detail ? `${detail}; ${hintDetail}` : hintDetail;
    }
  }

  // Embedded PE scan runs for every family (appended droppers, self-extractors).
  const embedded = scanEmbeddedPes(bytes, dv, len);
  embeddedArtifacts.push(...embedded);
  if (embedded.length > 0) {
    notes.push(`embedded PE scan: ${embedded.length} candidate(s) verified beyond offset 0x200`);
  }

  // Extension hint cross-check for unrecognized formats.
  if (family === 'unknown' && !sniff.oleCdf && nameHint && nameHint.includes('.')) {
    const ext = nameHint.slice(nameHint.lastIndexOf('.') + 1).toLowerCase();
    notes.push(`magic unrecognized; filename extension hint '${ext}'`);
  }

  const result: StaticTriageResult = {
    fileSize: len,
    fileType: detail ? { family, detail } : { family },
    mimeHint: MIME_BY_FAMILY[family],
    sha256,
    sha1,
    entropy: perSection ? { overall, perSection } : { overall },
    packerSignals,
    embeddedArtifacts,
    notes,
  };
  if (md5) result.md5 = md5;
  if (pe) result.pe = pe;
  if (scriptIndicators) result.scriptIndicators = scriptIndicators;
  if (zipMembers) result.zipMembers = zipMembers;
  return result;
}
