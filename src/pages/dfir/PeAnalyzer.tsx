import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Binary, Upload, Loader2 } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { fileTooLarge, yieldToPaint } from '../../lib/dfir/file-guard';

const MACHINE: Record<number, string> = {
  0x14c: 'x86 (i386)',
  0x8664: 'x64 (AMD64)',
  0x1c0: 'ARM',
  0xaa64: 'ARM64',
  0x1c4: 'ARMNT',
  0x200: 'IA64',
};
const SUBSYS: Record<number, string> = {
  1: 'Native',
  2: 'Windows GUI',
  3: 'Windows CUI (console)',
  5: 'OS/2 CUI',
  7: 'POSIX CUI',
  9: 'Windows CE GUI',
  10: 'EFI application',
};
const SUSPECT =
  /^(VirtualAlloc|VirtualProtect|WriteProcessMemory|ReadProcessMemory|CreateRemoteThread|NtCreateThreadEx|LoadLibrary|GetProcAddress|WinExec|ShellExecute|CreateProcess|OpenProcess|SetWindowsHookEx|RegSetValue|InternetOpen|URLDownloadToFile|CryptEncrypt|IsDebuggerPresent|CheckRemoteDebuggerPresent|VirtualAllocEx|ResumeThread|QueueUserAPC)/i;

function entropy(u8: Uint8Array, start: number, len: number): number {
  if (len <= 0) return 0;
  const freq = new Array(256).fill(0);
  const end = Math.min(start + len, u8.length);
  for (let i = start; i < end; i++) freq[u8[i]!]++;
  const n = end - start;
  let h = 0;
  for (const f of freq) if (f) h -= (f / n) * Math.log2(f / n);
  return Math.round(h * 100) / 100;
}

interface PE {
  machine: string;
  magic: string;
  timestamp: string;
  subsystem: string;
  entry: string;
  imageBase: string;
  flags: string[];
  sections: Array<{ name: string; vsize: number; rsize: number; entropy: number; flags: string }>;
  imports: Array<{ dll: string; fns: string[] }>;
}

function parsePE(buf: ArrayBuffer): PE {
  const d = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (d.getUint16(0, true) !== 0x5a4d) throw new Error('not a PE/MZ file');
  const e = d.getUint32(0x3c, true);
  if (d.getUint32(e, false) !== 0x50450000) throw new Error('bad PE signature');
  const coff = e + 4;
  const machine = MACHINE[d.getUint16(coff, true)] ?? `0x${d.getUint16(coff, true).toString(16)}`;
  const nSec = d.getUint16(coff + 2, true);
  const ts = d.getUint32(coff + 4, true);
  const optSize = d.getUint16(coff + 16, true);
  const opt = coff + 20;
  const magicW = d.getUint16(opt, true);
  const pe32plus = magicW === 0x20b;
  const magic = pe32plus ? 'PE32+ (64-bit)' : magicW === 0x10b ? 'PE32 (32-bit)' : `0x${magicW.toString(16)}`;
  const entry = '0x' + d.getUint32(opt + 16, true).toString(16);
  const imageBase = pe32plus
    ? '0x' + (d.getUint32(opt + 24, true) + d.getUint32(opt + 28, true) * 2 ** 32).toString(16)
    : '0x' + d.getUint32(opt + 28, true).toString(16);
  const subsystem = SUBSYS[d.getUint16(opt + (pe32plus ? 68 : 68), true)] ?? 'unknown';
  const dllChar = d.getUint16(opt + 70, true);
  const flags: string[] = [];
  if (dllChar & 0x0040) flags.push('ASLR');
  if (dllChar & 0x0100) flags.push('DEP/NX');
  if (dllChar & 0x4000) flags.push('Control Flow Guard');
  if (dllChar & 0x0400) flags.push('No SEH');
  if (!(dllChar & 0x0040)) flags.push('! no ASLR');

  // Data directory [1] = import table (RVA, size). Offset: opt + 96 (PE32) / 112 (PE32+); entry 1 → +8.
  const ddBase = opt + (pe32plus ? 112 : 96);
  const impRva = d.getUint32(ddBase + 8, true);

  // Section headers follow the optional header.
  const secBase = opt + optSize;
  const sections: PE['sections'] = [];
  const secMeta: Array<{ va: number; vs: number; praw: number; sraw: number }> = [];
  for (let i = 0; i < nSec && i < 64; i++) {
    const s = secBase + i * 40;
    const name = String.fromCharCode(...u8.subarray(s, s + 8)).replace(/\0+$/, '');
    const vs = d.getUint32(s + 8, true);
    const va = d.getUint32(s + 12, true);
    const sraw = d.getUint32(s + 16, true);
    const praw = d.getUint32(s + 20, true);
    const ch = d.getUint32(s + 36, true);
    const fl = [
      ch & 0x20000000 ? 'X' : '',
      ch & 0x40000000 ? 'R' : '',
      ch & 0x80000000 ? 'W' : '',
      ch & 0x00000020 ? 'code' : '',
      ch & 0x00000040 ? 'data' : '',
    ]
      .filter(Boolean)
      .join(' ');
    sections.push({ name, vsize: vs, rsize: sraw, entropy: entropy(u8, praw, sraw), flags: fl });
    secMeta.push({ va, vs, praw, sraw });
  }
  const rva2off = (rva: number) => {
    for (const s of secMeta) if (rva >= s.va && rva < s.va + Math.max(s.vs, s.sraw)) return s.praw + (rva - s.va);
    return -1;
  };
  const cstr = (o: number) => {
    let r = '';
    for (let i = o; i < u8.length && u8[i] && r.length < 96; i++) r += String.fromCharCode(u8[i]!);
    return r;
  };

  const imports: PE['imports'] = [];
  const io = rva2off(impRva);
  if (io > 0) {
    for (let k = 0; k < 256; k++) {
      const desc = io + k * 20;
      if (desc + 20 > u8.length) break;
      const oft = d.getUint32(desc, true);
      const nameRva = d.getUint32(desc + 12, true);
      const firstThunk = d.getUint32(desc + 16, true);
      if (oft === 0 && nameRva === 0 && firstThunk === 0) break;
      const dll = nameRva ? cstr(rva2off(nameRva)) : '(unknown)';
      const fns: string[] = [];
      const t = rva2off(oft || firstThunk);
      if (t > 0) {
        for (let j = 0; j < 4096; j++) {
          const val = pe32plus
            ? d.getUint32(t + j * 8, true) + d.getUint32(t + j * 8 + 4, true) * 2 ** 32
            : d.getUint32(t + j * 4, true);
          if (!val) break;
          const ordinalBit = pe32plus ? 0x8000000000000000 : 0x80000000;
          if (val >= ordinalBit) fns.push(`#ordinal ${val & 0xffff}`);
          else {
            const no = rva2off(Number(val));
            if (no > 0) fns.push(cstr(no + 2));
          }
          if (fns.length > 400) break;
        }
      }
      imports.push({ dll, fns });
      if (imports.length > 64) break;
    }
  }

  return {
    machine,
    magic,
    timestamp: ts ? new Date(ts * 1000).toISOString() : 'n/a',
    subsystem,
    entry,
    imageBase,
    flags,
    sections,
    imports,
  };
}

