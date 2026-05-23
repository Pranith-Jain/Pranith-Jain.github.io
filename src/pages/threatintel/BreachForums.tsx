import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Copy, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import { DataState } from '../../components/DataState';
import { FeedAggregateCard } from '../../components/intel/FeedAggregateCard';

/**
 * Breach / leak-forum tracker. Intelligence ABOUT forums only — directory
 * metadata + public OSINT-coverage links. Never the forums' contents.
 */

interface ForumRow {
  name: string;
  origin: 'directory' | 'curated';
  category: string;
  url: string;
  onion: boolean;
  status: string;
  note?: string;
}
interface BreachForumsResponse {
  generated_at: string;
  rows: ForumRow[];
  totals: { directory: number; curated: number };
}

function statusClass(s: string): string {
  const v = s.toLowerCase();
  if (v === 'online' || v === 'active' || v === 'valid')
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (v === 'seized' || v === 'offline' || v === 'down')
    return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

export default function BreachForums(): JSX.Element {
  const [data, setData] = useState<BreachForumsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch('/api/v1/breach-forums')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<BreachForumsResponse>;
      })
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const groups = useMemo(() => {
    const m = new Map<string, ForumRow[]>();
    for (const r of data?.rows ?? []) {
      const arr = m.get(r.category) ?? [];
      arr.push(r);
      m.set(r.category, arr);
    }
    // Curated "notable" group first, then directory categories.
    return [...m.entries()].sort((a, b) =>
      a[0] === 'Notable breach/leak forum' ? -1 : b[0] === 'Notable breach/leak forum' ? 1 : a[0].localeCompare(b[0])
    );
  }, [data]);

  const copy = (t: string) => void navigator.clipboard?.writeText(t);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Breach / leak-forum tracker
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          A directory of criminal forums and dark markets (community-maintained deepdarkCTI list) plus a curated set of
          notable breach/leak forums. This is <strong>intelligence about</strong> these venues — names, status, and
          public OSINT-coverage links.
        </p>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-[11px] text-amber-700 dark:text-amber-300 max-w-3xl mb-6">
          No forum content, credentials, or breach data is fetched, parsed, or linked here. Curated entries link to
          public OSINT coverage (DarkWebInformer search), not to the forums themselves.
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        {data && (
          <p className="text-[11px] font-mono text-slate-500">
            {data.rows.length} entries · {data.totals.directory} from deepdarkCTI · {data.totals.curated} curated
          </p>
        )}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      {/* Aggregate STIX 2.1 view of the tracker — actor names + notes
          surface known threat actors and category context. Hard rule:
          intelligence-about only; never forum content. */}
      {data && data.rows.length > 0 && (
        <FeedAggregateCard
          sourceId="breach-forums"
          sourceName="Breach / leak-forum tracker"
          title="Breach-forum tracker · today"
          items={data.rows.map((r) => ({
            title: r.name,
            body: `${r.category} · ${r.status} · ${r.note ?? ''}`,
          }))}
        />
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.rows.length === 0}
        emptyLabel="No forum directory rows available this snapshot."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        <div className="space-y-6">
          {groups.map(([category, rows]) => (
            <div key={category}>
              <h2 className="font-display font-semibold text-sm mb-2">
                {category} <span className="font-mono text-[11px] text-slate-500">· {rows.length}</span>
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {rows.map((r, i) => (
                  <li
                    key={`${r.name}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-sm truncate" title={r.name}>
                        {r.name}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {r.onion && (
                          <span className="rounded border border-slate-400/40 bg-slate-400/10 px-1 py-0.5 font-mono text-[9px] uppercase text-slate-500">
                            onion
                          </span>
                        )}
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </span>
                    </div>
                    {r.note && <p className="font-mono text-[11px] text-slate-500 mt-1 leading-relaxed">{r.note}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {r.origin === 'curated' ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                        >
                          OSINT coverage <ExternalLink size={9} />
                        </a>
                      ) : (
                        <code className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                          {r.url}
                        </code>
                      )}
                      <button
                        type="button"
                        onClick={() => copy(r.url)}
                        className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600"
                        aria-label="Copy URL"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DataState>
    </div>
  );
}
