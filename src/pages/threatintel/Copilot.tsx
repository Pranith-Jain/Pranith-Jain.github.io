import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { sanitizeAiHtml } from '../../lib/sanitize-html';
import {
  ArrowLeft,
  Send,
  Sparkles,
  FileText,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Lightbulb,
  Search,
  Save,
  Shield,
  Globe,
  Database,
  Cpu,
} from 'lucide-react';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { BackLink } from '../../components/BackLink';
import { adminAuthHeaders } from '../../lib/admin-token';
import { buildReport, pollReport, type Report, type Progress } from '../../lib/threatintel/report-client';
import { exportReportPdf } from '../../lib/threatintel/report-pdf';
import { ReportView } from '../../components/threatintel/ReportView';

interface Source {
  name: string;
  items: number;
  data: unknown[];
}

interface CopilotResponse {
  query: string;
  query_type: string;
  narrative: string;
  sources: Source[];
  model_used: string;
  processed_at: string;
  _meta?: { total_sources: number; total_items: number };
  confidence?: {
    level: string;
    score: number;
    admiralty?: { reliability: string; credibility: number; label: string };
    sources_contributing: number;
    contradictory_sources: number;
    reasoning: string;
  };
}

const QUERY_EXAMPLES = [
  { label: 'CVE-2024-1709', type: 'CVE investigation', query: 'CVE-2024-1709' },
  { label: 'LockBit', type: 'Ransomware group', query: 'LockBit' },
  { label: 'Scattered Spider', type: 'Threat actor', query: 'Scattered Spider' },
  { label: '8.8.8.8', type: 'IP address', query: '8.8.8.8' },
];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  cve: { label: 'CVE', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  ip: { label: 'IP', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  domain: { label: 'Domain', color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  hash: { label: 'Hash', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  actor: { label: 'Actor', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  ransomware: {
    label: 'Ransomware',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  generic: {
    label: 'General',
    color: 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300',
  },
};

const CAPABILITY_GRID = [
  { icon: Shield, label: 'CVE Lookup', desc: 'Vulnerability context, exploits, patches' },
  { icon: Cpu, label: 'Threat Actors', desc: 'TTPs, campaigns, attribution' },
  { icon: Globe, label: 'IOC Triage', desc: 'IPs, domains, hashes, URLs' },
  { icon: Database, label: 'Ransomware Intel', desc: 'Groups, leaks, negotiations' },
];

// Pure regex markdown renderer. Receives an ALREADY-sanitized string — the
// DOMPurify strip happens in the effect below via dynamic import (see the
// no-restricted-imports rule: isomorphic-dompurify must not be static).
function renderMarkdown(safeMd: string): string {
  let html = safeMd
    .replace(/### (.+)/g, '<h3 class="text-base font-semibold mt-4 mb-1.5">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
    .replace(/# (.+)/g, '<h1 class="text-xl font-bold mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-mono">$1</code>'
    )
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, function (match) {
      if (match.includes('list-decimal')) {
        return `<ol class="space-y-1 my-1.5">${match}</ol>`;
      }
      return `<ul class="space-y-0.5 my-1.5">${match}</ul>`;
    });

  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<li')
      )
        return trimmed;
      return `<p class="text-sm leading-relaxed mb-2">${trimmed}</p>`;
    })
    .join('\n');
  return html;
}

export default function Copilot(): JSX.Element {
  const location = useLocation();
  const isStandalone = location.pathname === '/copilot';
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Full-report mode (heavyweight DO-backed pipeline) ──
  const [mode, setMode] = useState<'quick' | 'report'>('quick');
  const [template, setTemplate] = useState<string>('auto');
  const [tlp, setTlp] = useState<string>('AMBER');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const runReport = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setError(null);
      setReport(null);
      setProgress({ phase: 'queued', pct: 0, detail: 'Queued' });
      try {
        const id = await buildReport(q.trim(), template === 'auto' ? undefined : template, tlp);
        const r = await pollReport(id, setProgress);
        setReport(r);
        setProgress(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setProgress(null);
      }
    },
    [template, tlp]
  );

  const submit = useCallback(
    (q: string) => {
      if (mode === 'report') void runReport(q);
      else void investigate(q);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, runReport]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Pre-seed the input from ?q= — used by the "Ask the CTI Copilot" and
  // agent-investigator drill-down handoffs (these previously targeted the
  // now-removed Copilot Chat). The query lands in the input; the user hits
  // enter to run it.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) setQuery(q);
  }, [location.search]);

  // isomorphic-dompurify is heavy (pulls jsdom on SSR), so load it lazily and
  // only when there's a narrative to sanitize — mirrors the dynamic-import
  // pattern in CaseStudy/WikiArticle so dompurify stays in its own async chunk.
  const [narrativeHtml, setNarrativeHtml] = useState('');
  useEffect(() => {
    const md = result?.narrative;
    if (!md) {
      setNarrativeHtml('');
      return;
    }
    let cancelled = false;
    void (async () => {
      const { default: DOMPurify } = await import('isomorphic-dompurify');
      // 1) strip ALL model-emitted HTML to plain text, 2) render our trusted
      // markdown subset, 3) sanitize the RESULT. The final pass is defense in
      // depth: if renderMarkdown ever emits an attacker-influenced attribute
      // (e.g. a future link rule), it gets stripped before it reaches the DOM.
      const safeMd = DOMPurify.sanitize(md, { ALLOWED_TAGS: [] });
      const safe = await sanitizeAiHtml(renderMarkdown(safeMd));
      if (!cancelled) setNarrativeHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.narrative]);

  const investigate = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/copilot/investigate', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Investigation failed');
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const badge = result?.query_type ? TYPE_BADGES[result.query_type] : null;
  const hasResults = !!(result || report || loading || progress || error);

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-12 sm:py-16 text-slate-900 dark:text-white">
      {!isStandalone && (
        <BackLink
          to="/threatintel"
          className="mx-auto mb-8 flex max-w-3xl items-center gap-2 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 font-mono"
        >
          <ArrowLeft size={14} /> back
        </BackLink>
      )}

      {/* ── Hero (radar-style) ──────────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/10">
            <Sparkles className="h-8 w-8 text-brand-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Investigation Copilot</h1>
          <p className="max-w-xl text-base text-slate-500 dark:text-slate-400">
            AI-powered investigation of CVEs, threat actors, ransomware groups, IPs, and domains. Ask in plain English —
            get a sourced, structured report.
          </p>
        </div>

        {/* Mode + template + TLP */}
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 text-xs font-mono dark:border-[rgb(var(--border-400))]">
            <button
              onClick={() => setMode('quick')}
              aria-pressed={mode === 'quick'}
              className={`px-3 py-1.5 transition-colors ${mode === 'quick' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300 dark:hover:bg-[rgb(var(--surface-300))]'}`}
            >
              Quick answer
            </button>
            <button
              onClick={() => setMode('report')}
              aria-pressed={mode === 'report'}
              className={`px-3 py-1.5 transition-colors ${mode === 'report' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300 dark:hover:bg-[rgb(var(--surface-300))]'}`}
            >
              Full report
            </button>
          </div>
          {mode === 'report' && (
            <>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                aria-label="Report template"
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
              >
                <option value="auto">Auto template</option>
                <option value="ransomware-group">Ransomware Group</option>
                <option value="threat-actor">Threat Actor</option>
                <option value="cve">CVE / Vulnerability</option>
                <option value="ioc">IOC Dossier</option>
              </select>
              <select
                value={tlp}
                onChange={(e) => setTlp(e.target.value)}
                aria-label="TLP classification"
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
              >
                <option value="CLEAR">TLP:CLEAR</option>
                <option value="GREEN">TLP:GREEN</option>
                <option value="AMBER">TLP:AMBER</option>
                <option value="RED">TLP:RED</option>
              </select>
            </>
          )}
        </div>

        {/* Search input */}
        <div className="flex w-full flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              aria-label="Investigation query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit(query)}
              placeholder={
                mode === 'report'
                  ? 'Subject for a full report (group, actor, CVE, or IOC)…'
                  : 'Ask about any CVE, threat actor, ransomware group, IP, or domain…'
              }
              className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-14 text-base text-slate-900 shadow-e1 transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-brand-400"
              disabled={loading || !!progress}
            />
            <button
              onClick={() => submit(query)}
              aria-label={loading || progress ? 'Submitting query' : 'Submit query'}
              disabled={loading || !!progress || !query.trim()}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading || progress ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <span className="font-mono">
                <AlertTriangle size={14} className="mr-1 inline" /> {error}
              </span>
              <button
                onClick={() => investigate(query)}
                className="shrink-0 rounded border border-rose-400/60 px-3 py-1 font-mono text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
              >
                retry
              </button>
            </div>
          )}
        </div>

        {/* Quick examples (radar-style chips) */}
        {!hasResults && (
          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Lightbulb size={12} /> Try an example
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUERY_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => {
                    setQuery(ex.query);
                    investigate(ex.query);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-200 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <span className="text-slate-400">{ex.type}:</span> <span className="font-mono">{ex.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Capability grid (radar-style) */}
        {!hasResults && (
          <div className="mt-4 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
            {CAPABILITY_GRID.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-100))]"
              >
                <Icon className="h-5 w-5 text-brand-500" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Results (flow below the hero) ────────────────────────────────── */}
      <div className="mx-auto mt-12 w-full max-w-4xl space-y-6">
        {/* Report build progress */}
        {progress && !report && (
          <section
            role="status"
            aria-live="polite"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-e1 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]"
          >
            <div className="mb-2 flex items-center justify-between font-mono text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-brand-500" /> {progress.phase}
              </span>
              <span>{progress.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))]">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">{progress.detail}</p>
          </section>
        )}

        {/* Rendered report */}
        {report && <ReportView report={report} onExportPdf={() => void exportReportPdf(report)} />}

        {/* Loading (quick mode) */}
        {loading && !progress && (
          <div className="py-16 text-center">
            <Loader2 size={32} className="mx-auto mb-4 animate-spin text-brand-500" />
            <p className="font-mono text-sm text-slate-500 dark:text-slate-400">Gathering intelligence…</p>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-500">
              Querying threat data sources and generating narrative
            </p>
          </div>
        )}

        {/* Quick result */}
        {result && !loading && !report && (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-e1 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">{result.query}</h2>
                  {badge && (
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-400">
                <span>model: {result.model_used}</span>
                {result._meta && (
                  <span>
                    {result._meta.total_sources} sources · {result._meta.total_items} data points
                  </span>
                )}
                {result.confidence && (
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      result.confidence.score >= 70
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : result.confidence.score >= 40
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                    }`}
                    title={result.confidence.reasoning}
                  >
                    confidence: {result.confidence.score}/100 ({result.confidence.level})
                  </span>
                )}
                <span>{new Date(result.processed_at).toLocaleString()}</span>
              </div>

              {result.sources.length > 0 ? (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-[rgb(var(--border-400))]">
                  <div className="flex flex-wrap gap-1.5">
                    {result.sources.map((s, i) => (
                      <span
                        key={s.name}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
                      >
                        <span className="font-bold text-slate-400">{i + 1}.</span>
                        {s.name}
                        <span className="text-slate-400">({s.items})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-amber-600 dark:border-[rgb(var(--border-400))] dark:text-amber-400">
                  No structured sources — report based on general knowledge.
                </div>
              )}
            </div>

            {/* Narrative */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-6 py-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200)/0.4)]">
                <FileText size={15} className="text-brand-600 dark:text-brand-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Investigation Report</span>
                {result._meta && (
                  <span className="ml-auto font-mono text-[11px] text-slate-400">
                    {result._meta.total_items} data points across {result._meta.total_sources} sources
                  </span>
                )}
              </div>
              <div
                className="px-6 py-5 text-slate-800 dark:text-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-slate-100 [&_h2]:dark:border-[rgb(var(--border-400))] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_p]:text-slate-700 [&_p]:dark:text-slate-300 [&_ul]:space-y-0.5 [&_ul]:my-1.5 [&_ol]:space-y-1 [&_ol]:my-1.5 [&_li]:ml-4 [&_li]:pl-1 [&_li]:text-sm [&_li]:text-slate-700 [&_li]:dark:text-slate-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:dark:bg-[rgb(var(--surface-200))] [&_code]:text-xs [&_code]:font-mono [&_code]:text-brand-700 [&_code]:dark:text-brand-300"
                dangerouslySetInnerHTML={{ __html: narrativeHtml }}
              />
              <div className="border-t border-slate-100 px-6 pb-4 pt-2 dark:border-[rgb(var(--border-400))]">
                <FeedbackWidget targetType="copilot" targetId={query} compact />
              </div>
            </div>

            {/* Source details (collapsed) */}
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                <ExternalLink size={14} />
                Raw source data ({result.sources.length} sources)
              </summary>
              <div className="mt-3 space-y-3">
                {result.sources.map((s) => (
                  <details
                    key={s.name}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200)/0.3)]"
                  >
                    <summary className="cursor-pointer text-xs font-medium">
                      {s.name} ({s.items} items)
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto overflow-x-auto rounded bg-slate-100 p-2 font-mono text-[11px] dark:bg-[rgb(var(--surface-200))]">
                      {JSON.stringify(s.data, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </details>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  if (!result) return;
                  setSaving(true);
                  try {
                    const res = await fetch('/api/v1/threat-intel/assessments', {
                      method: 'POST',
                      headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
                      body: JSON.stringify({
                        title: `Copilot: ${result.query}`,
                        type:
                          result.query_type === 'cve'
                            ? 'cve'
                            : result.query_type === 'actor' || result.query_type === 'ransomware'
                              ? 'actor'
                              : 'general',
                        topic: result.query,
                        body: result.narrative,
                        sources: result.sources.map((s) => s.name),
                        confidence_score: result.confidence?.score ?? 0,
                        confidence_level: result.confidence?.level ?? 'unassessed',
                      }),
                    });
                    if (!res.ok) throw new Error('Failed to save');
                    setSaved(true);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to save assessment');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || saved}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 disabled:opacity-50 dark:border-[rgb(var(--border-400))]"
              >
                <Save size={12} /> {saved ? 'Saved' : saving ? 'Saving…' : 'Save as Assessment'}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([result.narrative], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${result.query.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 dark:border-[rgb(var(--border-400))]"
              >
                <FileText size={12} /> download .md
              </button>
              <button
                onClick={() => void investigate(query)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 dark:border-[rgb(var(--border-400))]"
              >
                <RefreshCw size={12} /> re-investigate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
