import { useCallback, useMemo, useRef, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Upload, Search, Copy, Check, ChevronLeft, ChevronRight, Binary } from 'lucide-react';

/**
 * Hex Workbench — browser-side hex viewer for artifact triage (Fleet-parity).
 * Files never leave the browser: drop a sample, inspect bytes, search hex/ASCII,
 * jump to offsets. Magic-byte family detection + entropy run locally.
 */

const ROW_BYTES = 16;
const MAX_FILE = 16 * 1024 * 1024; // 16MB — keep rendering bounded

function formatHex(n: number, pad = 8): string {
  return n.toString(16).toUpperCase().padStart(pad, '0');
}

function shannonEntropy(bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const freq = new Array<number>(256).fill(0);
  for (const b of bytes) freq[b] = (freq[b] ?? 0) + 1;
  let h = 0;
  for (const c of freq) {
    if (c === 0) continue;
    const p = c / bytes.length;
    h -= p * Math.log2(p);
  }
  return h;
}

interface FamilyGuess {
  family: string;
  detail: string;
}

function sniffFamily(b: Uint8Array): FamilyGuess | null {
  const ascii = (start: number, s: string) => [...s].every((ch, i) => b[start + i] === ch.charCodeAt(0));
  if (b[0] === 0x4d && b[1] === 0x5a)
    return { family: 'PE / DOS', detail: 'MZ header (Windows executable or embedded PE)' };
  if (b[0] === 0x7f && ascii(1, 'ELF')) return { family: 'ELF', detail: 'Linux/Unix executable' };
  if (
    (b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa && b[3] === 0xce) ||
    (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe)
  )
    return { family: 'Mach-O', detail: 'macOS binary' };
  if (ascii(0, '%PDF'))
    return { family: 'PDF', detail: 'PDF document — check for /JavaScript, /OpenAction, /EmbeddedFile' };
  if (b[0] === 0x50 && b[1] === 0x4b) {
    // Peek central-directory hints is overkill client-side; flag OOXML vs zip generically
    return { family: 'ZIP-based', detail: 'PK archive (zip / docx / xlsx / jar / apk)' };
  }
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)
    return { family: 'OLE / CDF', detail: 'Legacy Office compound file — VBA macros live here' };
  if (ascii(0, '{\\rtf')) return { family: 'RTF', detail: 'RTF document — watch \\objdata embeds' };
  if (b[0] === 0xd4 && b[1] === 0xc3 && b[2] === 0xb2 && b[3] === 0xa1)
    return { family: 'PCAP', detail: 'packet capture (little-endian)' };
  if (b[0] === 0xa1 && b[1] === 0xb2 && b[2] === 0xc3 && b[3] === 0xd4)
    return { family: 'PCAP', detail: 'packet capture (big-endian)' };
  if (b[0] === 0x0a && b[1] === 0x0d && b[2] === 0x0d && b[3] === 0x0a)
    return { family: 'PCAPng', detail: 'next-gen packet capture' };
  if (b[0] === 0x1f && b[1] === 0x8b) return { family: 'GZip', detail: 'gzip stream' };
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf)
    return { family: '7-Zip', detail: '7z archive' };
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return { family: 'RAR', detail: 'RAR archive' };
  if (ascii(0, '<!DOCTYPE') || ascii(0, '<html'))
    return { family: 'HTML', detail: 'markup — check script/iframe injections' };
  return null;
}

/** Find all occurrences of a hex-string pattern (wildcards via '?'). */
function findPattern(data: Uint8Array, pattern: string): number[] {
  const clean = pattern.replace(/[\s,]+/g, '').toLowerCase();
  if (!clean || clean.length % 2 !== 0) return [];
  const pat: Array<number | null> = [];
  for (let i = 0; i < clean.length; i += 2) {
    const byte = clean.slice(i, i + 2);
    pat.push(byte === '??' ? null : parseInt(byte, 16));
    const lastPat = pat[pat.length - 1];
    if (typeof lastPat === 'number' && Number.isNaN(lastPat)) return [];
  }
  const hits: number[] = [];
  outer: for (let i = 0; i <= data.length - pat.length; i++) {
    for (let j = 0; j < pat.length; j++) {
      const want = pat[j];
      if (want !== null && data[i + j] !== want) continue outer;
    }
    hits.push(i);
    if (hits.length >= 500) break; // bound the hit list
  }
  return hits;
}

