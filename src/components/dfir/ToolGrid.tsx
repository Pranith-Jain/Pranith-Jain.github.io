import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search as SearchIcon, X } from 'lucide-react';
import { SECTIONS, EXTERNAL, TOOL_COUNT, type Tool, type Section, type ToolGroup } from './tool-sections';
import { useDebounce } from '../../hooks/useDebounce';

// Re-export so existing call sites (CommandPalette, DFIR.tsx) that previously
// imported these from ToolGrid keep working without churn.
export { SECTIONS, TOOL_COUNT };
export type { Tool, Section, ToolGroup };

const Card = memo(function Card({ tool }: { tool: Tool }): JSX.Element {
  const { path, label, desc, icon: Icon, external } = tool;
  const className =
    'group relative block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 ' +
    'transition-[transform,border-color,box-shadow] duration-200 ' +
    'hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] ' +
    'focus-visible:outline-none focus-visible:-translate-y-0.5 focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
  const inner = (
    <>
      {/* Left accent rail — reveals on hover/focus so a scanned grid gets
          directional weight instead of 90 identical flat cards. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] bg-brand-500 scale-y-0 origin-top transition-transform duration-200 group-hover:scale-y-100 group-focus-visible:scale-y-100"
      />
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 ring-1 ring-brand-200/60 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20 dark:group-hover:bg-brand-500 dark:group-hover:text-white">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
          {label}
          {external && <ExternalLink size={12} className="opacity-60" aria-hidden="true" />}
        </span>
      </div>
      {/* Prose, not mono — mono is for IOC/data, not tile descriptions. */}
      <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
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
});

const SectionBlock = memo(function SectionBlock({ section }: { section: Section }): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3 mt-2 flex-wrap">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
          {section.label}
        </h3>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          {section.blurb} · {section.tools.length} tool{section.tools.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.tools.map((t) => (
          <Card key={t.path} tool={t} />
        ))}
      </div>
    </div>
  );
});

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

export function ToolGrid({ group }: { group?: ToolGroup } = {}): JSX.Element {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 100);
  const q = debouncedQuery.trim();

  const baseSections = useMemo(() => (group ? SECTIONS.filter((s) => s.group === group) : SECTIONS), [group]);

  const filteredSections = useMemo(
    () =>
      baseSections
        .map((s) => ({
          ...s,
          tools: s.tools.filter((t) => matches(t, q)),
        }))
        .filter((s) => s.tools.length > 0),
    [baseSections, q]
  );
  // The "External resources" block only belongs on the full, ungrouped grid.
  const filteredExternal = useMemo(() => (group ? [] : EXTERNAL.filter((t) => matches(t, q))), [group, q]);

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
            className="w-full pl-9 pr-9 py-3 sm:py-2 min-h-[44px] sm:min-h-0 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-base sm:text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Search DFIR tools"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
        {q ? (
          <>
            {matchCount} match{matchCount === 1 ? '' : 'es'} for{' '}
            <span className="text-slate-700 dark:text-slate-300">"{q}"</span>
          </>
        ) : (
          <>
            {group ? baseSections.reduce((n, s) => n + s.tools.length, 0) : TOOL_COUNT} tools across{' '}
            {baseSections.length} categor{baseSections.length === 1 ? 'y' : 'ies'}. Everything runs client-side or
            through this site's edge worker. Nothing leaves your browser unless the tool page says otherwise.
          </>
        )}
      </p>

      {filteredSections.length === 0 && filteredExternal.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
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
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Curated tools and catalogs hosted elsewhere · {filteredExternal.length}
                  {q ? ` of ${EXTERNAL.length}` : ''} link{filteredExternal.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
