/**
 * Browser for the TI-Mindmap-Hub MCP report catalog.
 *
 * Renders a paginated list (50 per page) of all reports on the upstream
 * platform (1,628+ at time of writing), with:
 *   - search by keyword (calls list_reports with `search`)
 *   - source filter (calls list_reports with `source`)
 *   - time-range filter (7d / 30d / 90d)
 *
 * Each row has a "Load into analyzer" button that fetches the report's
 * raw text via get_report_content(report_id, 'raw') and hands it to the
 * parent via the `onLoad` callback -- the parent can then run the local
 * /api/v1/report-analyzer pipeline on it.
 *
 * The local sample list in the AI Report page is the fast/offline path;
 * this browser is the live path for the entire upstream catalog.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Search } from 'lucide-react';
import {
  listReports,
  getReportContent,
  idForReport,
  type TiReportSummary,
  type ListReportsResult,
} from '../../lib/ti-mindmap-mcp';
import { useMcp, McpError } from './McpContext';

const PAGE_SIZE = 25;

export interface LoadedReport {
  reportId: string;
  title: string;
  source?: string;
  publishedAt?: string;
  url?: string;
  text: string;
}

export function McpReportBrowser(props: {
  /** Called when the user picks a report and we have its raw text. */
  onLoad: (r: LoadedReport) => void;
}): JSX.Element {
  const { apiKey, status, statusMsg } = useMcp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [timeRange, setTimeRange] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [busy, setBusy] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [data, setData] = useState<ListReportsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (p: number, s: string, tr: typeof timeRange): Promise<void> => {
      if (status !== 'connected' || !apiKey) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await listReports(apiKey, {
          search: s || undefined,
          timeRange: tr === 'all' ? undefined : tr,
          limit: PAGE_SIZE,
        });
        setData(r);
        setPage(p);
      } catch (e) {
        const msg = e instanceof McpError ? e.message : e instanceof Error ? e.message : String(e);
        setErr(msg);
      } finally {
        setBusy(false);
      }
    },
    [apiKey, status]
  );

  useEffect(() => {
    void fetchPage(1, '', timeRange);
  }, [fetchPage, timeRange]);

  async function loadReport(s: TiReportSummary): Promise<void> {
    if (status !== 'connected' || !apiKey) return;
    const reportId = idForReport(s);
    setLoadingId(reportId);
    setErr(null);
    try {
      const raw = await getReportContent(apiKey, reportId, 'raw');
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      props.onLoad({
        reportId,
        title: s.title ?? reportId,
        source: s.source,
        publishedAt: s.published_at,
        url: s.url,
        text,
      });
    } catch (e) {
      const msg = e instanceof McpError ? e.message : e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setLoadingId(null);
    }
  }

  const reports = data?.reports ?? [];
  const total = data?.total ?? reports.length;
  const hasNext = reports.length === PAGE_SIZE && page * PAGE_SIZE < total;
  const hasPrev = page > 1;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Browse TI-Mindmap-Hub catalog</h3>
          <span className="ml-auto text-micro font-mono uppercase text-slate-500">
            {typeof total === 'number' ? `${total.toLocaleString()} reports` : 'live catalog'}
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            void fetchPage(1, searchInput, timeRange);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="search reports by keyword (ransomware, lazarus, apt29…)"
            className="flex-1 min-w-[12rem] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-sm text-slate-800 dark:text-slate-200"
            autoComplete="off"
            spellCheck={false}
          />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300"
          >
            <option value="all">all time</option>
            <option value="7d">last 7 days</option>
            <option value="30d">last 30 days</option>
            <option value="90d">last 90 days</option>
          </select>
          <button
            type="submit"
            disabled={busy || status !== 'connected'}
            className="inline-flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            search
          </button>
        </form>
        {search && (
          <p className="mt-2 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
            filter: <span className="text-slate-700 dark:text-slate-300">{search}</span>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                void fetchPage(1, '', timeRange);
              }}
              className="ml-2 text-rose-600 dark:text-rose-400 hover:underline"
            >
              clear
            </button>
          </p>
        )}
      </div>

      {err && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
          {err}
        </div>
      )}

      {reports.length === 0 && !busy && status === 'connected' && (
        <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">No reports match this filter.</p>
      )}

      {reports.length === 0 && !busy && status === 'unconfigured' && (
        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Catalog unavailable</p>
          <p>
            Add your TI-Mindmap-Hub API key in the header pill to load the 1,628+ reports from the upstream catalog.
          </p>
          <p>
            The key stays in your browser (localStorage) and is sent only to ti-mindmap-hub.com — never to our backend.
          </p>
        </div>
      )}

      {reports.length === 0 && !busy && status === 'error' && (
        <div className="p-4 text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
          <p className="font-semibold">Could not load the catalog.</p>
          {statusMsg && <p className="font-mono text-[11px] break-words">{statusMsg}</p>}
          <p>Click the MCP pill in the header to edit the key, then hit re-probe.</p>
        </div>
      )}

      {reports.length === 0 && !busy && status === 'probing' && (
        <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 justify-center w-full">
          <Loader2 className="h-3 w-3 animate-spin" /> probing MCP connection…
        </p>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[28rem] overflow-y-auto">
        {reports.map((r) => {
          const isLoading = loadingId === r.report_id;
          return (
            <li
              key={r.report_id}
              className="flex flex-wrap items-start gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                  {r.title ?? r.report_id}
                </p>
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
                  {r.tags && r.tags.length > 0 && (
                    <span className="ml-2 text-slate-500">{r.tags.slice(0, 3).join(' · ')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-slate-300 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                    title="Open original report"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void loadReport(r)}
                  disabled={isLoading || status !== 'connected'}
                  className="inline-flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  load into analyzer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {(hasPrev || hasNext) && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <button
            type="button"
            disabled={!hasPrev || busy}
            onClick={() => void fetchPage(page - 1, search, timeRange)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs disabled:opacity-50"
          >
            <ChevronLeft className="h-3 w-3" /> prev
          </button>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">page {page}</span>
          <button
            type="button"
            disabled={!hasNext || busy}
            onClick={() => void fetchPage(page + 1, search, timeRange)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs disabled:opacity-50 ml-auto"
          >
            next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
