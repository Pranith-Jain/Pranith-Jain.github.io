import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Plug, Search, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';

interface McpTool {
  name: string;
  description: string;
  category: string;
}

interface McpManifest {
  name: string;
  version: string;
  endpoint: string;
  transport: string;
  description: string;
  toolCount: number;
  auth: { type: string; header: string; altHeader: string; note: string };
  tools: McpTool[];
}

const CATEGORY_COLORS: Record<string, string> = {
  si: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  domain: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  hudson:
    'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  intel: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  ioc: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  cve: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  analysis:
    'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  notebook:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  breach: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  actor:
    'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  phishing: 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  detection: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  osint: 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800',
  pdns: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  search: 'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800',
  exposure:
    'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  other: 'bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const CARD =
  'rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';
const INPUT =
  'w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500';

function ToolCard({ tool, isExpanded, onToggle }: { tool: McpTool; isExpanded: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const catCls = CATEGORY_COLORS[tool.category] ?? CATEGORY_COLORS.other;

  const copyName = () => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`${CARD} overflow-hidden transition-all hover:shadow-e2`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
      >
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${catCls}`}>
          {tool.category}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">{tool.name}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{tool.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1 mt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyName();
            }}
            className="p-1 rounded text-slate-400 hover:text-brand-500 transition-colors"
            title="Copy tool name"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-3 space-y-2">
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{tool.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">MCP name:</span>
            <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300">
              {tool.name}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">Category:</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catCls}`}>{tool.category}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function McpToolsExplorer() {
  const { data: manifest, loading, error } = useDataFetch<McpManifest>({ url: '/mcp-manifest.json', ttl: 300_000 });
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    if (!manifest?.tools) return [];
    const cats: Record<string, number> = {};
    manifest.tools.forEach((t) => {
      cats[t.category] = (cats[t.category] || 0) + 1;
    });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [manifest]);

  const filtered = useMemo(() => {
    if (!manifest?.tools) return [];
    let list = manifest.tools;
    if (activeCategory) list = list.filter((t) => t.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [manifest, query, activeCategory]);

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(filtered.map((t) => t.name)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Plug className="h-6 w-6" />}
      title="MCP Tools Explorer"
      description={`${manifest?.toolCount ?? '—'} tools across ${categories.length} categories — search, filter, and copy tool names for your MCP client.`}
      maxWidthClass="max-w-6xl"
      loading={loading}
      error={error}
      empty={!loading && !manifest}
      emptyMessage="MCP manifest not available."
    >
      {/* Stats */}
      {manifest && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1">
            {manifest.toolCount} tools
          </span>
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1">
            {categories.length} categories
          </span>
          <span className="rounded border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-1">
            v{manifest.version}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${manifest?.toolCount ?? '—'} tools…`}
          className={`${INPUT} pl-9 pr-3`}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`text-[11px] font-mono rounded-full border px-2.5 py-1 transition-colors ${activeCategory === null ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'}`}
        >
          All ({manifest?.toolCount ?? 0})
        </button>
        {categories.map(([cat, count]) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`text-[11px] font-mono rounded-full border px-2.5 py-1 transition-colors ${activeCategory === cat ? `${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other} border-current` : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'}`}
          >
            {cat} ({count})
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {filtered.length} tool{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={expandAll}
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            Expand all
          </button>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Tool grid */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
            No tools match your search.
          </div>
        ) : (
          filtered.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              isExpanded={expanded.has(tool.name)}
              onToggle={() => toggle(tool.name)}
            />
          ))
        )}
      </div>
    </DataPageLayout>
  );
}
