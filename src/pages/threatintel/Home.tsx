import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowRight, ExternalLink, Globe, Link2, Search, Users, X } from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';
import { WhatsNewBanner } from '../../components/threatintel/WhatsNewBanner';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { personalInfo } from '../../data/content';
import { AppHero } from '../../components/AppHero';
import { QuickActions, type QuickAction } from '../../components/QuickActions';
import { LivePulse } from '../../components/threatintel/LivePulse';
import { RecentToolsRow } from '../../components/RecentToolsRow';
import { SECTIONS, flattenTools, matchesQuery } from '../../data/threatintel-sections';

/**
 * Threat-Intel landing page — the SOLE entry point for sources, feeds, RSS,
 * news, briefings, and curated catalogues. /dfir keeps the interactive
 * tools; /threatintel keeps everything you READ.
 *
 * The pages themselves now live at /threatintel/<slug>; old /dfir/<slug>
 * URLs redirect via `MovedRedirect` in App.tsx so existing bookmarks keep
 * resolving (query string + hash preserved).
 *
 * If you add a new SOURCE / FEED / CATALOG, add the tile to
 * src/data/threatintel-sections.ts AND remove any matching tile from
 * src/components/dfir/ToolGrid.tsx so the two landings stay strictly disjoint.
 */

// SECTIONS imported from src/data/threatintel-sections.ts

