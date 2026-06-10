import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Upload } from 'lucide-react';
import { loadSql } from '../../lib/loadSql';

interface DB {
  tables: { name: string; sql: string; count: number }[];
  query: (sql: string) => { cols: string[]; rows: unknown[][] };
}

export default function SqliteExplorer(): JSX.Element {
  const [db, setDb] = useState<DB | null>(null);
  const [active, setActive] = useState('');
  const [result, setResult] = useState<{ cols: string[]; rows: unknown[][] } | null>(null);
  const [sqlText, setSqlText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function open(file: File) {
    setBusy(true);
    setErr('');
    try {
      const SQL = await loadSql();
      const raw = new Uint8Array(await file.arrayBuffer());
      const d = new SQL.Database(raw);
      const q = (sql: string) => {
        const res = d.exec(sql);
        if (res.length === 0) return { cols: [], rows: [] };
        return { cols: res[0]!.columns, rows: res[0]!.values as unknown[][] };
      };
      const t = d.exec(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      const tables = (t[0]?.values ?? []).map((r: unknown[]) => {
        const name = String(r[0]);
        let count = 0;
        try {
          count = Number(d.exec(`SELECT COUNT(*) FROM "${name}"`)[0]!.values[0]![0]);
        } catch {
          /* view / virtual */
        }
        return { name, sql: String(r[1] ?? ''), count };
      });
      setDb({ tables, query: q });
      setActive('');
      setResult(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setDb(null);
    } finally {
      setBusy(false);
    }
  }

  function showTable(name: string) {
    if (!db) return;
    setActive(name);
    try {
      setResult(db.query(`SELECT * FROM "${name}" LIMIT 300`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function runSql() {
    if (!db || !sqlText.trim()) return;
    try {
      setErr('');
      setResult(db.query(sqlText));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Database size={22} className="text-brand-600 dark:text-brand-400" />
        SQLite Artifact Explorer
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Open a SQLite DB (browser history, app artifact, <code>.sqlite</code>/<code>.db</code>) — inspect schema, browse
        rows, run read queries. sql.js runs as a lazy WASM chunk; the file never leaves your browser.
      </p>

      <button
        type="button"
        onClick={() => document.getElementById('sqlite-input')?.click()}
        className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
        aria-label="Drop a SQLite file or click to choose"
      >
        <Upload size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
          {busy ? 'Loading...' : 'Drop a SQLite file here, or click to choose'}
        </p>
        <p className="text-mini font-mono text-slate-500 mt-1">
          Browser history, app artifacts. 100% client-side via sql.js WASM.
        </p>
      </button>
      <input
        id="sqlite-input"
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void open(f);
        }}
      />
      {err && <p className="mt-3 font-mono text-sm text-rose-600 dark:text-rose-400">{err}</p>}

      {db && (
        <div className="mt-6 grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-3 max-h-[60vh] overflow-auto">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">
              Tables ({db.tables.length})
            </div>
            <ul className="space-y-0.5">
              {db.tables.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => showTable(t.name)}
                    className={`w-full text-left font-mono text-meta px-1.5 py-1 rounded ${active === t.name ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    {t.name} <span className="text-slate-500">· {t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <div className="flex gap-2 mb-3">
              <input
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                placeholder='SELECT * FROM "moz_places" LIMIT 50'
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 px-3 py-2 font-mono text-meta focus:border-brand-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={runSql}
                className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 font-mono text-meta"
              >
                Run
              </button>
            </div>
            {result && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-auto max-h-[60vh]">
                <table className="w-full text-mini font-mono">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr>
                      {result.cols.map((c) => (
                        <th
                          key={c}
                          scope="col"
                          className="text-left px-2 py-1 border-b border-slate-200 dark:border-slate-800"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className="even:bg-slate-50/50 dark:even:bg-slate-900/50">
                        {r.map((cell, j) => (
                          <td key={j} className="px-2 py-1 border-b border-slate-100 dark:border-slate-800 break-all">
                            {cell === null ? <span className="text-slate-500">NULL</span> : String(cell).slice(0, 300)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length === 0 && <p className="p-3 font-mono text-meta text-slate-500">0 rows.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
