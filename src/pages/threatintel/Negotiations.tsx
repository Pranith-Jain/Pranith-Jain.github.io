import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Handshake, RefreshCw } from 'lucide-react';
import { DataState } from '../../components/DataState';

/**
 * Ransomware negotiation viewer. Reads the authenticated ransomware.live PRO
 * proxy (`/api/v1/rl/negotiations`, edge-cached server-side) and renders a
 * scannable table with per-negotiation chat-transcript drill-down.
 *
 * The PRO negotiation schema is undocumented and has drifted historically,
 * so every field is extracted defensively across known key aliases, with a
 * raw-JSON fallback if a record can't be normalised.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Parse a money-ish value: number, or string like "$1,250,000" / "1.5 BTC". */
function pickNum(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.]/g, '');
      if (cleaned && !Number.isNaN(Number(cleaned))) return Number(cleaned);
    }
  }
  return undefined;
}

interface ChatMsg {
  who: string;
  /** 'victim' | 'actor' | 'unknown' — drives bubble alignment/colour. */
  side: 'victim' | 'actor' | 'unknown';
  ts?: string;
  text: string;
}

interface Negotiation {
  id: string;
  group: string;
  victim: string;
  status?: string;
  demand?: number;
  paid?: number;
  currency?: string;
  /** 0–100, only when both demand & paid are known and demand > 0. */
  discountPct?: number;
  firstDate?: string;
  lastDate?: string;
  messages: ChatMsg[];
  /** Original record, surfaced when normalisation found almost nothing. */
  raw: unknown;
}

const ACTOR_HINTS = /(actor|attacker|operator|admin|support|gang|ransom|seller|lockbit|alphv|blackcat|op)/i;
const VICTIM_HINTS = /(victim|company|client|user|buyer|guest|customer|target)/i;

function classifySide(who: string): ChatMsg['side'] {
  if (ACTOR_HINTS.test(who)) return 'actor';
  if (VICTIM_HINTS.test(who)) return 'victim';
  return 'unknown';
}

function normalizeMessages(rec: Record<string, unknown>): ChatMsg[] {
  let arr: unknown;
  for (const k of ['messages', 'chat', 'negotiation', 'conversation', 'thread', 'chats']) {
    if (Array.isArray(rec[k])) {
      arr = rec[k];
      break;
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((m): ChatMsg | null => {
      if (typeof m === 'string') return { who: 'unknown', side: 'unknown', text: m };
      if (!isRecord(m)) return null;
      const who = pickStr(m, ['from', 'sender', 'author', 'side', 'role', 'party', 'name']) ?? 'unknown';
      const text = pickStr(m, ['text', 'message', 'msg', 'body', 'content']) ?? '';
      if (!text) return null;
      return {
        who,
        side: classifySide(who),
        ts: pickStr(m, ['date', 'timestamp', 'time', 'ts', 'datetime', 'created_at']),
        text,
      };
    })
    .filter((x): x is ChatMsg => x !== null);
}

function normalize(rec: unknown, idx: number): Negotiation {
  if (!isRecord(rec)) {
    return { id: String(idx), group: 'unknown', victim: `record #${idx + 1}`, messages: [], raw: rec };
  }
  const messages = normalizeMessages(rec);
  const demand = pickNum(rec, ['demand', 'ransom_demand', 'initial_demand', 'amount_requested', 'requested', 'ask']);
  const paid = pickNum(rec, ['paid', 'amount_paid', 'final', 'agreed', 'settled', 'final_amount']);
  const discountPct =
    demand && demand > 0 && paid !== undefined
      ? Math.max(0, Math.min(100, Math.round((1 - paid / demand) * 100)))
      : undefined;
  const msgDates = messages.map((m) => m.ts).filter((t): t is string => !!t);
  return {
    id: pickStr(rec, ['id', 'chatid', 'chat_id', 'uuid', '_id']) ?? String(idx),
    group: pickStr(rec, ['group', 'group_name', 'gang', 'actor']) ?? 'unknown',
    victim: pickStr(rec, ['victim', 'company', 'name', 'title', 'domain']) ?? `record #${idx + 1}`,
    status: pickStr(rec, ['status', 'state', 'outcome']),
    demand,
    paid,
    currency: pickStr(rec, ['currency', 'unit']),
    discountPct,
    firstDate: pickStr(rec, ['first_message', 'start', 'started', 'opened', 'discovered']) ?? msgDates[0],
    lastDate: pickStr(rec, ['last_message', 'end', 'ended', 'closed', 'updated']) ?? msgDates[msgDates.length - 1],
    messages,
    raw: rec,
  };
}

function extractList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const k of ['negotiations', 'results', 'data', 'items']) {
      if (Array.isArray(data[k])) return data[k] as unknown[];
    }
  }
  return [];
}

function fmtMoney(n?: number, currency?: string): string {
  if (n === undefined) return '—';
  const c = currency && currency.length <= 5 ? ` ${currency}` : '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M${c}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K${c}`;
  return `${n.toLocaleString()}${c}`;
}

type SortKey = 'group' | 'victim' | 'demand' | 'paid' | 'discountPct' | 'lastDate';

