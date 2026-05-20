import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, Globe, Search } from 'lucide-react';
import { DataState } from '../../components/DataState';

interface DDCEntry {
  name: string;
  url: string;
  onion: boolean;
  status: 'online' | 'offline' | 'valid' | 'expired' | 'unknown';
  category: string;
  source_file: string;
  notes?: string;
  actor?: string;
  attack_type?: string;
}

interface DDCResponse {
  generated_at: string;
  sources: Array<{ source_file: string; ok: boolean; count: number; total_seen: number; stale?: boolean }>;
  categories: Array<{ id: string; label: string; count: number }>;
  total: number;
  entries: DDCEntry[];
}

const STATUS_STYLE: Record<DDCEntry['status'], string> = {
  online: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  valid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  offline: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  expired: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  unknown: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-400',
};

export default function DeepDarkCTI(): JSX.Element {
  const [data, setData] = useState<DDCResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [hideDown, setHideDown] = useState(true);
  const [onionOnly, setOnionOnly] = useState<'all' | 'onion' | 'clearnet'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/deepdarkcti')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DDCResponse) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (cat !== 'all' && e.category !== cat) return false;
      if (hideDown && (e.status === 'offline' || e.status === 'expired')) return false;
      if (onionOnly === 'onion' && !e.onion) return false;
      if (onionOnly === 'clearnet' && e.onion) return false;
      if (!q) return true;
      return `${e.name} ${e.notes ?? ''} ${e.actor ?? ''} ${e.attack_type ?? ''}`.toLowerCase().includes(q);
    });
  }, [data, query, cat, hideDown, onionOnly]);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> deepdarkCTI Index
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Parsed mirror of{' '}
          <a
            href="https://github.com/fastfire/deepdarkCTI"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            fastfire/deepdarkCTI
          </a>{' '}
          — ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor channels. Onion addresses
          are copy-only (clearnet browsers can't open <code>.onion</code>).
        </p>
      </div>

      <DataState
        loading={!data && !error}
        error={error}
        empty={!!data && data.total === 0}
        emptyLabel="deepdarkCTI temporarily unavailable — upstream fetch failed and no cached copy exists yet."
        rows={8}
      >
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, notes, actor…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  aria-label="Search deepdarkCTI"
                />
              </div>
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-2 px-3 font-mono text-[12px] dark:border-slate-800 dark:bg-slate-900"
                aria-label="Category filter"
              >
                <option value="all">All categories ({data.total})</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
              <select
                value={onionOnly}
                onChange={(e) => setOnionOnly(e.target.value as typeof onionOnly)}
                className="rounded-lg border border-slate-200 bg-white py-2 px-3 font-mono text-[12px] dark:border-slate-800 dark:bg-slate-900"
                aria-label="Network filter"
              >
                <option value="all">Onion + clearnet</option>
                <option value="onion">Onion only</option>
                <option value="clearnet">Clearnet only</option>
              </select>
              <label className="flex items-center gap-1.5 font-mono text-[12px] text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={hideDown} onChange={(e) => setHideDown(e.target.checked)} />
                hide offline/expired
              </label>
            </div>

            <p className="font-mono text-[11px] text-slate-500 mb-3">
              {filtered.length} shown · {data.total} total ·{' '}
              {data.sources.filter((s) => s.stale).length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {data.sources.filter((s) => s.stale).length} source(s) cached
                </span>
              )}
            </p>

            <ul className="grid gap-2 md:grid-cols-2">
              {filtered.map((e, idx) => (
                <li
                  key={`${e.source_file}:${e.url}:${idx}`}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-display font-semibold text-sm truncate">{e.name}</span>
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${STATUS_STYLE[e.status]}`}
                        >
                          {e.status}
                        </span>
                        {e.attack_type && (
                          <span className="shrink-0 rounded border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[9px] text-brand-700 dark:text-brand-300">
                            {e.attack_type}
                          </span>
                        )}
                      </div>
                      {e.actor && <div className="font-mono text-[11px] text-slate-500 mt-0.5">actor: {e.actor}</div>}
                      {e.onion ? (
                        <code className="block mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                          {e.url}
                        </code>
                      ) : (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline break-all"
                        >
                          {e.url}
                          <ExternalLink size={10} className="shrink-0" />
                        </a>
                      )}
                      {e.notes && <p className="font-mono text-[11px] text-slate-500 mt-1">{e.notes}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(e.url)}
                      className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                      aria-label="Copy URL"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">{e.category}</span>
                    <a
                      href={`https://github.com/fastfire/deepdarkCTI/blob/main/${e.source_file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[9px] text-slate-400 hover:text-brand-500"
                    >
                      {e.source_file}
                    </a>
                    {copied === e.url && (
                      <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">copied</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </DataState>
    </div>
  );
}
