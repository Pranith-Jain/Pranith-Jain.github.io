import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, FileText, ExternalLink, AlertTriangle, RefreshCw, Loader2, Lightbulb, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { AppFooter } from '../../components/AppFooter';


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
  domain: { label: 'Domain', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  hash: { label: 'Hash', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  actor: { label: 'Actor', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  ransomware: { label: 'Ransomware', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  generic: { label: 'General', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

function markdownToHtml(md: string): string {
  let html = md
    .replace(/### (.+)/g, '<h3 class="text-base font-semibold mt-4 mb-1.5">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
    .replace(/# (.+)/g, '<h1 class="text-xl font-bold mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, function(match) {
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
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<li')) return trimmed;
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const investigate = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/copilot/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
  };

  const badge = result?.query_type ? TYPE_BADGES[result.query_type] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      {!isStandalone && (
        <BackLink to="/threatintel" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono">
          <ArrowLeft size={14} /> back
        </BackLink>
      )}

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Sparkles className="text-brand-600 dark:text-brand-400" size={28} />
          Investigation Copilot
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
          AI-powered investigation of CVEs, threat actors, ransomware groups, IPs, domains, and more.
        </p>
      </div>

      {/* Search input */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && investigate(query)}
            placeholder="Ask about any CVE, threat actor, ransomware group, IP, or domain..."
            className="w-full pl-9 pr-14 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            disabled={loading}
          />
          <button
            onClick={() => investigate(query)}
            disabled={loading || !query.trim()}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded bg-brand-600 dark:bg-brand-500 hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </section>

      {/* Quick examples */}
      {!result && !loading && !error && (
        <div className="mb-10">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Lightbulb size={12} /> Try an example
          </p>
          <div className="flex flex-wrap gap-2">
            {QUERY_EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => { setQuery(ex.query); investigate(ex.query); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <span className="text-slate-400">{ex.type}:</span>{' '}
                <span className="text-slate-700 dark:text-slate-200 font-mono">{ex.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 p-4 flex items-start justify-between gap-3 mb-6">
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
            <AlertTriangle size={14} className="inline mr-1" /> {error}
          </div>
          <button onClick={() => investigate(query)} className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-rose-400/60 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10">retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 size={32} className="mx-auto mb-4 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">Gathering intelligence...</p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">Querying threat data sources and generating narrative</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold">{result.query}</h2>
                {badge && (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
              <span>model: {result.model_used}</span>
              {result._meta && (
                <span>{result._meta.total_sources} sources · {result._meta.total_items} data points</span>
              )}
              <span>{new Date(result.processed_at).toLocaleString()}</span>
            </div>

            {/* Sources summary */}
            {result.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap gap-1.5">
                  {result.sources.map((s, i) => (
                    <span key={s.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      <span className="text-[9px] text-slate-400 font-bold">{i + 1}.</span>
                      {s.name}
                      <span className="text-slate-400">({s.items})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.sources.length === 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-amber-600 dark:text-amber-400">
                No structured sources — report based on general knowledge.
              </div>
            )}
          </div>

          {/* Narrative */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
              <FileText size={15} className="text-brand-600 dark:text-brand-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Investigation Report
              </span>
              {result._meta && (
                <span className="ml-auto text-[11px] text-slate-400 font-mono">
                  {result._meta.total_items} data points across {result._meta.total_sources} sources
                </span>
              )}
            </div>
            <div
              className="px-6 py-5 text-slate-800 dark:text-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-slate-100 [&_h2]:dark:border-slate-800 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_p]:text-slate-700 [&_p]:dark:text-slate-300 [&_ul]:space-y-0.5 [&_ul]:my-1.5 [&_ol]:space-y-1 [&_ol]:my-1.5 [&_li]:ml-4 [&_li]:pl-1 [&_li]:text-sm [&_li]:text-slate-700 [&_li]:dark:text-slate-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:dark:bg-slate-800 [&_code]:text-xs [&_code]:font-mono [&_code]:text-brand-700 [&_code]:dark:text-brand-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(result.narrative) }}
            />
          </div>

          {/* Sources detail */}
          <details className="group">
            <summary className="text-sm font-medium text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-2">
              <ExternalLink size={14} />
              Raw source data ({result.sources.length} sources)
            </summary>
            <div className="mt-3 space-y-3">
              {result.sources.map((s) => (
                <details key={s.name} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                  <summary className="text-xs font-medium cursor-pointer">
                    {s.name} ({s.items} items)
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-slate-100 dark:bg-slate-900 text-[10px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                    {JSON.stringify(s.data, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </details>

          {/* Actions */}
          <div className="flex gap-2">
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
              className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 transition-colors"
            >
              <FileText size={12} /> download .md
            </button>
            <button
              onClick={() => investigate(query)}
              className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 transition-colors"
            >
              <RefreshCw size={12} /> re-investigate
            </button>
          </div>
        </div>
      )}

      {!isStandalone && (
        <AppFooter
          aboutTo="/threatintel/about"
          blurb="Investigations use Groq (primary) with Workers AI fallback. Queries are not stored or used for training."
        />
      )}
    </div>
  );
}
