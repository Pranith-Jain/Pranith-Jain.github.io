import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search as SearchIcon, X } from 'lucide-react';
import { SECTIONS, EXTERNAL, TOOL_COUNT, type Tool, type Section } from './tool-sections';

// Re-export so existing call sites (CommandPalette, DFIR.tsx) that previously
// imported these from ToolGrid keep working without churn.
export { SECTIONS, TOOL_COUNT };
export type { Tool, Section };

function Card({ tool }: { tool: Tool }): JSX.Element {
  const { path, label, desc, icon: Icon, external } = tool;
  const className =
    'group block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors';
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <Icon size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
          {label}
          {external && <ExternalLink size={12} className="opacity-60" aria-hidden="true" />}
        </span>
      </div>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
    </>
  );
  if (external) {
    return (
      <a href={path} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={path} className={className}>
      {inner}
    </Link>
  );
}

function SectionBlock({ section }: { section: Section }): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3 mt-2 flex-wrap">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
          {section.label}
        </h3>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
          {section.blurb} · {section.tools.length} tool{section.tools.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.tools.map((t) => (
          <Card key={t.path} tool={t} />
        ))}
      </div>
    </div>
  );
}

function matches(tool: Tool, q: string): boolean {
  if (!q) return true;
  const haystack = `${tool.label} ${tool.desc} ${tool.path}`.toLowerCase();
  // Tokenise on whitespace; every token must match (AND).
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => haystack.includes(tok));
}

export function ToolGrid(): JSX.Element {
  const [query, setQuery] = useState('');
  const q = query.trim();

  const filteredSections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        tools: s.tools.filter((t) => matches(t, q)),
      })).filter((s) => s.tools.length > 0),
    [q]
  );
  const filteredExternal = useMemo(() => EXTERNAL.filter((t) => matches(t, q)), [q]);

  const matchCount = filteredSections.reduce((n, s) => n + s.tools.length, 0) + filteredExternal.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <div className="relative">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools (dmarc, kill chain, mcp, owasp, jwt…)"
            className="w-full pl-9 pr-9 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Search DFIR tools"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-500">
        {q ? (
          <>
            {matchCount} match{matchCount === 1 ? '' : 'es'} for{' '}
            <span className="text-slate-700 dark:text-slate-300">"{q}"</span>
          </>
        ) : (
          <>
            {TOOL_COUNT} tools across {SECTIONS.length} categories. Everything runs client-side or through this site's
            edge worker. Nothing leaves your browser unless the tool page says otherwise.
          </>
        )}
      </p>

      {filteredSections.length === 0 && filteredExternal.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-500">
          No tools match "{q}". Try a different keyword or{' '}
          <button onClick={() => setQuery('')} className="text-brand-600 dark:text-brand-400 hover:underline">
            clear the search
          </button>
          .
        </div>
      ) : (
        <>
          {filteredSections.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}

          {filteredExternal.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-3 mt-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                  External resources
                </h3>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
                  Curated tools and catalogs hosted elsewhere · {filteredExternal.length}
                  {q ? ` of ${EXTERNAL.length}` : ''} link{filteredExternal.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredExternal.map((t) => (
                  <Card key={t.path} tool={t} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
