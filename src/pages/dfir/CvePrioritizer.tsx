import { useEffect, useMemo, useState } from 'react';
import { SEVERITY_TONE, SEVERITY_BAR, type Severity as Sev } from '../../components/severity';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ToolDocs } from '../../components/dfir/ToolDocs';
import {
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  ShieldX,
  Info,
  Loader2,
  FileDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  scoreCve,
  decideCve,
  parseCvssVector,
  daysUntilDue,
  exportRowsToCsv,
  CVSS_FIELD_LABELS,
  ACTION_RUNBOOKS,
  type BatchCveLookup,
  type BatchVerdict,
  type AssetContext,
  type PriorityScore,
  type VerdictResult,
  type ExportRow,
} from '../../lib/dfir/cve-priority';

/**
 * CVE Exploit Prioritizer.
 *
 * Paste a list of CVE IDs. Each is enriched via /api/v1/cve/lookup
 * (NVD CVSS + FIRST EPSS + CISA KEV incl. known-ransomware use, public
 * PoCs, named threat actors) and reduced to a single patch-priority
 * verdict + a 0–100 score + a CVSS-vector breakdown + an action runbook.
 *
 *   ACT NOW  — CISA KEV, named adversary, or weaponised + high signal
 *   SCHEDULE — very-high EPSS, critical CVSS, or public PoC
 *   MONITOR  — elevated signal but no in-the-wild evidence
 *   DEFER    — low signal across all three sources
 *
 * The asset-context toggle adjusts the verdict for exposure: internal-
 * only assets drop network-only ACT NOW → SCHEDULE; internet-facing
 * assets bump critical-CVSS MONITOR → SCHEDULE.
 *
 * The math + verdict rules + CVSS vector parsing all live in
 * `src/lib/dfir/cve-priority.ts` as pure functions so they're
 * unit-testable in isolation.
 */

/**
 * Per-severity icon + text tint. `chip` (pill tone) and `bar` (solid fill)
 * come from the canonical SEVERITY_TONE / SEVERITY_BAR tables; only the icon
 * glyph and the standalone text tint live here, aligned to the canonical
 * ramp (critical=rose, high=orange, medium=amber, low=slate, info=sky).
 */
const SEV_STYLE: Record<Sev, { text: string; chip: string; bar: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: SEVERITY_TONE.critical,
    bar: SEVERITY_BAR.critical,
    Icon: ShieldX,
  },
  high: {
    text: 'text-orange-700 dark:text-orange-300',
    chip: SEVERITY_TONE.high,
    bar: SEVERITY_BAR.high,
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-300',
    chip: SEVERITY_TONE.medium,
    bar: SEVERITY_BAR.medium,
    Icon: AlertTriangle,
  },
  low: { text: 'text-slate-600 dark:text-slate-300', chip: SEVERITY_TONE.low, bar: SEVERITY_BAR.low, Icon: Info },
  info: { text: 'text-sky-700 dark:text-sky-300', chip: SEVERITY_TONE.info, bar: SEVERITY_BAR.info, Icon: Info },
};

const VERDICT_SEV: Record<BatchVerdict, Sev> = {
  'ACT NOW': 'critical',
  SCHEDULE: 'high',
  MONITOR: 'medium',
  DEFER: 'low',
};
const VERDICT_RANK: Record<BatchVerdict, number> = { 'ACT NOW': 0, SCHEDULE: 1, MONITOR: 2, DEFER: 3 };

interface Row {
  id: string;
  loading: boolean;
  error?: string;
  data?: BatchCveLookup;
  verdict?: VerdictResult;
  score?: PriorityScore;
  sev?: Sev;
  rank?: number;
}

const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const MAX = 60;

