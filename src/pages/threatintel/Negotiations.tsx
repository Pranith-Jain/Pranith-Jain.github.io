import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ChevronDown, ChevronRight, Handshake, RefreshCw } from 'lucide-react';
import { DataState } from '../../components/DataState';

/**
 * Ransomware negotiations. Backed by /api/v1/negotiations — a server-side
 * fan-out across every ransomware.live PRO negotiation group (the bare RL
 * endpoint is only a directory, which is why the old single-fetch page was
 * empty). Per-chat transcripts are pulled on demand from the public
 * Casualtek/Ransomchats research repo (RL's tier exposes only counts).
 */

interface Negotiation {
  group: string;
  chat_id: string;
  date?: string;
  message_count: number;
  initial_ransom?: number;
  negotiated_ransom?: number;
  paid: boolean;
  discount_pct?: number;
}
interface NegotiationsResponse {
  generated_at: string;
  source: string;
  groups: { group: string; chats: number; description?: string; recent_victims?: number }[];
  negotiations: Negotiation[];
  totals: { groups: number; chats: number; settled: number; avg_discount: number | null };
  warnings: string[];
}
interface TranscriptMsg {
  party?: string;
  content?: string;
  timestamp?: string;
}

function fmtMoney(n?: number): string {
  if (n === undefined) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

type SortKey = 'group' | 'date' | 'initial_ransom' | 'negotiated_ransom' | 'discount_pct' | 'message_count';

export default function Negotiations(): JSX.Element {
  const [data, setData] = useState<NegotiationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptMsg[] | 'loading' | 'error'>>({});
  // Track in-flight transcript fetches so we can abort them on unmount.
  const transcriptCtrlRef = useRef<Map<string, AbortController>>(new Map());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupFilter, setGroupFilter] = useState('all');
  const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch('/api/v1/negotiations')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) {
          setError(`request failed: ${(j as { error?: string }).error ?? 'unknown'}`);
          setData(null);
          return;
        }
        setData(j as NegotiationsResponse);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const rowKey = (n: Negotiation) => `${n.group}/${n.chat_id}`;

  function toggle(n: Negotiation) {
    const k = rowKey(n);
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    setExpanded(k);
    if (transcripts[k]) return;
    setTranscripts((t) => ({ ...t, [k]: 'loading' }));
    const ctrl = new AbortController();
    transcriptCtrlRef.current.set(k, ctrl);
    fetch(`/api/v1/negotiations/${encodeURIComponent(n.group)}/${encodeURIComponent(n.chat_id)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        const msgs = (j as { messages?: TranscriptMsg[] }).messages;
        setTranscripts((t) => ({ ...t, [k]: ok && Array.isArray(msgs) ? msgs : 'error' }));
      })
      .catch((e: { name?: string }) => {
        if (e.name === 'AbortError') return;
        setTranscripts((t) => ({ ...t, [k]: 'error' }));
      })
      .finally(() => transcriptCtrlRef.current.delete(k));
  }

  // Abort any in-flight transcript fetches when the component unmounts.
  useEffect(() => {
    return () => {
      for (const c of transcriptCtrlRef.current.values()) c.abort();
      transcriptCtrlRef.current.clear();
    };
  }, []);

  const groups = useMemo(
    () => [...new Set((data?.negotiations ?? []).map((n) => n.group))].sort((a, b) => a.localeCompare(b)),
    [data]
  );

  const view = useMemo(() => {
    let v = data?.negotiations ?? [];
    if (groupFilter !== 'all') v = v.filter((n) => n.group === groupFilter);
    if (paidFilter !== 'all') v = v.filter((n) => (paidFilter === 'paid' ? n.paid : !n.paid));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...v].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, groupFilter, paidFilter, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'group' ? 'asc' : 'desc');
    }
  };

  const Th = ({ k, label, cls = '' }: { k: SortKey; label: string; cls?: string }) => (
    <th className={`px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider ${cls}`}>
      <button
        type="button"
        onClick={() => setSort(k)}
        className={`inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 ${
          sortKey === k ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500'
        }`}
      >
        {label}
        {sortKey === k && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Handshake size={28} className="text-brand-600 dark:text-brand-400" /> Ransomware negotiations
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Negotiation chats across every group ransomware.live PRO indexes — initial demand vs. negotiated figure,
          discount achieved, settlement flag. Open a row for the full transcript. Study counter-party behaviour and
          discount norms; never payment advice.
        </p>
        <p className="text-xs text-slate-500 font-mono mb-6">
          Source: ransomware.live PRO <code>/negotiations</code> (per-group fan-out, edge-cached 1h) · transcripts from
          the public <code>Casualtek/Ransomchats</code> research repo on demand.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-4 text-[12px] font-mono">
          <span>
            <span className="text-slate-500">negotiations</span>{' '}
            <span className="font-display font-semibold tabular-nums">{data?.totals.chats ?? 0}</span>
          </span>
          <span>
            <span className="text-slate-500">groups</span>{' '}
            <span className="font-display font-semibold tabular-nums">{data?.totals.groups ?? 0}</span>
          </span>
          <span>
            <span className="text-slate-500">avg discount</span>{' '}
            <span className="font-display font-semibold tabular-nums">
              {data?.totals.avg_discount == null ? '—' : `${data.totals.avg_discount}%`}
            </span>
          </span>
          <span>
            <span className="text-slate-500">settled</span>{' '}
            <span className="font-display font-semibold tabular-nums">{data?.totals.settled ?? 0}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {groups.length > 1 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-[11px] font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent"
              aria-label="Filter by group"
            >
              <option value="all">all groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value as 'all' | 'paid' | 'unpaid')}
            className="text-[11px] font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent"
            aria-label="Filter by settlement"
          >
            <option value="all">paid + unpaid</option>
            <option value="paid">settled only</option>
            <option value="unpaid">unsettled only</option>
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </section>

      {(() => {
        if (groupFilter === 'all') return null;
        const g = data?.groups.find((x) => x.group === groupFilter);
        if (!g || (!g.description && !g.recent_victims)) return null;
        return (
          <section className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-mono text-xs uppercase tracking-wider text-brand-700 dark:text-brand-300">
                {g.group} · MyThreatIntel
              </span>
              {g.recent_victims ? (
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {g.recent_victims} recent victim claim{g.recent_victims === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            {g.description ? (
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{g.description}</p>
            ) : null}
          </section>
        );
      })()}

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.negotiations.length === 0}
        emptyLabel="No negotiation records returned (RL PRO directory empty or key unauthorized)."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={10}
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="w-8" />
                <Th k="group" label="group" />
                <Th k="date" label="chat date" />
                <Th k="initial_ransom" label="demand" cls="text-right" />
                <Th k="negotiated_ransom" label="negotiated" cls="text-right" />
                <Th k="discount_pct" label="disc %" cls="text-right" />
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  settled
                </th>
                <Th k="message_count" label="msgs" cls="text-right" />
              </tr>
            </thead>
            <tbody>
              {view.map((n) => {
                const k = rowKey(n);
                const open = expanded === k;
                const t = transcripts[k];
                return (
                  <Fragment key={k}>
                    <tr
                      onClick={() => toggle(n)}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="pl-2 text-slate-400">
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="px-2 py-2 font-mono">{n.group}</td>
                      <td className="px-2 py-2 font-mono text-slate-500 whitespace-nowrap">{n.date ?? n.chat_id}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(n.initial_ransom)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(n.negotiated_ransom)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {n.discount_pct === undefined ? (
                          '—'
                        ) : (
                          <span
                            className={
                              n.discount_pct >= 50
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {n.discount_pct}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {n.paid ? (
                          <span className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                            paid
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">no</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500 tabular-nums">{n.message_count}</td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50 dark:bg-slate-950">
                        <td colSpan={8} className="px-4 py-3">
                          {t === 'loading' && (
                            <p className="font-mono text-[12px] text-slate-500">loading transcript…</p>
                          )}
                          {t === 'error' && (
                            <p className="font-mono text-[12px] text-amber-600 dark:text-amber-400">
                              Transcript not available in Casualtek/Ransomchats for {n.group}/{n.chat_id}.
                            </p>
                          )}
                          {Array.isArray(t) && t.length > 0 && (
                            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                              {t.map((m, i) => {
                                const victim = (m.party ?? '').toLowerCase() === 'victim';
                                return (
                                  <li
                                    key={i}
                                    className={`max-w-[80%] rounded-lg border p-2.5 ${
                                      victim
                                        ? 'border-sky-500/40 bg-sky-500/10 ml-auto'
                                        : 'border-rose-500/40 bg-rose-500/10'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                                        {m.party ?? '?'}
                                      </span>
                                      {m.timestamp && (
                                        <span className="font-mono text-[10px] text-slate-400">{m.timestamp}</span>
                                      )}
                                    </div>
                                    <p className="font-mono text-[12px] whitespace-pre-wrap break-words leading-relaxed">
                                      {m.content ?? ''}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {Array.isArray(t) && t.length === 0 && (
                            <p className="font-mono text-[12px] text-slate-500">Transcript is empty.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}
