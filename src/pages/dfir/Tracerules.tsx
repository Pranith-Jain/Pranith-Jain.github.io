import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Shield, Copy, Check } from 'lucide-react';
import { QUERIES, FORMATS, FORMAT_ICONS, FORMAT_COLORS, type QueryFormat } from '../../data/detection-queries';

export default function Tracerules(): JSX.Element {
  const [query, setQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<QueryFormat | 'all'>('all');
  const [tacticFilter, setTacticFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const tactics = [...new Set(QUERIES.map((q) => q.tactic))];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return QUERIES.filter(
      (r) =>
        (formatFilter === 'all' || r.format === formatFilter) &&
        (tacticFilter === 'all' || r.tactic === tacticFilter) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.techniqueId.toLowerCase().includes(q) ||
          r.technique.toLowerCase().includes(q))
    );
  }, [query, formatFilter, tacticFilter]);

  const copyQuery = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> TRACERULES
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Curated detection query library across KQL, Sigma, and XQL. Filter by format, tactic, or technique. Copy
          queries directly for use in your SIEM.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search queries by title, technique, or keyword…"
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormatFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors ${
                formatFilter === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted'
              }`}
            >
              All
            </button>
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormatFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors ${
                  formatFilter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <select
            value={tacticFilter}
            onChange={(e) => setTacticFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Tactics</option>
            {tactics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {filtered.length} {filtered.length === 1 ? 'query' : 'queries'} loaded
      </p>

      <div className="space-y-4">
        {filtered.map((rule) => {
          const FIcon = FORMAT_ICONS[rule.format];
          const isOpen = expanded === rule.id;
          return (
            <div
              key={rule.id}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : rule.id)}
                className="w-full text-left p-5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.6)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FIcon size={14} className="text-slate-400" />
                      <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {rule.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{rule.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded border ${FORMAT_COLORS[rule.format]}`}
                      >
                        {rule.format}
                      </span>
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]">
                        {rule.tactic}
                      </span>
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                        {rule.techniqueId}
                      </span>
                      {rule.platform.map((p) => (
                        <span
                          key={p}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-5 bg-slate-50 dark:bg-[rgb(var(--input-200)/0.6)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Query</span>
                    <button
                      type="button"
                      onClick={() => copyQuery(rule.id, rule.query)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono text-muted bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.6)] transition-colors"
                    >
                      {copiedId === rule.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === rule.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-4 py-3 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {rule.query}
                  </pre>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="text-micro font-mono text-slate-400">Coverage:</span>
                    {rule.coverage.map((c) => (
                      <span
                        key={c}
                        className="text-micro font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12 font-mono">
          No detection queries match your filter.
        </p>
      )}

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">
        H3AD-DETECT / TRACERULES · {QUERIES.length} rules · KQL · Sigma · XQL
      </p>
    </div>
  );
}
