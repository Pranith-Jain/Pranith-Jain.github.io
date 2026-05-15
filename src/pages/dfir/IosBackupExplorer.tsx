import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { loadSql } from '../../lib/loadSql';

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function open(file: File) {
    setBusy(true);
    setErr('');
    try {
      const SQL = await loadSql();
      const d = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      // Manifest.db: Files(fileID, domain, relativePath, flags, file)
      const res = d.exec('SELECT domain, relativePath, fileID, flags FROM Files ORDER BY domain LIMIT 20000');
      if (res.length === 0) throw new Error('No Files table — is this an iOS Manifest.db?');
      const rows: FileRow[] = res[0]!.values.map((r) => ({
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
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    if (!files) return [];
    const t = q.trim().toLowerCase();
    return (t ? files.filter((f) => `${f.domain} ${f.path}`.toLowerCase().includes(t)) : files).slice(0, 1000);
  }, [files, q]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Smartphone size={22} className="text-brand-600 dark:text-brand-400" />
        iOS Backup Explorer
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Drop an iOS backup <code>Manifest.db</code> — enumerates the backed-up file inventory by domain and path (Files
        table). sql.js runs as a lazy WASM chunk; nothing is uploaded.
      </p>

      <label className="inline-block px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 cursor-pointer font-mono text-[12px]">
        {busy ? 'loading…' : 'Choose Manifest.db…'}
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void open(f);
          }}
        />
      </label>
      {err && <p className="mt-3 font-mono text-sm text-rose-600 dark:text-rose-400">{err}</p>}

      {files && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
              Top domains · {files.length.toLocaleString()} files total
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domains.map(([dn, c]) => (
                <button
                  key={dn}
                  type="button"
                  onClick={() => setQ(dn)}
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-brand-500/40"
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
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-auto max-h-[60vh]">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                <tr>
                  {['domain', 'relativePath', 'fileID'].map((c) => (
                    <th key={c} className="text-left px-2 py-1 border-b border-slate-200 dark:border-slate-800">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((f, i) => (
                  <tr key={i} className="even:bg-slate-50/50 dark:even:bg-slate-900/50">
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800">{f.domain}</td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800 break-all">{f.path}</td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                      {f.fileID.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-[11px] text-slate-500">showing {shown.length} (filtered, capped 1000)</p>
        </div>
      )}
    </div>
  );
}
