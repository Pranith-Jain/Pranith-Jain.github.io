import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, ExternalLink, FileCode, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface RuleFile {
  name: string;
  kind: 'yara' | 'snort';
  download_url: string;
  size: number;
}
interface FolderEntry {
  name: string;
  label: string;
  year: string;
  date: string;
  has_indicators: boolean;
  indicators_url: string;
  rule_files: RuleFile[];
}
interface TreeResponse {
  source: string;
  source_url: string;
  license: string;
  generated_at: string;
  mode: 'folders';
  count: number;
  total: number;
  years: Record<string, number>;
  folders: FolderEntry[];
  stale?: boolean;
  upstream_error?: string;
}

interface Ioc {
  value: string;
  kind: 'hash' | 'domain' | 'ipv4' | 'url' | 'email' | 'other';
  entity_type: string;
  description: string;
}
interface FolderResponse {
  source: string;
  source_url: string;
  license: string;
  generated_at: string;
  mode: 'folder';
  folder: string;
  label: string;
  year: string;
  date: string;
  indicators_url: string;
  rule_files: RuleFile[];
  count: number;
  kinds: Record<string, number>;
  iocs: Ioc[];
  stale?: boolean;
  upstream_error?: string;
}

/** Only render http(s) links — every URL here comes from an untrusted upstream
 *  GitHub tree / CSV, so never let a `javascript:`/`data:` URL reach an href. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const KIND_TONE: Record<string, string> = {
  hash: 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10',
  domain: 'border-sky-500/50 text-sky-600 dark:text-sky-400 bg-sky-500/10',
  ipv4: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  url: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  email: 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10',
  other: 'border-slate-400/50 text-slate-500 bg-slate-400/10',
};

function chip(active: boolean): string {
  return `text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
    active
      ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
      : 'border-slate-300 dark:border-slate-700 text-muted hover:border-brand-500/40'
  }`;
}

/** IOC values can be huge (urls). Only pivot the pivot-able kinds to the checker;
 *  for `url`/`other` we still render the raw value but skip the IOC-check link. */
function pivotable(kind: Ioc['kind']): boolean {
  return kind === 'hash' || kind === 'domain' || kind === 'ipv4' || kind === 'url';
}

interface FolderRowProps {
  folder: FolderEntry;
}