/** Hand-picked starter set covering the breadth of the verdict space. */
const STARTER_BUNDLES: Array<{ label: string; ids: string }> = [
  {
    label: 'Recent KEV (2024+)',
    ids: 'CVE-2024-3094, CVE-2024-21412, CVE-2024-1709, CVE-2024-23897',
  },
  {
    label: 'Era-defining KEV',
    ids: 'CVE-2021-44228, CVE-2023-23397, CVE-2014-0160, CVE-2017-0144',
  },
  {
    label: 'Mixed signal (test the verdicts)',
    ids: 'CVE-2021-44228, CVE-2014-0160, CVE-2023-23397, CVE-2024-3094, CVE-2020-1472',
  },
];

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CvePrioritizer(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('q') ?? '';
  const [input, setInput] = useState(initial);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [context, setContext] = useState<AssetContext>('unknown');
  const [filterVerdict, setFilterVerdict] = useState<BatchVerdict | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (input) setSearchParams({ q: input }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [input, setSearchParams]);

  useEffect(() => {
    if (initial) void run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Re-derive verdict + score whenever context changes — no re-fetch. */
  const decoratedRows = useMemo<Row[]>(() => {
    return rows.map((r) => {
      if (!r.data) return r;
      const verdict = decideCve(r.data, context);
      const score = scoreCve(r.data, context);
      return { ...r, verdict, score, sev: VERDICT_SEV[verdict.verdict], rank: VERDICT_RANK[verdict.verdict] };
    });
  }, [rows, context]);

  const sortedRows = useMemo(() => {
    return [...decoratedRows].sort(
      (a, b) => (a.rank ?? 9) - (b.rank ?? 9) || (b.score?.score ?? 0) - (a.score?.score ?? 0)
    );
  }, [decoratedRows]);

  const visibleRows = useMemo(() => {
    if (!filterVerdict) return sortedRows;
    return sortedRows.filter((r) => r.verdict?.verdict === filterVerdict);
  }, [sortedRows, filterVerdict]);

  const counts = useMemo(() => {
    const c: Record<BatchVerdict, number> = { 'ACT NOW': 0, SCHEDULE: 0, MONITOR: 0, DEFER: 0 };
    for (const r of sortedRows) if (r.verdict) c[r.verdict.verdict] += 1;
    return c;
  }, [sortedRows]);

  const run = async () => {
    const ids = Array.from(new Set((input.toUpperCase().match(CVE_RE) ?? []).map((s) => s.toUpperCase()))).slice(
      0,
      MAX
    );
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    setRunning(true);
    setRows(ids.map((id) => ({ id, loading: true })));
    setExpanded(new Set());
    setFilterVerdict(null);
    const results = await pool(ids, 5, async (id): Promise<Row> => {
      try {
        const r = await fetch(`/api/v1/cve/lookup?id=${encodeURIComponent(id)}`);
        if (!r.ok) return { id, loading: false, error: `lookup HTTP ${r.status}` };
        const data = (await r.json()) as BatchCveLookup;
        return { id, loading: false, data };
      } catch (e) {
        return { id, loading: false, error: (e as Error).message };
      }
    });
    setRows(results);
    setRunning(false);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const rowsToExport: ExportRow[] = sortedRows
      .filter((r) => r.data && r.verdict && r.score)
      .map((r) => ({
        cve_id: r.id,
        verdict: r.verdict!.verdict,
        score: r.score!.score,
        cvss: r.data!.cvss?.base_score,
        cvss_severity: r.data!.cvss?.severity,
        epss_percentile: r.data!.epss?.percentile,
        in_kev: r.data!.kev.in_kev,
        known_ransomware: r.data!.kev.known_ransomware === true,
        poc_count: r.data!.poc?.count ?? 0,
        actors: r.data!.actors ?? [],
        context,
        why: r.verdict!.why,
      }));
    if (rowsToExport.length === 0) return;
    downloadFile(
      `cve-prioritizer-${new Date().toISOString().slice(0, 10)}.csv`,
      exportRowsToCsv(rowsToExport),
      'text/csv'
    );
  };

  const exportJson = () => {
    const payload = sortedRows.map((r) => ({
      cve_id: r.id,
      verdict: r.verdict?.verdict,
      score: r.score?.score,
      factors: r.score?.factors,
      context,
      data: r.data,
      error: r.error,
    }));
    downloadFile(
      `cve-prioritizer-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2">CVE Exploit Prioritizer</h1>
        <p className="text-muted mb-3 max-w-2xl">
          Paste CVE IDs (any format — IDs are extracted). Each is enriched with NVD CVSS + FIRST EPSS + CISA KEV (incl.
          known-ransomware) + public PoC count + named-actor attribution and reduced to a single verdict, a 0-100 score,
          and a CVSS vector breakdown. CVSS alone over-prioritises — KEV + EPSS + PoCs + actor attribution + asset
          context is how you pick what to patch this week.
        </p>
      </div>

      <ToolDocs path="/dfir/cve-prioritizer" />

      {/* Starter bundles + context toggle. Two rows so the controls don't
          wrap into one wall of pills on narrow screens. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-mini font-mono uppercase tracking-[0.2em] text-slate-500">starters</span>
        {STARTER_BUNDLES.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => setInput(b.ids)}
            className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            {b.label}
          </button>
        ))}
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput('');
              setRows([]);
            }}
            className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
          >
            clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-mini font-mono uppercase tracking-[0.2em] text-slate-500">asset context</span>
        <div className="inline-flex rounded border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
          {(['internet-facing', 'unknown', 'internal-only'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContext(c)}
              className={
                context === c
                  ? 'text-mini font-mono uppercase tracking-wider px-2.5 py-1 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'text-mini font-mono uppercase tracking-wider px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }
              title={
                c === 'internet-facing'
                  ? 'External-facing asset — full weight on every signal.'
                  : c === 'internal-only'
                    ? 'Internal-only asset — reduce urgency for network-exposure CVEs.'
                    : 'Context unknown — apply a small reduction; rescore when exposure is known.'
              }
            >
              {c.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="cve-input" className="sr-only">
        CVE IDs
      </label>
      <textarea
        id="cve-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="CVE-2021-44228, CVE-2023-23397, CVE-2024-3094 …"
        rows={6}
        spellCheck={false}
        aria-label="CVE IDs"
        className="w-full px-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={running || !input.trim()}
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-brand-700 dark:hover:bg-brand-400"
      >
        {running && <Loader2 size={14} className="animate-spin" />}
        {running ? 'enriching…' : 'prioritize'}
      </button>

      {sortedRows.length > 0 && (
        <div className="mt-8 space-y-4">
          {/* Summary strip — verdict counts + export buttons. Click a
              count to filter the list below to that verdict. */}
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ACT NOW', 'SCHEDULE', 'MONITOR', 'DEFER'] as BatchVerdict[]).map((v) =>
                  counts[v] > 0 ? (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFilterVerdict(filterVerdict === v ? null : v)}
                      className={
                        filterVerdict === v
                          ? `text-mini font-mono uppercase tracking-wider px-2 py-1 rounded border-2 ${SEV_STYLE[VERDICT_SEV[v]].chip}`
                          : `text-mini font-mono uppercase tracking-wider px-2 py-1 rounded border ${SEV_STYLE[VERDICT_SEV[v]].chip} opacity-90 hover:opacity-100`
                      }
                    >
                      {counts[v]} {v}
                    </button>
                  ) : null
                )}
                <span className="text-mini font-mono text-slate-400 ml-2">{sortedRows.length} CVE(s)</span>
                {filterVerdict && (
                  <button
                    type="button"
                    onClick={() => setFilterVerdict(null)}
                    className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline ml-1"
                  >
                    clear filter
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                >
                  <FileDown size={11} /> CSV
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                >
                  <FileDown size={11} /> JSON
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            {visibleRows.map((r) => {
              const st = SEV_STYLE[r.sev ?? 'info'];
              const isOpen = expanded.has(r.id);
              const vec = parseCvssVector(r.data?.cvss?.vector);
              const days = daysUntilDue(r.data?.kev.due_date);
              return (
                <article
                  key={r.id}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
                >
                  <header className="flex items-start gap-2.5">
                    {r.loading ? (
                      <Loader2 size={16} className="mt-0.5 flex-shrink-0 animate-spin text-slate-400" />
                    ) : (
                      <st.Icon size={16} className={`mt-0.5 flex-shrink-0 ${st.text}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{r.id}</span>
                        {r.verdict && (
                          <span
                            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.chip}`}
                          >
                            {r.verdict.verdict}
                          </span>
                        )}
                        {r.verdict?.baseVerdict && (
                          <span
                            className="text-micro font-mono text-slate-400"
                            title={`Verdict adjusted for asset context (${context}). Without it: ${r.verdict.baseVerdict}.`}
                          >
                            (was {r.verdict.baseVerdict})
                          </span>
                        )}
                        {r.score && (
                          <span className="ml-auto inline-flex items-center gap-1.5">
                            <span className="text-micro font-mono uppercase tracking-wider text-slate-500">score</span>
                            <span className={`text-base font-bold tabular-nums ${st.text}`}>{r.score.score}</span>
                            <span className="text-micro font-mono text-slate-400">/100</span>
                          </span>
                        )}
                        {r.loading && <span className="text-mini font-mono text-slate-400">enriching…</span>}
                        {r.error && <span className="text-mini font-mono text-rose-500">{r.error}</span>}
                      </div>

                      {/* Score bar */}
                      {r.score && (
                        <div className="mt-2 h-1 w-full bg-slate-100 dark:bg-[rgb(var(--surface-300))] rounded overflow-hidden">
                          <div className={`h-full ${st.bar} transition-all`} style={{ width: `${r.score.score}%` }} />
                        </div>
                      )}

                      {/* Top-line signal row */}
                      {r.data && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-meta font-mono text-muted">
                          <span>
                            CVSS{' '}
                            <span className="text-slate-900 dark:text-slate-100">
                              {r.data.cvss ? `${r.data.cvss.base_score.toFixed(1)} ${r.data.cvss.severity}` : 'n/a'}
                            </span>
                            {vec.version && (
                              <span
                                className="ml-1 text-micro font-mono uppercase tracking-wider px-1 rounded border border-slate-300/60 dark:border-[rgb(var(--border-400))]/60 text-slate-500"
                                title={`CVSS v${vec.version} vector — scoring scales and field set differ from other versions.`}
                              >
                                v{vec.version}
                              </span>
                            )}
                            {vec.wormable && (
                              <span
                                className="ml-1 text-micro font-mono uppercase tracking-wider px-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                title="Network, low complexity, no auth, no UI — wormable shape."
                              >
                                wormable
                              </span>
                            )}
                          </span>
                          <span>
                            EPSS{' '}
                            <span className="text-slate-900 dark:text-slate-100">
                              {r.data.epss
                                ? `${(r.data.epss.score * 100).toFixed(1)}% · pct ${(r.data.epss.percentile * 100).toFixed(0)}`
                                : 'n/a'}
                            </span>
                          </span>
                          <span>
                            KEV{' '}
                            <span className={r.data.kev.in_kev ? st.text : 'text-slate-900 dark:text-slate-100'}>
                              {r.data.kev.in_kev ? 'yes' : 'no'}
                            </span>
                            {r.data.kev.in_kev && days !== undefined && (
                              <span
                                className={
                                  'ml-1 ' +
                                  (days < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : days <= 7
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-500')
                                }
                                title={`CISA due date: ${r.data.kev.due_date}`}
                              >
                                {days < 0 ? `OVERDUE ${Math.abs(days)}d` : days === 0 ? 'due today' : `${days}d to due`}
                              </span>
                            )}
                          </span>
                          <span>
                            Ransomware{' '}
                            <span
                              className={r.data.kev.known_ransomware ? st.text : 'text-slate-900 dark:text-slate-100'}
                            >
                              {r.data.kev.known_ransomware ? 'yes' : 'no'}
                            </span>
                          </span>
                          <span>
                            Public PoC{' '}
                            <span
                              className={(r.data.poc?.count ?? 0) > 0 ? st.text : 'text-slate-900 dark:text-slate-100'}
                            >
                              {r.data.poc?.count ? `${r.data.poc.count} repo(s)` : 'none'}
                            </span>
                          </span>
                          {r.data.ghsa && (
                            <span>
                              GHSA{' '}
                              <a
                                href={sanitizeUrl(r.data.ghsa.url) || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                {r.data.ghsa.id}
                              </a>
                            </span>
                          )}
                          {r.data.source === 'circl' && (
                            <span
                              className="text-slate-500"
                              title="NVD was unreachable; record served from CIRCL fallback"
                            >
                              src CIRCL
                            </span>
                          )}
                        </div>
                      )}

                      {r.data?.actors && r.data.actors.length > 0 && (
                        <p className="text-meta font-mono mt-1.5">
                          <span className="text-slate-500 uppercase tracking-wider text-mini">actors</span>{' '}
                          {r.data.actors.map((ac) => (
                            <a
                              key={ac}
                              href={`/threatintel/actor-kb?q=${encodeURIComponent(ac)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-rose-600 dark:text-rose-400 hover:underline mr-2"
                            >
                              {ac}
                            </a>
                          ))}
                        </p>
                      )}

                      {r.verdict?.why && <p className="text-sm text-muted mt-2 leading-relaxed">{r.verdict.why}</p>}

                      {r.data && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(r.id)}
                          aria-expanded={isOpen}
                          className="mt-2 inline-flex items-center gap-1 text-mini font-mono uppercase tracking-[0.18em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          {isOpen ? 'collapse' : 'score breakdown, vector, runbook'}
                        </button>
                      )}

                      {isOpen && r.data && r.score && r.verdict && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {/* Score factor breakdown */}
                          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
                            <div className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                              Score factors
                            </div>
                            <ul className="space-y-1.5">
                              {r.score.factors.map((f) => (
                                <li key={f.label} className="text-meta font-mono">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-slate-700 dark:text-slate-300">{f.label}</span>
                                    <span
                                      className={
                                        f.contribution >= 0
                                          ? 'text-slate-900 dark:text-slate-100 tabular-nums'
                                          : 'text-rose-600 dark:text-rose-400 tabular-nums'
                                      }
                                    >
                                      {f.contribution >= 0 ? '+' : ''}
                                      {f.contribution.toFixed(1)}
                                    </span>
                                  </div>
                                  <div className="text-micro text-slate-500 leading-snug">{f.why}</div>
                                </li>
                              ))}
                              {r.score.factors.length === 0 && (
                                <li className="text-meta font-mono text-slate-500">No active factors.</li>
                              )}
                            </ul>
                          </div>

                          {/* CVSS vector breakdown */}
                          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
                            <div className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                              CVSS {vec.version ? `v${vec.version}` : ''} vector
                            </div>
                            {!r.data.cvss?.vector ? (
                              <p className="text-meta font-mono text-slate-500">No vector string in the NVD record.</p>
                            ) : (
                              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-mini font-mono">
                                {(
                                  [
                                    ['attack_vector', 'AV'],
                                    ['attack_complexity', 'AC'],
                                    ['privileges_required', 'PR'],
                                    ['user_interaction', 'UI'],
                                    ['scope', 'S'],
                                    ['confidentiality', 'C'],
                                    ['integrity', 'I'],
                                    ['availability', 'A'],
                                  ] as const
                                ).map(([key, code]) => {
                                  const raw = vec[key];
                                  const labelMap = CVSS_FIELD_LABELS[key] as Record<string, string>;
                                  const label = raw ? labelMap[raw] : '—';
                                  return (
                                    <div key={key} className="contents">
                                      <dt className="text-slate-500">{code}</dt>
                                      <dd className="text-slate-800 dark:text-slate-200 truncate" title={label}>
                                        {label}
                                      </dd>
                                    </div>
                                  );
                                })}
                              </dl>
                            )}
                          </div>

                          {/* Runbook + description */}
                          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 sm:col-span-2">
                            <div className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                              Runbook · {ACTION_RUNBOOKS[r.verdict.verdict].title}
                            </div>
                            <ol className="list-decimal pl-5 space-y-1 text-meta text-slate-700 dark:text-slate-300 leading-relaxed">
                              {ACTION_RUNBOOKS[r.verdict.verdict].steps.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ol>
                            {r.data.description && (
                              <details className="mt-3">
                                <summary className="text-mini font-mono text-slate-400 cursor-pointer">
                                  NVD description
                                </summary>
                                <p className="mt-1 text-meta text-muted leading-relaxed">{r.data.description}</p>
                              </details>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </header>
                </article>
              );
            })}
            {visibleRows.length === 0 && filterVerdict && (
              <p className="text-meta font-mono text-slate-500 text-center py-4">
                No CVEs match filter <span className="text-slate-700 dark:text-slate-300">{filterVerdict}</span>.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