function findAscii(data: Uint8Array, needle: string): number[] {
  if (!needle) return [];
  const lowerData = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) lowerData[i] = data[i]! < 128 ? data[i]! : 32;
  const lowerNeedle = needle.toLowerCase();
  const hits: number[] = [];
  const limit = data.length - lowerNeedle.length;
  for (let i = 0; i <= limit && hits.length < 500; i++) {
    let match = true;
    for (let j = 0; j < lowerNeedle.length; j++) {
      const ch = String.fromCharCode(lowerData[i + j]!).toLowerCase();
      if (ch !== lowerNeedle[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

export default function HexWorkbench() {
  const [data, setData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<number[]>([]);
  const [hitIndex, setHitIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    setError('');
    if (file.size > MAX_FILE) {
      setError(`file too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 16MB browser cap)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setData(new Uint8Array(reader.result as ArrayBuffer));
      setFileName(file.name);
      setOffset(0);
      setHits([]);
      setHitIndex(-1);
      setQuery('');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const rows: Array<{ off: number; hex: string[]; ascii: string }> = [];
    const end = Math.min(data.length, offset + 4096);
    for (let o = offset; o < end && rows.length < 256; o += ROW_BYTES) {
      const slice = data.subarray(o, Math.min(o + ROW_BYTES, end));
      const hex: string[] = [];
      const ascChars: string[] = [];
      for (const byte of slice) {
        hex.push(byte.toString(16).padStart(2, '0'));
        ascChars.push(byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.');
      }
      rows.push({ off: o, hex, ascii: ascChars.join('') });
    }
    return rows;
  }, [data, offset]);

  const family = useMemo(() => (data ? sniffFamily(data.subarray(0, 64)) : null), [data]);
  const entropy = useMemo(
    () => (data ? shannonEntropy(data.subarray(0, Math.min(data.length, 1024 * 1024))) : 0),
    [data]
  );

  const doSearch = () => {
    if (!data || !query.trim()) return;
    const isHex = /^(?:[0-9a-fA-F]{2}|\?\?)+$/.test(query.replace(/[\s,]+/g, ''));
    const found = isHex ? findPattern(data, query) : findAscii(data, query);
    setHits(found);
    setHitIndex(found.length ? 0 : -1);
    if (found.length && found[0] !== undefined) setOffset(Math.max(0, found[0] - 0x20));
  };

  const gotoHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (hitIndex + dir + hits.length) % hits.length;
    setHitIndex(next);
    const at = hits[next];
    if (at !== undefined) setOffset(Math.max(0, at - 0x20));
  };

  const copyVisible = async () => {
    if (!visibleRows.length) return;
    const text = visibleRows.map((r) => `${formatHex(r.off)}  ${r.hex.join(' ').padEnd(47)}  |${r.ascii}|`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stringsSample = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    let cur = '';
    for (let i = 0; i < Math.min(data.length, 1024 * 1024); i++) {
      const b = data[i]!;
      if (b >= 0x20 && b < 0x7f) cur += String.fromCharCode(b);
      else {
        if (cur.length >= 6) out.push(cur);
        cur = '';
        if (out.length >= 50) break;
      }
    }
    if (cur.length >= 6 && out.length < 50) out.push(cur);
    return out;
  }, [data]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Binary />}
      title="Hex Workbench"
      description="Browser-side hex inspector — drop a sample, inspect bytes, search hex/ASCII patterns. Files never leave your machine."
    >
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-xl border-2 border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-6 mb-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
        onClick={() => fileInput.current?.click()}
      >
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
          }}
        />
        <Upload className="mx-auto mb-2 text-slate-400" size={28} />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Drop a sample here (any file ≤ 16 MB) — parsed locally, zero upload
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">File</div>
              <div className="font-mono text-sm truncate" title={fileName}>
                {fileName}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Size</div>
              <div className="font-mono text-sm">{data.length.toLocaleString()} B</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Family</div>
              <div className="text-sm font-semibold">{family ? family.family : 'Unknown'}</div>
              {family && (
                <div className="text-xs text-slate-500 truncate" title={family.detail}>
                  {family.detail}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Entropy (≤1MB)</div>
              <div className={`font-mono text-sm ${entropy > 7.2 ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                {entropy.toFixed(2)} bits{entropy > 7.2 ? ' ⚠ packed?' : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center mb-3">
            <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5">
              <Search size={16} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                placeholder='hex ("4d5a" or "4d??5a") or ASCII ("psexec")'
                className="flex-1 bg-transparent outline-none font-mono text-sm"
              />
            </div>
            <button
              onClick={doSearch}
              className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm hover:bg-indigo-700"
            >
              Search
            </button>
            {hits.length > 0 && (
              <>
                <span className="text-sm text-slate-500">
                  {hits.length} hit{hits.length !== 1 ? 's' : ''}
                  {hitIndex >= 0 ? ` · #${hitIndex + 1}` : ''}
                </span>
                <button
                  onClick={() => gotoHit(-1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => gotoHit(1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <button
              onClick={copyVisible}
              className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy view
            </button>
          </div>

          {hits.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {hits.slice(0, 100).map((h, i) => (
                <button
                  key={`${h}-${i}`}
                  onClick={() => {
                    setHitIndex(i);
                    setOffset(Math.max(0, h - 0x20));
                  }}
                  className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                    i === hitIndex ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  0x{h.toString(16)}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
            <pre className="font-mono text-xs leading-5">
              {visibleRows.map((r) => {
                const hasHit = hits.some((h) => h >= r.off && h < r.off + ROW_BYTES);
                return (
                  <div key={r.off} className={hasHit ? 'bg-yellow-100 dark:bg-yellow-900/30 -mx-2 px-2' : ''}>
                    <span className="text-indigo-500 select-all">{formatHex(r.off)}</span>
                    {'  '}
                    {Array.from({ length: ROW_BYTES }, (_, i) => {
                      const abs = r.off + i;
                      const isHitByte =
                        hits.includes(abs) ||
                        (hitIndex >= 0 &&
                          abs >= hits[hitIndex]! &&
                          abs < hits[hitIndex]! + Math.max(1, query.replace(/[\s,]+/g, '').length / 2));
                      return (
                        <span
                          key={i}
                          className={isHitByte ? 'bg-yellow-400 dark:bg-yellow-600 rounded-sm' : i === 7 ? 'mr-2' : ''}
                        >
                          {r.hex[i] ?? '  '}
                          {i === 7 ? ' ' : ''}
                        </span>
                      );
                    })}
                    {' |'}
                    {r.ascii.split('').map((ch, i) => {
                      const abs = r.off + i;
                      const inHit =
                        hitIndex >= 0 &&
                        abs >= hits[hitIndex]! &&
                        abs < hits[hitIndex]! + Math.max(1, query.replace(/[\s,]+/g, '').length);
                      return (
                        <span
                          key={i}
                          className={
                            inHit
                              ? 'bg-yellow-400 dark:bg-yellow-600 text-black rounded-sm'
                              : ch === '.'
                                ? 'text-slate-300 dark:text-slate-700'
                                : ''
                          }
                        >
                          {ch}
                        </span>
                      );
                    })}
                    {'|'}
                  </div>
                );
              })}
            </pre>
          </div>

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setOffset(Math.max(0, offset - 4096))}
              disabled={offset === 0}
              className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ← Prev 4KB
            </button>
            <span className="font-mono text-sm text-slate-500">
              offset 0x{offset.toString(16).toUpperCase()} / 0x{data.length.toString(16).toUpperCase()}
            </span>
            <button
              onClick={() => setOffset(Math.min(Math.max(0, data.length - 1), offset + 4096))}
              disabled={offset + 4096 >= data.length}
              className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next 4KB →
            </button>
          </div>

          {stringsSample.length > 0 && (
            <details className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <summary className="cursor-pointer text-sm font-medium">Strings (first 50, ≥6 chars)</summary>
              <pre className="mt-2 font-mono text-xs whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                {stringsSample.join('\n')}
              </pre>
            </details>
          )}
        </>
      )}
    </DataPageLayout>
  );
}