function FolderRow({ folder }: FolderRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FolderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/v1/volexity-threat-intel?folder=${encodeURIComponent(folder.name)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<FolderResponse>;
      })
      .then((d) => setData(d))
      .catch((e: { message?: string }) => setErr(e.message ?? 'unknown'))
      .finally(() => setLoading(false));
  }, [folder.name]);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) load();
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-start gap-2 p-3 text-left"
      >
        <span className="text-slate-400 mt-0.5 shrink-0">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug break-words">
            {folder.label}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {folder.has_indicators && (
              <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                iocs.csv
              </span>
            )}
            {folder.rule_files.map((rf) => (
              <span
                key={rf.name}
                className={`text-micro font-mono px-1.5 py-0.5 rounded border ${
                  rf.kind === 'yara'
                    ? 'border-violet-500/40 text-violet-600 dark:text-violet-400'
                    : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                }`}
              >
                {rf.kind === 'yara' ? 'YARA' : 'Snort'}: {rf.name}
              </span>
            ))}
          </span>
        </span>
        {folder.date && <span className="text-micro font-mono text-slate-400 shrink-0">{folder.date}</span>}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-800 pt-3">
          {/* rule-file download links (sourced from the cached tree, safeHref'd) */}
          {folder.rule_files.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
              {folder.rule_files.map((rf) => {
                const href = safeHref(rf.download_url);
                return href ? (
                  <a
                    key={rf.name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                  >
                    <FileCode size={12} /> {rf.name}
                  </a>
                ) : (
                  <span key={rf.name} className="text-micro font-mono text-slate-400">
                    {rf.name}
                  </span>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-3 text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs font-mono">loading indicators…</span>
            </div>
          )}
          {err && <p className="text-xs text-rose-600 dark:text-rose-400 py-2">Failed to load: {err}</p>}

          {data && !loading && (
            <>
              {data.stale && (
                <p className="text-micro font-mono text-amber-600 dark:text-amber-400 mb-2">
                  ⚠ cached indicators (upstream temporarily unavailable)
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {Object.entries(data.kinds)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <span
                      key={k}
                      className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        KIND_TONE[k] ?? KIND_TONE.other
                      }`}
                    >
                      {k} · {n}
                    </span>
                  ))}
                {data.count === 0 && (
                  <span className="text-micro font-mono text-slate-400">no indicator CSV in this folder</span>
                )}
              </div>

              {data.iocs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 font-mono">
                        <th className="py-1 pr-3 font-normal">indicator</th>
                        <th className="py-1 pr-3 font-normal">type</th>
                        <th className="py-1 font-normal">context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.iocs.slice(0, 2000).map((ioc, i) => (
                        <tr
                          key={`${ioc.value}-${i}`}
                          className="border-t border-slate-200/70 dark:border-slate-800/70 align-top"
                        >
                          <td className="py-1 pr-3 font-mono break-all text-slate-800 dark:text-slate-200">
                            {pivotable(ioc.kind) ? (
                              <Link
                                to={`/dfir/ioc-check?indicator=${encodeURIComponent(ioc.value)}`}
                                className="hover:text-brand-600 dark:hover:text-brand-400"
                                title="Pivot to IOC checker"
                              >
                                {ioc.value} →
                              </Link>
                            ) : (
                              ioc.value
                            )}
                          </td>
                          <td className="py-1 pr-3 font-mono whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded border ${KIND_TONE[ioc.kind] ?? KIND_TONE.other}`}>
                              {ioc.entity_type || ioc.kind}
                            </span>
                          </td>
                          <td className="py-1 text-slate-500 dark:text-slate-400">{ioc.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.indicators_url &&
                (() => {
                  const href = safeHref(data.indicators_url);
                  return href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      raw iocs.csv <ExternalLink size={12} />
                    </a>
                  ) : null;
                })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function VolexityThreatIntel(): JSX.Element {
  const [data, setData] = useState<TreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/volexity-threat-intel', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TreeResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message ?? 'unknown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const years = useMemo(() => Object.entries(data?.years ?? {}).sort((a, b) => b[0].localeCompare(a[0])), [data]);

  const filtered = useMemo(() => {
    const list = data?.folders ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter(
      (f) => (year === 'all' || f.year === year) && (!needle || f.label.toLowerCase().includes(needle))
    );
  }, [data, year, query]);

  const description = (
    <>
      Per-blogpost APT research folders from Volexity's public{' '}
      <a
        href="https://github.com/volexity/threat-intel"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 dark:text-brand-400 hover:underline"
      >
        threat-intel
      </a>{' '}
      repository — each folder ships an indicators CSV plus YARA / Snort detection rules. Expand a folder to load its
      indicators on demand and pivot any hash / domain / IP to the IOC checker. Licensed BSD-2-Clause; free to display
      and cite with attribution to Volexity.
    </>
  );

  const headerExtra =
    data && !error ? (
      <div className="space-y-2">
        {data.stale && (
          <p className="text-micro font-mono text-amber-600 dark:text-amber-400">
            ⚠ showing cached data (upstream temporarily unavailable)
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setYear('all')} className={chip(year === 'all')}>
            All years <span className="opacity-60">· {data.total}</span>
          </button>
          {years.map(([name, n]) => (
            <button key={name} onClick={() => setYear(name)} className={chip(year === name)}>
              {name} <span className="opacity-60">· {n}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter by actor / campaign…"
          className="w-full max-w-sm text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-brand-500/60"
        />
      </div>
    ) : undefined;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Users size={28} />}
      title="Volexity APT IOCs"
      description={description}
      headerExtra={headerExtra}
      loading={loading}
      error={error}
      empty={!loading && !error && !!data && filtered.length === 0}
      emptyMessage="No research folders match the filter."
    >
      <div className="grid gap-2">
        {filtered.map((folder) => (
          <FolderRow key={folder.name} folder={folder} />
        ))}
      </div>

      {data && (
        <p className="mt-6 text-micro font-mono text-slate-400 text-center">
          Data:{' '}
          <a
            href={safeHref(data.source_url) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            {data.source}
          </a>{' '}
          — BSD-2-Clause; free to display and cite with attribution to Volexity · {data.total} research folders
        </p>
      )}
    </DataPageLayout>
  );
}
