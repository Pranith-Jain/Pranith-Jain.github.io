import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

/** Epoch bases. Windows FILETIME / WebKit count from 1601-01-01 UTC. */
const FILETIME_EPOCH_MS = -11644473600000; // 1601-01-01 relative to Unix epoch

interface Row {
  label: string;
  iso: string;
}

function rowsFor(raw: string): Row[] {
  const s = raw.trim().replace(/[, ]/g, '');
  if (!s) return [];
  const out: Row[] = [];
  const push = (label: string, ms: number) => {
    if (Number.isFinite(ms) && ms > -62135596800000 && ms < 253402300800000) {
      out.push({ label, iso: new Date(ms).toISOString() });
    }
  };

  // ISO 8601 / RFC parse first.
  const parsed = Date.parse(raw.trim());
  if (Number.isFinite(parsed)) push('Parsed as date string', parsed);

  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    push('Unix seconds', n * 1000);
    push('Unix milliseconds', n);
    push('Unix microseconds', n / 1000);
    // Windows FILETIME — 100ns ticks since 1601.
    push('Windows FILETIME (100ns since 1601)', n / 10000 + FILETIME_EPOCH_MS);
    // WebKit/Chrome — microseconds since 1601.
    push('WebKit / Chrome (µs since 1601)', n / 1000 + FILETIME_EPOCH_MS);
    // Apple Cocoa / Mac absolute time — seconds since 2001-01-01.
    push('Apple Cocoa (s since 2001)', (n + 978307200) * 1000);
  }
  return out;
}

export default function TimestampConverter(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('q') ?? '';
  const [val, setVal] = useState(initial);
  const rows = useMemo(() => rowsFor(val), [val]);
  const now = Date.now();

  // Sync input value to URL
  useEffect(() => {
    if (val) setSearchParams({ q: val }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [val, setSearchParams]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Clock size={22} className="text-brand-600 dark:text-brand-400" />
        Timestamp Converter
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Unix (s/ms/µs), Windows FILETIME, WebKit/Chrome, Apple Cocoa, and ISO 8601 — all interpretations at once. 100%
        client-side.
      </p>

      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="e.g. 1747300000 · 133563456000000000 · 2026-05-15T08:00:00Z"
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-mono text-sm focus:border-brand-500 focus:outline-none"
      />
      <div className="mt-2 flex gap-2 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setVal(String(Math.floor(now / 1000)))}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          now (unix s)
        </button>
        <button
          type="button"
          onClick={() => setVal(new Date(now).toISOString())}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          now (ISO)
        </button>
      </div>

      <ul className="mt-6 grid gap-2 md:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{r.label}</div>
            <div className="font-mono text-sm text-slate-900 dark:text-slate-100">{r.iso}</div>
            <div className="font-mono text-[11px] text-slate-500">{new Date(r.iso).toUTCString()}</div>
          </li>
        ))}
        {val.trim() && rows.length === 0 && (
          <li className="font-mono text-[12px] text-slate-500">No valid timestamp interpretation.</li>
        )}
      </ul>
    </div>
  );
}
