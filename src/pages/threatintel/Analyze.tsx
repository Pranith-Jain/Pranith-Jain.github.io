import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  FileDown,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { detectType, detectHashSubtype } from '../../lib/dfir/indicator-client';
import { streamIoc } from '../../lib/dfir/api';
import type { ProviderResultWire, DoneEvent, Verdict } from '../../lib/dfir/types';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { recordHistory } from '../../lib/dfir/history';

type VerdictFilter = 'all' | Verdict | 'error' | 'unsupported';
type SortKey = 'source' | 'verdict' | 'score' | 'status';

const VERDICT_ORDER: Record<string, number> = {
  malicious: 0,
  suspicious: 1,
  unknown: 2,
  clean: 3,
  error: 4,
  unsupported: 5,
};

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function summaryIcon(verdict: Verdict) {
  if (verdict === 'malicious') return ShieldAlert;
  if (verdict === 'suspicious') return AlertCircle;
  if (verdict === 'clean') return ShieldCheck;
  return AlertCircle;
}

const FILTERS: { key: VerdictFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'malicious', label: 'Malicious' },
  { key: 'suspicious', label: 'Suspicious' },
  { key: 'clean', label: 'Clean' },
  { key: 'unknown', label: 'Unknown' },
  { key: 'error', label: 'Error' },
];

function scoreBarClass(score: number): string {
  if (score >= 70) return 'bg-rose-500';
  if (score >= 40) return 'bg-amber-500';
  if (score === 0) return 'bg-emerald-500';
  return 'bg-slate-400';
}

