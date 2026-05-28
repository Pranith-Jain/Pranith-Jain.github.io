import { useCallback, useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, FileText, Loader2, Download, AlertTriangle, Clock, Bug } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

interface ReportResponse {
  ok: boolean;
  title: string;
  markdown: string;
  query: string;
  generated_at: string;
  elapsed_ms: number;
  error?: string;
}

const EXAMPLES = ['CVE-2024-1709', 'LockBit', 'APT28', 'CVE-2023-34362', 'Lazarus Group'];

export default function ReportGeneratorPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  const generate = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/v1/report/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = (await res.json()) as ReportResponse;
      if (!data.ok) throw new Error(data.error ?? 'generation failed');
      setReport(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void generate(query);
  };

  const renderedHtml = useMemo(() => {
    if (!report) return '';
    const raw = marked.parse(report.markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [report]);

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Report Generator</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Generate an on-demand threat intelligence report for any CVE, threat actor, or security entity.
          AI-powered with live enrichment from NVD, CISA KEV, EPSS, and curated threat actor data.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 items-end mb-6 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="report-query" className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            Search entity
          </label>
          <input
            id="report-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CVE-2024-1709, LockBit, APT28, Lazarus Group…"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          {loading ? 'Generating…' : 'Generate report'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-[11px] font-mono text-slate-500 self-center">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => { setQuery(ex); void generate(ex); }}
            className="text-[11px] font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {report && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden animate-fade-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{report.title}</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={10} /> {(report.elapsed_ms / 1000).toFixed(1)}s
              </span>
            </div>
            <button
              type="button"
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-mono text-xs"
            >
              <Download size={12} /> Download .md
            </button>
          </div>
          <div
            className="p-6 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      )}

      {!report && !loading && !error && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Bug size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-mono text-slate-500">Enter a CVE ID, threat actor, or security entity above.</p>
          <p className="text-xs font-mono text-slate-400 mt-1">Reports include live enrichment from NVD, CISA KEV, EPSS, and curated threat actor data.</p>
        </div>
      )}
    </div>
  );
}
