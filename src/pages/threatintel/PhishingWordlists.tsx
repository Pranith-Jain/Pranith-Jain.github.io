import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileSearch, Search } from 'lucide-react';
import { DataState } from '../../components/DataState';
import { DataPageLayout } from '../../components/DataPageLayout';

interface Wordlist {
  id: string;
  label: string;
  blurb: string;
  line_count: number;
  truncated: boolean;
  lines: string[];
  ok: boolean;
}

interface PhishingWordlistsResponse {
  generated_at: string;
  source_url: string;
  lists: Wordlist[];
}

export default function PhishingWordlists(): JSX.Element {
  const [data, setData] = useState<PhishingWordlistsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(200);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/v1/phishing-wordlists', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<PhishingWordlistsResponse>;
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        if (d) {
          setData(d);
          setActiveId(d.lists[0]?.id ?? null);
        }
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const active = useMemo(() => data?.lists.find((l) => l.id === activeId) ?? null, [data, activeId]);

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toLowerCase();
    if (!q) return active.lines;
    return active.lines.filter((l) => l.toLowerCase().includes(q));
  }, [active, query]);

  useEffect(() => {
    setVisible(200);
  }, [activeId, query]);

  const copyList = () => {
    if (!active) return;
    void navigator.clipboard.writeText(filtered.join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<FileSearch size={28} />}
      title="Phishing hunting wordlists"
      description={
        <>
          Fuzzing wordlists (Gobuster / ffuf) for hunting exposed credential dumps, admin panels, and webshells on
          phishing infrastructure — the filenames threat actors use to stash stolen creds and campaign data. Pairs with
          open-directory / exposed-host hunting. Sourced from{' '}
          <a
            href="https://github.com/spmedia/PhishingSecLists"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            spmedia/PhishingSecLists
          </a>{' '}
          (MIT).
        </>
      }
      maxWidthClass="max-w-4xl"
    >
      {data && (
        <div className="flex flex-wrap gap-1.5 mt-4 mb-4">
          {data.lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActiveId(l.id)}
              className={`text-xs font-mono px-3 py-1.5 rounded border ${
                activeId === l.id
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500'
              } ${!l.ok ? 'opacity-50' : ''}`}
              title={l.ok ? `${l.line_count.toLocaleString()} entries` : 'unreachable'}
            >
              {l.label} <span className="opacity-70">· {l.line_count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{active.blurb}</p>

          <section className="surface-card p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Filter ${active.label}…`}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  aria-label="Filter wordlist entries"
                />
              </div>
              <button
                type="button"
                onClick={copyList}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 disabled:opacity-50"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'copied' : 'copy'}
              </button>
            </div>
          </section>

          <p className="text-mini font-mono text-slate-500 mb-3">
            Showing {Math.min(visible, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} entries
            {active.truncated && <span className="text-amber-600 dark:text-amber-400"> · list capped server-side</span>}
          </p>
        </>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!!active && filtered.length === 0}
        emptyLabel={query ? 'No entries match the filter.' : 'List is empty or unreachable.'}
        rows={10}
      >
        <ul className="surface-card divide-y divide-slate-100 dark:divide-slate-800 font-mono text-tool">
          {filtered.slice(0, visible).map((line, i) => (
            <li key={`${line}-${i}`} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 break-all">
              {line}
            </li>
          ))}
        </ul>
        {filtered.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + 200)}
            className="mt-3 w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] py-2 font-mono text-meta text-muted hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            Show more ({(filtered.length - visible).toLocaleString()} remaining)
          </button>
        )}
      </DataState>
    </DataPageLayout>
  );
}
