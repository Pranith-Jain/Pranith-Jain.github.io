import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, X } from 'lucide-react';
import { SECTIONS, GROUP_META, MAIN_TOOL_COUNT, type Tool, type ToolGroup } from './tool-sections';
import { useFeatures, toolVisible } from '../../lib/features';

/**
 * Inline tool-search bar at the top of /dfir.
 *
 * Replaces the previous "Paste an indicator" IocDispatchInput. The IOC
 * dispatch flow is still available via /dfir/ioc-check (the first
 * surface in the Start Here panel below this bar), but the landing's
 * top affordance is now "find any of the 60+ tools fast" because
 * that's the more common entry path for a returning analyst who
 * already knows which tool they want.
 *
 * The Cmd+K palette has the same search index. This is the always-
 * visible inline equivalent for users who don't know about Cmd+K or
 * are on a touch device where keyboard shortcuts aren't reachable.
 * The two share the same SECTIONS source so a tool only needs to be
 * added in one place to surface in both.
 *
 * Scoring: path / label / description / use-case, in that priority.
 * Utility-tier tools take a small score penalty so the headline tools
 * surface first for broad queries (e.g. "hash" → IOC & Hash Checker
 * before the five hash-calculator utilities).
 */

interface IndexEntry {
  tool: Tool;
  section: string;
  group: ToolGroup;
  pathLower: string;
  labelLower: string;
  descLower: string;
  useCaseLower: string;
}

const INDEX: IndexEntry[] = SECTIONS.flatMap((s) =>
  s.tools.map((t) => ({
    tool: t,
    section: s.label,
    group: s.group,
    pathLower: t.path.toLowerCase(),
    labelLower: t.label.toLowerCase(),
    descLower: (t.desc ?? '').toLowerCase(),
    useCaseLower: (t.useCase ?? '').toLowerCase(),
  }))
);

function score(entry: IndexEntry, q: string): number {
  if (q === '') return 0;
  let s = 0;
  if (entry.pathLower.includes(q)) s += entry.pathLower.endsWith('/' + q) ? 10 : 6;
  if (entry.labelLower.startsWith(q)) s += 8;
  else if (entry.labelLower.includes(q)) s += 4;
  if (entry.descLower.includes(q)) s += 2;
  if (entry.useCaseLower.includes(q)) s += 1;
  if (entry.tool.utility) s -= 2;
  return s;
}

export function ToolSearchBar(): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const features = useFeatures();
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (q === '') return [];
    return INDEX.filter((e) => toolVisible(e.tool.requiresFlag, features))
      .map((e) => ({ ...e, _score: score(e, q) }))
      .filter((e) => e._score > 0)
      .sort((a, b) => (b._score !== a._score ? b._score - a._score : a.tool.label.localeCompare(b.tool.label)))
      .slice(0, 8);
  }, [q, features]);

  // Reset highlighted row when result set shrinks/changes so we never
  // end up with an active index past the end of the list.
  useEffect(() => {
    setActive(0);
  }, [q]);

  // Keep the active row in view as ↑/↓ moves through the list.
  useEffect(() => {
    if (!listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function handleKey(e: React.KeyboardEvent): void {
    if (hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[active];
      if (hit) navigate(hit.tool.path);
    } else if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <label
        htmlFor="dfir-tool-search"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-2"
      >
        <Search size={14} aria-hidden="true" /> Search the toolkit
      </label>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="dfir-tool-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Try 'ioc', 'rule', 'cve', 'detection lab', 'phishing'…"
          spellCheck={false}
          autoComplete="off"
          className="w-full pl-10 pr-10 py-3 min-h-[48px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-describedby="dfir-tool-search-help"
          aria-autocomplete="list"
          aria-controls="dfir-tool-search-results"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X size={11} /> clear
          </button>
        )}
      </div>
      <p
        id="dfir-tool-search-help"
        className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3"
      >
        <span>
          Searches {MAIN_TOOL_COUNT} tools by name, path, description, and use-case. ↑↓ to navigate, Enter to open.
        </span>
        <span className="hidden sm:inline">
          Power-user shortcut:{' '}
          <kbd className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-800">
            ⌘K
          </kbd>{' '}
          opens the same search as an overlay from anywhere on the site.
        </span>
      </p>

      {hits.length > 0 && (
        <ul
          ref={listRef}
          id="dfir-tool-search-results"
          role="listbox"
          aria-label="Tool search results"
          className="mt-3 grid gap-1.5 max-h-96 overflow-y-auto"
        >
          {hits.map((h, i) => {
            const Icon = h.tool.icon;
            const isActive = i === active;
            return (
              <li key={h.tool.path} data-idx={i} role="option" aria-selected={isActive}>
                <Link
                  to={h.tool.path}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-start gap-3 rounded border p-3 transition ${
                    isActive
                      ? 'border-brand-500/60 bg-brand-50/60 dark:bg-brand-900/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-brand-500/40'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className={`font-semibold text-sm ${
                          isActive ? 'text-brand-700 dark:text-brand-200' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {h.tool.label}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                        {GROUP_META[h.group].label.split(' ')[0]}
                      </span>
                      {h.tool.utility && (
                        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">utility</span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">{h.tool.path}</div>
                    {h.tool.desc && (
                      <div className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5 line-clamp-1">
                        {h.tool.desc}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <ArrowRight
                      size={14}
                      className="shrink-0 mt-1.5 text-brand-600 dark:text-brand-300"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {q !== '' && hits.length === 0 && (
        <p className="mt-3 text-xs font-mono text-amber-600 dark:text-amber-400">
          No tool matches &ldquo;{query.trim()}&rdquo;. Try a shorter keyword like &ldquo;hash&rdquo; or
          &ldquo;cve&rdquo;.
        </p>
      )}
    </section>
  );
}
