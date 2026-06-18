import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Smartphone, Upload } from 'lucide-react';
import { loadSql } from '../../lib/loadSql';
import { fileTooLarge } from '../../lib/dfir/file-guard';
import { useDebounce } from '../../hooks/useDebounce';

interface FileRow {
  domain: string;
  path: string;
  fileID: string;
  flags: number;
}

export default function IosBackupExplorer(): JSX.Element {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [domains, setDomains] = useState<Array<[string, number]>>([]);
  const [q, setQ] = useState('');
  // The input stays bound to `q` for instant feedback; the 20k-row filter
  // below only runs ~120ms after typing settles, off the debounced value.
  const debouncedQ = useDebounce(q, 120);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function open(file: File) {
    setBusy(true);
    setErr('');
    const tooBig = fileTooLarge(file.size);
    if (tooBig) {
      setErr(tooBig);
      setBusy(false);
      return;
    }
    let db: { close?: () => void } | null = null;
    try {
      const SQL = await loadSql();
      const d = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      db = d;
      // Manifest.db: Files(fileID, domain, relativePath, flags, file)
      const res = d.exec('SELECT domain, relativePath, fileID, flags FROM Files ORDER BY domain LIMIT 20000');
      if (res.length === 0) throw new Error('No Files table — is this an iOS Manifest.db?');
      const rows: FileRow[] = res[0]!.values.map((r: unknown[]) => ({
        domain: String(r[0] ?? ''),
        path: String(r[1] ?? ''),
        fileID: String(r[2] ?? ''),
        flags: Number(r[3] ?? 0),
      }));
      const dc = new Map<string, number>();
      for (const f of rows) dc.set(f.domain, (dc.get(f.domain) ?? 0) + 1);
      setFiles(rows);
      setDomains([...dc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setFiles(null);
    } finally {
      // Free the WASM-backed handle — rows/domains are already materialized
      // into plain JS, so the sql.js Database is no longer needed.
      db?.close?.();
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    if (!files) return [];
    const t = debouncedQ.trim().toLowerCase();
    return (t ? files.filter((f) => `${f.domain} ${f.path}`.toLowerCase().includes(t)) : files).slice(0, 1000);
  }, [files, debouncedQ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Smartphone size={22} className="text-brand-600 dark:text-brand-400" />
        iOS Backup Explorer
      </h1>
      <p className="text-sm font-mono text-muted mt-1 mb-6">
        Drop an iOS backup <code>Manifest.db</code> — enumerates the backed-up file inventory by domain and path (Files
        table). sql.js runs as a lazy WASM chunk; nothing is uploaded.
      </p>

      <button
        type="button"
        onClick={() => document.getElementById('iosbackup-input')?.click()}
        className="w-full border-2 border-dashed border-slate-300 dark:border-[#1e2030] rounded-lg p-8 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
        aria-label="Drop a Manifest.db file or click to choose"
      >
        <Upload size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
          {busy ? 'Loading...' : 'Drop Manifest.db here, or click to choose'}
        </p>
        <p className="text-mini font-mono text-slate-500 mt-1">iOS backup SQLite database. 100% client-side.</p>
      </button>
      <input
        id="iosbackup-input"
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void open(f);
        }}
      />
      {err && <p className="mt-3 font-mono text-sm text-rose-600 dark:text-rose-400">{err}</p>}

      {files && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-3">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">
              Top domains · {files.length.toLocaleString()} files total
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domains.map(([dn, c]) => (
                <button
                  key={dn}
                  type="button"
                  onClick={() => setQ(dn)}
                  className="font-mono text-mini px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#1e2030] text-slate-700 dark:text-slate-300 hover:border-brand-500/40"
                >
                  {dn || '(none)'} · {c}
                </button>
              ))}
            </div>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter by domain / path — e.g. CameraRollDomain, sms.db, WhatsApp…"
            className="w-full rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] overflow-auto max-h-[60vh]">
            <table className="w-full text-mini font-mono">
              <thead className="bg-slate-50 dark:bg-[#12121a] sticky top-0">
                <tr>
                  {['domain', 'relativePath', 'fileID'].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="text-left px-2 py-1 border-b border-slate-200 dark:border-[#1e2030]"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((f, i) => (
                  <tr key={i} className="even:bg-slate-50/50 dark:even:bg-slate-900/50">
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[#1e2030]">{f.domain}</td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[#1e2030] break-all">{f.path}</td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[#1e2030] text-slate-500">
                      {f.fileID.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-mini text-slate-500">showing {shown.length} (filtered, capped 1000)</p>
        </div>
      )}
    </div>
  );
}