/**
 * The 4 most-clicked surfaces on /threatintel, surfaced as Quick
 * actions directly below the AppHero. Solves the "I'm back, just
 * get me to the live intel" problem. The full 90-tool catalog
 * stays accessible via the search input + the section picker
 * below.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/threatintel/global-pulse',
    label: 'Global Pulse',
    description: 'Live 3D globe with 700+ events across 21 layers.',
    icon: Globe,
    badge: 'live',
  },
  {
    to: '/threatintel/live-iocs',
    label: 'Live IOCs',
    description: 'Streaming indicator feed from 12 providers.',
    icon: Activity,
    badge: 'live',
  },
  {
    to: '/threatintel/actor-kb',
    label: 'Actor KB',
    description: 'Threat-actor knowledge base with cross-references.',
    icon: Users,
  },
  {
    to: '/threatintel/cross-campaign',
    label: 'Cross-Campaign',
    description: 'Find connections across campaigns + actors + IOCs.',
    icon: Link2,
  },
];

export default function ThreatIntelHome(): JSX.Element {
  const totalTiles = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const allTools = useMemo(() => flattenTools(SECTIONS), []);
  const searchResults = useMemo(
    () => (query.trim() ? allTools.filter((t) => matchesQuery(t, query.trim())) : []),
    [allTools, query]
  );
  const isSearching = query.trim().length > 0;
  const { cat } = useParams<{ cat?: string }>();
  const activeSection = cat ? SECTIONS.find((s) => s.id === cat) : undefined;

  // Keyboard: '/' or 'Cmd/Ctrl+K' focuses the search; 'Esc' clears.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        return;
      }
      if (inField) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="w-full py-4 sm:py-8 text-slate-900 dark:text-slate-100 space-y-6 sm:space-y-8">
      {/* The page <h1> is provided by AppHero below ("Threat-intel
          platform") — no separate sr-only h1, which would create a
          second, near-duplicate top-level heading. */}
      {/* "What's new since your last visit" banner — silent on first
          visit / zero deltas. Reuses the localStorage marker key
          'threatintel-home'. */}
      <WhatsNewBanner />
      <LatestBriefingCard />
      <AppHero
        kicker="Privacy-first · Live edge feeds · No login · No tracking"
        title="Threat-intel platform"
        sub="CTI aggregator and DFIR analyst toolkit, both running on Cloudflare Workers. Pulls from ~30 public feeds — ransomware leak sites, CVE/KEV, malware samples, phishing URLs, social and Telegram, MyThreatIntel — plus multi-provider IOC enrichment and STIX 2.1 export. Coverage is a sample, not exhaustive."
        meta={
          <>
            {totalTiles} intel surfaces · by{' '}
            <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              {personalInfo.name}
            </Link>{' '}
            ·{' '}
            <Link to="/threatintel/about" className="text-brand-600 dark:text-brand-400 hover:underline">
              about
            </Link>{' '}
            · interactive tools:{' '}
            <Link to="/dfir" className="text-brand-600 dark:text-brand-400 hover:underline">
              /dfir
            </Link>
          </>
        }
      />

      {/* Live telemetry band — the page's one genuinely live asset (real
          threat counts) as the hero moment, directly under the headline.
          Replaces the old static StatBar; the surface/section/build meta it
          used to carry moves to the thin caption below. */}
      <div>
        <LivePulse />
        <p className="mt-2 px-1 font-mono text-mini text-slate-400">
          {totalTiles} intel surfaces · {SECTIONS.length} sections · build {__BUILD_DATE__}
        </p>
      </div>

      {/* Quick actions — the dock a returning analyst uses 90% of the
          time. Replaces the old "quick:" pill row (which had 6
          link-buttons in a flat row, hard to scan). Each tile now
          carries an icon, badge ("live"), and a one-line description
          so a returning user can self-orient at a glance. */}
      <QuickActions actions={QUICK_ACTIONS} accentClass="text-rose-600 dark:text-rose-400" tone="rose" />

      {/* Recently used — surfaces the last few tools the user actually
          opened (tracked in localStorage by the AppShell on every
          route change). Renders only after 2+ visits, so first-time
          visitors don't see an empty row. */}
      <RecentToolsRow section="threatintel" accentClass="text-rose-600 dark:text-rose-400" tone="rose" />
      {/* Search bar — '/' or Cmd/Ctrl+K to focus, Esc to clear */}
      <div className="relative mb-10">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every intel surface, catalog, feed…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-20 font-mono text-tool text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search intel surfaces"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-1.5 py-0.5 text-micro font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X size={11} /> clear
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-micro text-slate-400 sm:inline-flex">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-micro dark:border-slate-700 dark:bg-slate-800">
                /
              </kbd>
              <span>or</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-micro dark:border-slate-700 dark:bg-slate-800">
                ⌘K
              </kbd>
            </span>
          )}
        </div>
        {isSearching && (
          <div className="mt-2 font-mono text-mini text-slate-500">
            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}&rdquo;
            {searchResults.length === 0 && ' · try fewer or different keywords'}
          </div>
        )}
      </div>

      {!isSearching && !cat && (
        <section
          aria-label="Live across the platform"
          className="animate-fade-in-up rounded-2xl border border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white p-4 dark:border-slate-800 dark:from-slate-900/50 dark:to-slate-950/20 sm:p-5"
        >
          <LiveSnapshotPanel compact subtitle="live intel pulse across the platform" mbClass="mb-0" />
        </section>
      )}

      {isSearching ? (
        <section className="animate-fade-in-up mb-12">
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map(({ tool: t, section }) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span className="mt-0.5 inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                      {section.label}
                    </span>
                  </div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <h3 className="flex items-center gap-1 font-display font-semibold text-base text-slate-900 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-tool leading-relaxed text-slate-600 dark:text-slate-400">{t.desc}</p>
                </>
              );
              if (t.external) {
                return (
                  <li key={`${section.id}:${t.to}`}>
                    <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                      {inner}
                    </a>
                  </li>
                );
              }
              return (
                <li key={`${section.id}:${t.to}`}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
          {searchResults.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-tool text-slate-500 dark:border-slate-700">
              No matches. Searching across {allTools.length} intel surfaces, catalogs, and feeds.
            </div>
          )}
        </section>
      ) : activeSection ? (
        <section className="animate-fade-in-up mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-6 text-mini font-mono">
            <span className="text-slate-500">categories:</span>
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className={`px-3 py-1.5 rounded border ${
                  s.id === cat
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-brand-500/40'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
              {activeSection.label}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
              {activeSection.blurb} · {activeSection.tools.length}{' '}
              {activeSection.tools.length === 1 ? 'source' : 'sources'}
            </p>
            <p className="text-mini font-mono text-slate-400 mt-2">
              Reference only. Feeds refreshed at the edge each visit; verify indicators in your own environment.
            </p>
          </div>
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeSection.tools.map((t) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <ArrowRight
                      size={14}
                      className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-meta font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{t.desc}</p>
                </>
              );
              return t.external ? (
                <li key={t.to}>
                  <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                    {inner}
                  </a>
                </li>
              ) : (
                <li key={t.to}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="animate-fade-in-up mb-12">
          <div className="mb-5 border-t border-slate-200/70 pt-6 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold text-slate-700 dark:text-slate-300">
              Browse by category
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className="group surface-card p-5 transition hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-e2"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {s.label}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-meta font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{s.blurb}</p>
                <p className="mt-2 text-mini font-mono text-slate-400">
                  {s.tools.length} {s.tools.length === 1 ? 'source' : 'sources'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