export default function PeAnalyzer(): JSX.Element {
  const [pe, setPe] = useState<PE | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir">back</BackLink>
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Binary size={22} className="text-brand-600 dark:text-brand-400" />
        PE Static Analyzer <span className="text-sm font-mono text-slate-500">Lite</span>
      </h1>
      <p className="text-sm font-mono text-muted mt-1 mb-6">
        Drop a Windows <code>.exe</code>/<code>.dll</code> — parses headers, mitigations, sections (with entropy for a
        packed-binary signal) and the import table (suspicious APIs flagged). Hand-rolled parser; nothing is uploaded.
      </p>

      <button
        type="button"
        onClick={() => document.getElementById('peanalyzer-input')?.click()}
        className="w-full border-2 border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl p-8 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
        aria-label="Drop a PE file file or click to choose"
      >
        <Upload size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
          Drop a PE file file here, or click to choose
        </p>
        <p className="text-mini font-mono text-slate-400 mt-1">100% client-side. No upload.</p>
      </button>
      <input
        id="peanalyzer-input"
        type="file"
        accept=".exe,.dll"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const tooBig = fileTooLarge(f.size);
          if (tooBig) {
            setPe(null);
            setErr(tooBig);
            return;
          }
          setErr('');
          setBusy(true);
          try {
            await yieldToPaint();
            setPe(parsePE(await f.arrayBuffer()));
          } catch (ex) {
            console.error('handler failed:', ex instanceof Error ? ex.message : String(ex));
            setPe(null);
            setErr(ex instanceof Error ? ex.message : String(ex));
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && (
        <p className="mt-4 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> parsing…
        </p>
      )}
      {err && <p className="mt-4 font-mono text-sm text-rose-600 dark:text-rose-400">{err}</p>}

      {pe && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['Machine', pe.machine],
              ['Format', pe.magic],
              ['Compiled', pe.timestamp],
              ['Subsystem', pe.subsystem],
              ['Entry point', pe.entry],
              ['Image base', pe.imageBase],
            ].map(([k, v]) => (
              <div key={k} className="surface-card p-3">
                <div className="text-micro font-mono uppercase tracking-wider text-slate-500">{k}</div>
                <div className="font-mono text-meta break-all">{v}</div>
              </div>
            ))}
          </div>
          <div className="font-mono text-mini text-muted">mitigations: {pe.flags.join(' · ') || 'none detected'}</div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-auto">
            <table className="w-full text-mini font-mono">
              <thead className="bg-slate-50 dark:bg-[rgb(var(--surface-200))]">
                <tr>
                  {['Section', 'VirtualSize', 'RawSize', 'Entropy', 'Flags'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-left px-2 py-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pe.sections.map((s, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {s.name}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {s.vsize}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {s.rsize}
                    </td>
                    <td
                      className={`px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))] ${s.entropy >= 7.2 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}
                    >
                      {s.entropy}
                      {s.entropy >= 7.2 ? ' !packed?' : ''}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {s.flags}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pe.imports.map((im) => (
            <div key={im.dll} className="surface-card p-3">
              <div className="font-mono text-meta text-slate-900 dark:text-slate-100 mb-1">
                {im.dll} <span className="text-slate-500">· {im.fns.length} imports</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {im.fns.slice(0, 200).map((fn, i) => (
                  <span
                    key={i}
                    className={`font-mono text-micro px-1 py-0.5 rounded border ${SUSPECT.test(fn) ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-muted'}`}
                  >
                    {fn}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