export default function Analyze(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('indicator') ?? '';
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('source');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterVerdict, setFilterVerdict] = useState<VerdictFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const streamCloseRef = useRef<(() => void) | null>(null);

  const detectedType = input ? detectType(input) : 'unknown';

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  };

  const sortedResults = [...results]
    .filter((r) => {
      if (filterVerdict === 'all') return true;
      if (filterVerdict === 'error') return r.status === 'error';
      if (filterVerdict === 'unsupported') return r.status === 'unsupported';
      return r.verdict === filterVerdict;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'source') return a.source.localeCompare(b.source) * dir;
      if (sortKey === 'verdict') return ((VERDICT_ORDER[a.verdict] ?? 9) - (VERDICT_ORDER[b.verdict] ?? 9)) * dir;
      if (sortKey === 'score') return (a.score - b.score) * dir;
      return a.status.localeCompare(b.status) * dir;
    });

  const flaggedCount = results.filter((r) => r.verdict === 'malicious' || r.verdict === 'suspicious').length;
  const cleanCount = results.filter((r) => r.verdict === 'clean').length;
  const respondedCount = results.filter((r) => r.status === 'ok').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const supportedCount = results.filter((r) => r.status !== 'unsupported').length;

  const runCheck = useCallback(() => {
    const val = input.trim();
    if (!val || detectedType === 'unknown') return;
    setStreaming(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setEligible([]);
    setExpanded(new Set());

    streamCloseRef.current?.();
    streamCloseRef.current = streamIoc(val, {
      onMeta: (m) => setEligible(m.providers),
      onResult: (r) => setResults((prev) => [...prev, r]),
      onDone: (s) => {
        setSummary(s);
        setStreaming(false);
        recordHistory({ tool: 'ioc', indicator: val, verdict: s.verdict, score: s.score });
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
      },
    });
  }, [input, detectedType]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runCheck();
  };

  useEffect(() => () => streamCloseRef.current?.(), []);

  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (initialInput && detectType(initialInput) !== 'unknown' && !streaming) {
      autoRanRef.current = true;
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  const exportJson = () => {
    downloadFile(
      `analyze-${input.trim()}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ indicator: input.trim(), type: detectedType, summary, results }, null, 2),
      'application/json'
    );
  };

  const exportCsv = () => {
    const header = 'source,status,verdict,score,tags,error';
    const rows = results.map((r) =>
      [r.source, r.status, r.verdict, String(r.score), r.tags.join(';'), r.error ?? '']
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(',')
    );
    downloadFile(
      `analyze-${input.trim()}-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...rows].join('\n'),
      'text/csv'
    );
  };

  const SortHeader = ({ label, sort }: { label: string; sort: SortKey }) => (
    <th
      scope="col"
      className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300"
      onClick={() => toggleSort(sort)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={sortKey === sort ? 'text-brand-500' : 'opacity-30'} />
      </span>
    </th>
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      maxWidthClass="max-w-6xl"
      icon={<Search size={28} />}
      title="Analysis Orchestration"
      description={
        <span className="text-sm font-mono">
          Multi-source observable enrichment — fans out to 45 threat intel providers in parallel and aggregates results
          into a structured verdict table. Inspired by IntelOwl's parallel analyzer pattern.
        </span>
      }
    >
      <form onSubmit={onSubmit} className="mb-8">
        <label htmlFor="analyze-input" className="sr-only">
          Observable
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              id="analyze-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="IP, domain, URL, hash, or email"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
            {input && detectedType !== 'unknown' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-brand-600 dark:text-brand-400 uppercase">
                {detectedType === 'hash'
                  ? (() => {
                      const sub = detectHashSubtype(input);
                      if (sub === 'md5') return 'MD5';
                      if (sub === 'sha1') return 'SHA-1';
                      if (sub === 'sha256') return 'SHA-256';
                      return 'HASH';
                    })()
                  : detectedType}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!input.trim() || detectedType === 'unknown' || streaming}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2"
          >
            {streaming ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {streaming ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        {input && detectedType === 'unknown' && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Unrecognized format. Accepted: IPv4, IPv6, domain, URL (with scheme), file hash (MD5/SHA-1/SHA-256), or
            email.
          </p>
        )}
      </form>

      {streaming && results.length === 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center animate-pulse">
          <Loader2 size={24} className="animate-spin mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-mono text-slate-500">Opening SSE stream to 45 providers…</p>
        </div>
      )}

      {summary && (
        <div
          className={`mb-6 rounded-xl border p-5 ${
            summary.verdict === 'malicious'
              ? 'border-rose-300 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-900/15'
              : summary.verdict === 'suspicious'
                ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/15'
                : 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/15'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = summaryIcon(summary.verdict);
                return (
                  <Icon
                    size={20}
                    className={
                      summary.verdict === 'malicious'
                        ? 'text-rose-600'
                        : summary.verdict === 'suspicious'
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                    }
                  />
                );
              })()}
              <h2 className="font-display font-bold text-lg">Composite Score</h2>
              <VerdictChip verdict={summary.verdict} />
            </div>
          </div>
          <div className="mb-3">
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${scoreBarClass(summary.score)}`}
                style={{ width: `${summary.score}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm text-slate-600 dark:text-slate-400">
            <span>
              score: <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.score}</span> / 100
            </span>
            <span>
              confidence: <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.confidence}</span>
            </span>
            <span>
              {respondedCount} of {results.length} providers responded
            </span>
            <span>
              {flaggedCount} flagged, {cleanCount} clean
            </span>
            {summary.admiralty && (
              <span className="text-slate-500">
                admiralty: <span className="font-semibold">{summary.admiralty.label}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterVerdict(f.key)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded border transition-colors ${
                    filterVerdict === f.key
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span className="ml-1 opacity-60">
                      {f.key === 'error'
                        ? errorCount
                        : f.key === 'unsupported'
                          ? results.filter((r) => r.status === 'unsupported').length
                          : results.filter((r) => r.verdict === f.key).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="text-[11px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                <FileDown size={11} /> CSV
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="text-[11px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                <FileDown size={11} /> JSON
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <SortHeader label="Provider" sort="source" />
                    <SortHeader label="Status" sort="status" />
                    <SortHeader label="Verdict" sort="verdict" />
                    <SortHeader label="Score" sort="score" />
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-slate-500"
                    >
                      Evidence
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-slate-500"
                    >
                      Tags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r) => {
                    const isExpanded = expanded.has(r.source);
                    return (
                      <tr
                        key={r.source}
                        className="border-t border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (isExpanded) next.delete(r.source);
                            else next.add(r.source);
                            return next;
                          })
                        }
                      >
                        <td className="px-2 py-2.5 text-slate-400">
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </td>
                        <td className="px-3 py-2.5 font-display font-semibold capitalize text-slate-900 dark:text-slate-100">
                          {r.source}
                          {r.cached && <span className="ml-2 text-[10px] text-brand-500">cached</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.status === 'ok' && <CheckCircle2 size={14} className="text-emerald-500" />}
                          {r.status === 'error' && <XCircle size={14} className="text-rose-500" />}
                          {r.status === 'unsupported' && <MinusCircle size={14} className="text-slate-400" />}
                        </td>
                        <td className="px-3 py-2.5">
                          <VerdictChip verdict={r.verdict} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${scoreBarClass(r.score)}`}
                                style={{ width: `${r.score}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 tabular-nums w-6">{r.score}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono text-slate-600 dark:text-slate-400 line-clamp-1">
                            {r.status === 'error'
                              ? (r.error ?? r.error_code ?? 'error')
                              : r.status === 'unsupported'
                                ? 'Not supported for this indicator type'
                                : r.source === 'secrets' && Array.isArray(r.raw_summary.finding_types)
                                  ? `${r.raw_summary.finding_count ?? 0} finding${
                                      (r.raw_summary.finding_count ?? 0) === 1 ? '' : 's'
                                    } · ${(r.raw_summary.finding_types as string[]).slice(0, 3).join(', ')}`
                                  : Object.keys(r.raw_summary).length > 0
                                    ? JSON.stringify(r.raw_summary).slice(0, 120) + '…'
                                    : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {r.status === 'error' && r.error_code && (
                              <span
                                className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                                  r.error_code === 'rate_limited'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    : r.error_code === 'upstream_5xx' ||
                                        r.error_code === 'upstream_4xx' ||
                                        r.error_code === 'unauthorized' ||
                                        r.error_code === 'forbidden'
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                      : r.error_code === 'timeout' || r.error_code === 'network'
                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                        : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
                                }`}
                              >
                                {r.error_code}
                                {r.error_status ? ` · ${r.error_status}` : ''}
                              </span>
                            )}
                            {r.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 truncate max-w-[100px]"
                              >
                                {t}
                              </span>
                            ))}
                            {r.tags.length > 3 && (
                              <span className="text-[10px] font-mono text-slate-400">+{r.tags.length - 3}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {expanded.size > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/50">
                {sortedResults
                  .filter((r) => expanded.has(r.source))
                  .map((r) => {
                    const secretFindings = Array.isArray(r.raw_summary.findings)
                      ? (r.raw_summary.findings as Array<Record<string, unknown>>).filter(
                          (f) => typeof f.type === 'string' && typeof f.redacted === 'string'
                        )
                      : [];
                    return (
                      <div key={`detail-${r.source}`} className="p-4 bg-slate-50/50 dark:bg-slate-900/30">
                        <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">
                          {r.source} — raw evidence
                        </h4>
                        {r.source === 'secrets' && secretFindings.length > 0 && (
                          <ul className="mb-3 space-y-1.5">
                            {secretFindings.map((f, i) => (
                              <li
                                key={`${f.type as string}-${i}`}
                                className="flex items-center gap-2 text-[12px] font-mono"
                              >
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                  {f.type as string}
                                </span>
                                <span className="text-rose-700 dark:text-rose-300 break-all">
                                  {f.redacted as string}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <pre className="text-[12px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {JSON.stringify(r.raw_summary, null, 2)}
                        </pre>
                        {r.fetched_at && (
                          <p className="mt-2 text-[10px] font-mono text-slate-400">
                            fetched: {new Date(r.fetched_at).toISOString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" /> {respondedCount} ok
            </span>
            <span className="inline-flex items-center gap-1">
              <XCircle size={12} className="text-rose-500" /> {errorCount} error
            </span>
            <span className="inline-flex items-center gap-1">
              <MinusCircle size={12} className="text-slate-400" /> {results.length - supportedCount} unsupported
            </span>
            <span className="text-slate-400">
              {eligible.length} providers eligible for {detectedType}
            </span>
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/15 p-4"
        >
          <p className="text-sm font-mono text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {!streaming && results.length === 0 && !error && !summary && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Search size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-mono text-slate-500">Enter an observable above to run a multi-source analysis</p>
          <p className="text-xs font-mono text-slate-400 mt-2">
            Fans out to 45 threat intel providers — Spamhaus, VirusTotal, AbuseIPDB, AlienVault OTX, ThreatFox, URLhaus,
            GreyNoise, and a local secrets regex bank
          </p>
        </div>
      )}
    </DataPageLayout>
  );
}
