/**
 * Full-featured MCP search workbench.
 *
 * Used in two places:
 *   - inside the AI Report showcase as the cross-source panel
 *   - on /threatintel/mcp-search as the full page body
 *
 * State (query, mode, last result) is local to each instance; an
 * in-memory history of the last 10 queries is kept per page and
 * persisted in localStorage under "ti-mindmap:search-history" so the
 * user can re-run recent lookups without retyping.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Search, X } from 'lucide-react';
import {
  searchIoc,
  searchCve,
  listReports,
  listBriefings,
  type IocSearchResult,
  type CveSearchResult,
  type ListReportsResult,
  type BriefingSummary,
} from '../../lib/ti-mindmap-mcp';
import { useMcp, McpError } from './McpContext';

type Mode = 'ioc' | 'cve' | 'report' | 'briefing';

const HISTORY_KEY = 'ti-mindmap:search-history';
const HISTORY_MAX = 10;

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string').slice(0, HISTORY_MAX);
    return [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    /* ignore */
  }
}

interface SearchHit {
  ioc?: IocSearchResult;
  cve?: CveSearchResult;
  reports?: ListReportsResult;
  briefing?: BriefingSummary;
}

export function McpSearchWorkbench(props: {
  /** When true, the workbench shows a hint that the user needs to set a key. */
  showKeyHint?: boolean;
  /** Show the in-component history chip row. */
  showHistory?: boolean;
  /** Compact mode for use in side panels. */
  compact?: boolean;
}): JSX.Element {
  const { apiKey, status, statusMsg } = useMcp();
  const [mode, setMode] = useState<Mode>('ioc');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function pushHistory(item: string): void {
    if (!item) return;
    setHistory((h) => {
      const next = [item, ...h.filter((x) => x !== item)].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }

  async function run(queryArg?: string): Promise<void> {
    if (status !== 'connected' || !apiKey) return;
    const query = (queryArg ?? q).trim();
    if (!query) return;
    setQ(query);
    setBusy(true);
    setErr(null);
    setHit(null);
    try {
      if (mode === 'ioc') {
        setHit({ ioc: await searchIoc(apiKey, query) });
      } else if (mode === 'cve') {
        setHit({ cve: await searchCve(apiKey, query.toUpperCase()) });
      } else if (mode === 'report') {
        setHit({ reports: await listReports(apiKey, { search: query, limit: 12 }) });
      } else {
        // 'briefing' -- list the last 10 briefings and let the user pick
        const list = await listBriefings(apiKey, 10);
        setHit({ briefing: list[0] ?? null });
      }
      pushHistory(`${mode}:${query}`);
    } catch (e) {
      const msg = e instanceof McpError ? e.message : e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  const placeholders: Record<Mode, string> = {
    ioc: '8.8.8.8 · evil.com · sha256:…',
    cve: 'CVE-2025-55182',
    report: 'ransomware · lazarus · apt29',
    briefing: '(no input needed — list latest briefings)',
  };
  const disabled = status !== 'connected' || busy || (mode !== 'briefing' && !q.trim());

  return (
    <div
      className={
        props.compact
          ? ''
          : 'rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1'
      }
    >
      <div className={props.compact ? '' : 'p-4'}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {props.compact ? 'Quick MCP search' : 'TI-Mindmap-Hub Search'}
          </h3>
          <span className="ml-auto text-micro font-mono uppercase text-slate-500">via MCP · 19 tools</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden text-xs font-mono">
            {(['ioc', 'cve', 'report', 'briefing'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2.5 py-1.5 ${mode === m ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={mode === 'briefing'}
            placeholder={placeholders[mode]}
            className="flex-1 min-w-[12rem] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-sm text-slate-800 dark:text-slate-200 disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            search
          </button>
          {(hit || err) && (
            <button
              type="button"
              onClick={() => {
                setHit(null);
                setErr(null);
                setQ('');
              }}
              className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
              aria-label="Clear results"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {status === 'unconfigured' && props.showKeyHint !== false && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Add your TI-Mindmap-Hub API key in the page header to enable search. Keys stay in your browser
            (localStorage).
          </p>
        )}
        {status === 'error' && (
          <div className="mt-3 flex flex-wrap items-start gap-2 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono font-semibold">MCP connection error</p>
              {statusMsg && (
                <p className="mt-0.5 font-mono text-[11px] text-rose-700/80 dark:text-rose-300/80 break-words">
                  {statusMsg}
                </p>
              )}
              <p className="mt-1 text-rose-700/80 dark:text-rose-300/80">
                Common causes: invalid or revoked key, or network/CORS issue. Open the MCP pill in the header to edit or
                re-probe the key.
              </p>
            </div>
          </div>
        )}

        {props.showHistory !== false && history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-slate-500 mr-1">recent:</span>
            {history.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  const [m, ...rest] = h.split(':');
                  setMode((m as Mode) ?? 'ioc');
                  const text = rest.join(':');
                  setQ(text);
                  void run(text);
                }}
                className="rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:border-brand-400"
                title={h}
              >
                {h}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                saveHistory([]);
              }}
              className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          </div>
        )}

        {err && (
          <div className="mt-3 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> {err}
          </div>
        )}

        {hit && (
          <div className="mt-3 space-y-2">
            {hit.ioc && <IocHitCard hit={hit.ioc} />}
            {hit.cve && <CveHitCard hit={hit.cve} />}
            {hit.reports && <ReportsHitCard hit={hit.reports} />}
            {hit.briefing && <BriefingHitCard hit={hit.briefing} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Result card components (shared with AIReportShowcase if it wants to
//    render the same look; in practice AIReportShowcase has its own
//    variants, so these are kept independent for clarity) ─────────────

function IocHitCard({ hit }: { hit: IocSearchResult }): JSX.Element {
  const reports = hit.reports ?? [];
  const total = hit.total_reports ?? reports.length;
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        IOC search · <span className="text-slate-800 dark:text-slate-200">{hit.ioc_value}</span>
        {hit.ioc_type && (
          <span className="ml-2 rounded border border-slate-300 dark:border-slate-700 px-1.5 py-0.5">
            {hit.ioc_type}
          </span>
        )}
        <span className={`ml-2 ${total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
          {total} report{total === 1 ? '' : 's'}
        </span>
        {hit.last_seen && <span className="ml-2 text-slate-500">last seen {hit.last_seen}</span>}
      </p>
      {reports.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No reports mention this indicator.</p>
      ) : (
        <ul className="space-y-1.5">
          {reports.slice(0, 6).map((r) => (
            <ReportRow key={r.report_id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CveHitCard({ hit }: { hit: CveSearchResult }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        CVE · <span className="text-slate-800 dark:text-slate-200">{hit.cve_id}</span>
        {hit.severity && (
          <span className="ml-2 rounded border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
            {hit.severity}
          </span>
        )}
        {typeof hit.cvss_score === 'number' && <span className="ml-2 font-mono">CVSS {hit.cvss_score.toFixed(1)}</span>}
        {typeof hit.epss_score === 'number' && (
          <span className="ml-2 font-mono">EPSS {(hit.epss_score * 100).toFixed(1)}%</span>
        )}
        {hit.exploited && (
          <span className="ml-2 rounded border border-rose-300 dark:border-rose-700 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
            KEV
          </span>
        )}
      </p>
      {hit.description && <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-4">{hit.description}</p>}
      {(hit.affected_products?.length ?? 0) > 0 && (
        <p className="mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
          affected: {hit.affected_products!.slice(0, 4).join(', ')}
          {hit.affected_products!.length > 4 ? '…' : ''}
        </p>
      )}
      {(hit.references?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-0.5">
          {hit.references!.slice(0, 3).map((ref, i) => (
            <li key={i} className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
              <a
                href={ref}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-600 dark:hover:text-brand-400"
              >
                {ref}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportsHitCard({ hit }: { hit: ListReportsResult }): JSX.Element {
  const reports = hit.reports ?? [];
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        Reports · {reports.length} match{reports.length === 1 ? '' : 'es'}
        {typeof hit.total === 'number' && hit.total !== reports.length && (
          <span className="ml-1 text-slate-500">(of {hit.total} total)</span>
        )}
      </p>
      {reports.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No matching reports.</p>
      ) : (
        <ul className="space-y-1.5">
          {reports.slice(0, 8).map((r) => (
            <ReportRow key={r.report_id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BriefingHitCard({ hit }: { hit: BriefingSummary }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
        Latest briefing
      </p>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{hit.title ?? hit.briefing_id}</p>
      <p className="mt-0.5 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
        {hit.type ?? 'unknown'} · {hit.date ?? '—'}
      </p>
      {hit.summary && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{hit.summary}</p>}
    </div>
  );
}

function ReportRow(props: {
  r: {
    report_id: string;
    title?: string;
    source?: string;
    published_at?: string;
    actor?: string;
    cves?: string[];
    summary?: string;
  };
}): JSX.Element {
  const r = props.r;
  return (
    <li className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5">
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{r.title ?? r.report_id}</p>
      <p className="mt-0.5 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
        {r.source ?? 'unknown'}
        {r.published_at ? ` · ${r.published_at}` : ''}
        {r.actor && <span className="ml-2 text-rose-600 dark:text-rose-400">actor: {r.actor}</span>}
        {r.cves && r.cves.length > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            cve: {r.cves.slice(0, 2).join(', ')}
            {r.cves.length > 2 ? '…' : ''}
          </span>
        )}
      </p>
      {r.summary && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{r.summary}</p>}
    </li>
  );
}
