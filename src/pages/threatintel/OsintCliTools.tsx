import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Search, Terminal } from 'lucide-react';
import { CLI_TOOLS, CATEGORY_LABELS, type ToolCategory, type CliTool } from '../../data/threatintel/osint-cli-tools';
import { sanitizeUrl } from '../../lib/sanitize-url';

const ALL_CATS = Object.keys(CATEGORY_LABELS) as ToolCategory[];

export default function OsintCliTools(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialCat = searchParams.get('cat') as ToolCategory | null;
  const [activeCat, setActiveCat] = useState<ToolCategory | null>(
    initialCat && ALL_CATS.includes(initialCat) ? initialCat : null
  );

  const filtered = useMemo(() => {
    let list = CLI_TOOLS;
    if (activeCat) list = list.filter((t) => t.category === activeCat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.lang.toLowerCase().includes(q)
      );
    }
    return list;
  }, [query, activeCat]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    CLI_TOOLS.forEach((t) => {
      c[t.category] = (c[t.category] || 0) + 1;
    });
    return c;
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Terminal size={28} />}
      title="OSINT CLI Tools Directory"
      maxWidthClass="max-w-7xl"
      description="Curated directory of OSINT command-line tools organized by use case. 55+ tools across 10 categories — username hunting, email intel, domain recon, social media, dorking, and more."
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filtered.length} tools</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => {
            setActiveCat(null);
            setSearchParams({});
          }}
          className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
            !activeCat
              ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          All ({CLI_TOOLS.length})
        </button>
        {ALL_CATS.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCat(activeCat === cat ? null : cat);
              setSearchParams(activeCat === cat ? {} : { cat });
            }}
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
              activeCat === cat
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({counts[cat] || 0})
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tool) => (
          <ToolCard key={tool.name + tool.repo} tool={tool} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-500">No tools match your search.</div>
      )}
    </DataPageLayout>
  );
}

function ToolCard({ tool }: { tool: CliTool }): JSX.Element {
  return (
    <a
      href={sanitizeUrl(tool.repo)}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-all hover:border-brand-500/50 hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{tool.name}</span>
        <ExternalLink size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2">{tool.desc}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider">
          {CATEGORY_LABELS[tool.category]}
        </span>
        {tool.lang && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            {tool.lang}
          </span>
        )}
        {tool.stars && <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">★ {tool.stars}</span>}
      </div>
    </a>
  );
}