export default function Negotiations(): JSX.Element {
  const [rows, setRows] = useState<Negotiation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('lastDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch('/api/v1/rl/negotiations')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) {
          const e = (j as { error?: string }).error;
          setError(
            e === 'not_configured'
              ? 'ransomware.live PRO key not configured on the server.'
              : `PRO request failed: ${e ?? 'unknown error'}`
          );
          setRows(null);
          return;
        }
        const data = (j as { data?: unknown }).data ?? j;
        setRows(extractList(data).map(normalize));
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const groups = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.group))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const statuses = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.status).filter((s): s is string => !!s))].sort(),
    [rows]
  );

  const view = useMemo(() => {
    let v = rows ?? [];
    if (groupFilter !== 'all') v = v.filter((r) => r.group === groupFilter);
    if (statusFilter !== 'all') v = v.filter((r) => r.status === statusFilter);
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
  }, [rows, groupFilter, statusFilter, sortKey, sortDir]);

  const summary = useMemo(() => {
    const v = rows ?? [];
    const withBoth = v.filter((r) => r.discountPct !== undefined);
    const avgDiscount = withBoth.length
      ? Math.round(withBoth.reduce((s, r) => s + (r.discountPct ?? 0), 0) / withBoth.length)
      : null;
    const paidCount = v.filter((r) => r.paid !== undefined && r.paid > 0).length;
    return {
      total: v.length,
      avgDiscount,
      paymentRate: v.length ? Math.round((paidCount / v.length) * 100) : 0,
    };
  }, [rows]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'group' || k === 'victim' ? 'asc' : 'desc');
    }
  };

  const Th = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider ${className}`}>
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
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Handshake size={28} className="text-brand-600 dark:text-brand-400" /> Ransomware negotiations
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Negotiation chats indexed by ransomware.live (PRO). Scan demand vs. paid, discount achieved, and status; open
          any row for the full transcript. Use it to study counter-party behaviour and discount norms by group — never
          as payment advice.
        </p>
        <p className="text-xs text-slate-500 font-mono mb-6">
          Source: ransomware.live PRO <code>/negotiations</code> (server-side authenticated, edge-cached 1h).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-4 text-[12px] font-mono">
          <span>
            <span className="text-slate-500">negotiations</span>{' '}
            <span className="font-display font-semibold tabular-nums">{summary.total}</span>
          </span>
          <span>
            <span className="text-slate-500">avg discount</span>{' '}
            <span className="font-display font-semibold tabular-nums">
              {summary.avgDiscount === null ? '—' : `${summary.avgDiscount}%`}
            </span>
          </span>
          <span>
            <span className="text-slate-500">payment-rate</span>{' '}
            <span className="font-display font-semibold tabular-nums">{summary.paymentRate}%</span>
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
          {statuses.length > 1 && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-[11px] font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent"
              aria-label="Filter by status"
            >
              <option value="all">any status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={!!rows && rows.length === 0}
        emptyLabel="ransomware.live returned no negotiation records."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={10}
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[760px] text-[12px]">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="w-8" />
                <Th k="group" label="group" />
                <Th k="victim" label="victim" />
                <Th k="demand" label="demand" className="text-right" />
                <Th k="paid" label="paid" className="text-right" />
                <Th k="discountPct" label="disc %" className="text-right" />
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  status
                </th>
                <Th k="lastDate" label="last msg" />
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  msgs
                </th>
              </tr>
            </thead>
            <tbody>
              {view.map((n) => {
                const open = expanded === n.id;
                return (
                  <Fragment key={n.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : n.id)}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="pl-2 text-slate-400">
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="px-2 py-2 font-mono">{n.group}</td>
                      <td className="px-2 py-2 font-display font-semibold max-w-[220px] truncate" title={n.victim}>
                        {n.victim}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(n.demand, n.currency)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(n.paid, n.currency)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {n.discountPct === undefined ? (
                          '—'
                        ) : (
                          <span
                            className={
                              n.discountPct >= 50
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {n.discountPct}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {n.status ? (
                          <span className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[10px]">
                            {n.status}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-slate-500 whitespace-nowrap">{n.lastDate ?? '—'}</td>
                      <td className="px-2 py-2 font-mono text-slate-500 tabular-nums">{n.messages.length}</td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50 dark:bg-slate-950">
                        <td colSpan={9} className="px-4 py-3">
                          {n.messages.length > 0 ? (
                            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                              {n.messages.map((m, i) => (
                                <li
                                  key={i}
                                  className={`max-w-[80%] rounded-lg border p-2.5 ${
                                    m.side === 'actor'
                                      ? 'border-rose-500/40 bg-rose-500/10'
                                      : m.side === 'victim'
                                        ? 'border-sky-500/40 bg-sky-500/10 ml-auto'
                                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3 mb-1">
                                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                                      {m.who} · {m.side}
                                    </span>
                                    {m.ts && <span className="font-mono text-[10px] text-slate-400">{m.ts}</span>}
                                  </div>
                                  <p className="font-mono text-[12px] whitespace-pre-wrap break-words leading-relaxed">
                                    {m.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <pre className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 overflow-auto font-mono text-[11px] max-h-[50vh]">
                              {JSON.stringify(n.raw, null, 2)}
                            </pre>
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
