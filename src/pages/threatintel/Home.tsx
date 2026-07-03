import { useEffect, useMemo, useRef, useState } from 'react';
import { PageMeta } from '../../components/PageMeta';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bug,
  Compass,
  Flame,
  Globe,
  Link2,
  Radio,
  Search,
  Shield,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';
import { WhatsNewBanner } from '../../components/threatintel/WhatsNewBanner';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { LivePulse } from '../../components/threatintel/LivePulse';
import { CATALOG, catalogSearch } from '../../data/threatintel-catalog';
import { ThreatIntelStructuredData } from '../../components/ToolStructuredData';
import { FaqStructuredData } from '../../components/FaqStructuredData';
import { BreadcrumbListSchema } from '../../components/BreadcrumbStructuredData';
import { THREATINTEL_FAQ } from '../../data/threatintel-faq';

/**
 * Threat-Intel home page — redesigned following SaaS UX patterns from
 * Recorded Future, Huntress, Shodan, and VirusTotal.
 *
 * Visual language (2026-06-19): one card surface, no rainbow category
 * tiles. Each category gets a tone-tinted icon and a 1px tone-tinted
 * hover border on a neutral surface-card. Hero uses a 1px rose-tinted
 * hairline accent instead of the old 224px blurred brand wash.
 *
 * Structure:
 *   1. Bold hero — "What is this?" in one sentence + primary search
 *   2. Live intelligence pulse — Real-time proof the platform works
 *   3. Category overview — 8 clean topic cards (NOT 100+ tools)
 *   4. Quick access — Most-used tools for returning users
 *   5. Getting started — 3-step guide for novices
 *   6. Full catalog — One click away
 *
 * The key insight from competitor research: don't dump 100+ tools on
 * the landing page. Show categories, each leading to a focused sub-page.
 * Users think in problems ("ransomware", "phishing"), not in tool names.
 */

/* ------------------------------------------------------------------ */
/*  Category cards — the primary navigation surface                    */
/* ------------------------------------------------------------------ */

interface CategoryCard {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  tone: string;
  pages: number;
  highlight?: string;
}

const CATEGORY_CARDS: CategoryCard[] = [
  {
    id: 'actors',
    label: 'Threat Actors',
    description:
      'Research APT groups, criminal organizations, and individual threat actors. TTPs, aliases, and infrastructure.',
    icon: Users,
    href: '/threatintel/catalog?cat=actors',
    tone: 'text-brand-600 dark:text-brand-400 hover:border-brand-500/40',
    pages: 12,
  },
  {
    id: 'campaigns',
    label: 'Campaigns & Briefings',
    description: 'Track active and historical campaigns. Daily briefings, attribution, and cross-campaign correlation.',
    icon: Activity,
    href: '/threatintel/catalog?cat=campaigns',
    tone: 'text-orange-600 dark:text-orange-400 hover:border-orange-500/40',
    pages: 8,
  },
  {
    id: 'darkweb',
    label: 'Dark Web & Ransomware',
    description: 'Monitor ransomware leak sites, dark web forums, breach disclosures, and criminal marketplaces.',
    icon: Flame,
    href: '/threatintel/catalog?cat=darkweb',
    tone: 'text-brand-600 dark:text-brand-400 hover:border-brand-500/40',
    pages: 12,
    highlight: 'live',
  },
  {
    id: 'iocs',
    label: 'IOCs & Indicators',
    description: 'Live indicator feeds, enrichment, cross-correlation, and entity resolution across 12+ sources.',
    icon: Shield,
    href: '/threatintel/catalog?cat=iocs',
    tone: 'text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/40',
    pages: 10,
    highlight: 'live',
  },
  {
    id: 'cves',
    label: 'CVEs & Vulnerabilities',
    description:
      'Browse CVEs by severity, exploit status, and vendor advisories. Kubernetes and cloud-specific CVE tracking.',
    icon: AlertTriangle,
    href: '/threatintel/catalog?cat=cves',
    tone: 'text-amber-600 dark:text-amber-400 hover:border-amber-500/40',
    pages: 6,
  },
  {
    id: 'social',
    label: 'Social & Open Source',
    description:
      'Streaming intelligence from Telegram, X/Twitter, Reddit, and crypto scam feeds. Real-time social monitoring.',
    icon: Radio,
    href: '/threatintel/catalog?cat=social',
    tone: 'text-violet-600 dark:text-violet-400 hover:border-violet-500/40',
    pages: 11,
    highlight: 'live',
  },
  {
    id: 'malware',
    label: 'Malware Intelligence',
    description: 'Malware families, IOCs, sample metadata, supply chain packages, and sandbox analysis.',
    icon: Bug,
    href: '/threatintel/catalog?cat=malware',
    tone: 'text-brand-600 dark:text-brand-400 hover:border-brand-500/40',
    pages: 6,
  },
  {
    id: 'feeds',
    label: 'Feeds & Sources',
    description:
      'Manage, quality-check, and schedule intelligence feeds. Source reliability scoring and health monitoring.',
    icon: Globe,
    href: '/threatintel/catalog?cat=feeds',
    tone: 'text-sky-600 dark:text-sky-400 hover:border-sky-500/40',
    pages: 9,
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ThreatIntelHome(): JSX.Element {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchResults = useMemo(() => (query.trim() ? catalogSearch(query) : null), [query]);
  const isSearching = query.trim().length > 0;

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
    <>
      <PageMeta
        title="Threat Intel"
        description="Live threat intelligence — ransomware activity, threat actors, IOCs, CVEs, dark web monitoring, and social media feeds."
        section="Threat Intel"
        canonicalPath="/threatintel"
        ogImage="/og-threatintel.svg"
      />
      <div className="w-full py-6 sm:py-10 text-slate-900 dark:text-slate-100 space-y-8 sm:space-y-12">
        <ThreatIntelStructuredData />
        <BreadcrumbListSchema
          items={[
            { name: 'Home', url: 'https://pranithjain.qzz.io' },
            { name: 'Threat Intel', url: 'https://pranithjain.qzz.io/threatintel' },
          ]}
        />
        <FaqStructuredData entries={THREATINTEL_FAQ} />
        <WhatsNewBanner />
        <LatestBriefingCard />
        <LivePulse />

        {/* ── Hero — bold value prop + primary search ───────────── */}
        {/* surface-card + tone-tinted 1px hairline replaces the old
          224px blurred brand wash. Same hierarchy, none of the
          AI-decorative feel. */}
        <section className="surface-elevated relative p-6 sm:p-10 lg:p-12">
          <div aria-hidden className="pointer-events-none absolute top-0 left-0 h-px w-12 bg-brand-500/60" />

          {/* Status ribbon — pulse + uptime + feed scope. The .live-pulse
            utility handles the breathe animation in one place. */}
          <div className="mb-5 sm:mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-mini uppercase tracking-[0.16em] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-brand-500 live-pulse" aria-hidden="true" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
              <span className="text-brand-600 dark:text-brand-400">Live</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              /
            </span>
            <span>18 feeds · 90s refresh · no login</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              /
            </span>
            <span>edge-hosted on Cloudflare</span>
          </div>

          {/* H1 — same treatment as the DFIR home: bigger, tighter, real
            display weight. The visual rule is the same on both landings
            so visitors who switch between them read it as one product. */}
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-bold leading-[0.95] tracking-[-0.04em] text-slate-900 dark:text-white">
            See the threats.
            <br className="hidden sm:inline" />
            <span className="sm:inline"> Stop them before they strike.</span>
          </h1>
          <p className="mt-5 sm:mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            Monitor ransomware activity, track threat actors, enrich IOCs, stay ahead of campaigns — live intelligence
            from 30+ public feeds, all in one place.
          </p>

          {/* Primary search — the VirusTotal/Shodan pattern */}
          <div role="search" className="mt-6 relative max-w-2xl">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actors, CVEs, campaigns, feeds, tools..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-24 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--input-200))] dark:text-slate-100 dark:placeholder:text-slate-500"
              aria-label="Search threat intelligence"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-xs font-mono text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                aria-label="Clear search"
              >
                <X size={12} /> clear
              </button>
            ) : (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-xs text-slate-400 sm:inline-flex">
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-700">
                  /
                </kbd>
                <span>or</span>
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-700">
                  ⌘K
                </kbd>
              </span>
            )}
          </div>

          {/* Popular shortcuts — Huntress "Solutions" pattern */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Popular:</span>
            {[
              { label: 'Ransomware Live', href: '/threatintel/ransomware-live' },
              { label: 'Actor KB', href: '/threatintel/actors/kb' },
              { label: 'CVE Intel', href: '/threatintel/cves/cves' },
              { label: 'Live IOCs', href: '/threatintel/iocs/live' },
            ].map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex items-center gap-1 surface-card rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Stat band — same hairline-divided treatment as the DFIR home so
              the two landings read as one product (big mono numerals + a
              sub-label per stat), not two differently-styled pages. */}
          <dl className="mt-7 sm:mt-9 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[rgb(var(--border-400))] border-y border-[rgb(var(--border-400))]">
            {[
              { value: '30+', label: 'Live feeds', sub: 'refreshed every 90s' },
              { value: '100+', label: 'Intel pages', sub: 'across 8 categories' },
              { value: '12+', label: 'IOC sources', sub: 'cross-correlated' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`flex flex-col gap-1.5 py-3 sm:py-4 ${i === 0 ? 'sm:pr-6' : i === 1 ? 'sm:px-6' : 'sm:pl-6'}`}
              >
                <dt className="font-mono text-micro uppercase tracking-[0.16em] text-slate-500">{stat.label}</dt>
                <dd className="font-display text-3xl sm:text-4xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">
                  {stat.value}
                </dd>
                <dd className="font-mono text-mini text-slate-500">{stat.sub}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Search results (when typing) ─────────────────────── */}
        {isSearching && (
          <section className="animate-fade-in-up">
            <div className="font-mono text-xs text-slate-500 mb-4">
              {searchResults?.length ?? 0} {searchResults?.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}
              &rdquo;
              {(searchResults?.length ?? 0) === 0 && ' — try fewer or different keywords'}
            </div>
            {searchResults && searchResults.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map(({ category, ...t }) => {
                  const Icon = t.icon ?? category.icon;
                  return (
                    <li key={t.path}>
                      <Link to={t.path} className="group block h-full surface-card card-hover p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Icon size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {category.label}
                          </span>
                        </div>
                        <h3 className="font-display text-sm font-semibold text-slate-900 group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                          {t.label}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{t.desc}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {searchResults && searchResults.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-10 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No matches. Try different keywords.</p>
              </div>
            )}
          </section>
        )}

        {/* ── Live intelligence + content ───────────────────────── */}
        {!isSearching && (
          <>
            {/* ── Quick access — always visible, no scrolling needed */}
            <section>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: 'Global Pulse',
                    desc: 'Live 3D threat map',
                    href: '/threatintel/predictive/global-pulse',
                    icon: Globe,
                    badge: 'live',
                  },
                  {
                    label: 'Ransomware Live',
                    desc: 'Active leak sites',
                    href: '/threatintel/ransomware-live',
                    icon: Flame,
                    badge: 'live',
                  },
                  { label: 'Actor KB', desc: 'Threat actor profiles', href: '/threatintel/actors/kb', icon: Users },
                  {
                    label: 'Cross-Campaign',
                    desc: 'Find hidden connections',
                    href: '/threatintel/campaigns/cross',
                    icon: Link2,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="group flex items-center gap-3 surface-card card-hover p-4"
                    >
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-50 dark:bg-white/5 text-brand-600 dark:text-brand-400 shrink-0">
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.label}
                          </h3>
                          {item.badge === 'live' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.desc}</p>
                      </div>
                      <ArrowRight
                        size={14}
                        className="ml-auto text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors shrink-0"
                      />
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* ── Live Intelligence — open by default: live proof the platform
                is working belongs above the fold on the threat-intel hub. */}
            <details open className="group surface-card">
              <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                    Live Intelligence
                  </h2>
                </div>
                <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <LiveSnapshotPanel
                  tone="brand"
                  compact
                  subtitle="real-time feed health across the platform"
                  mbClass="mb-0"
                />
              </div>
            </details>

            {/* ── Explore by topic — open by default: these category cards are
                the hub's primary navigation, so they shouldn't be hidden behind
                a collapsed summary on landing. Secondary sections stay collapsed. */}
            <details open className="group surface-card">
              <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
                <div>
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                    Explore by topic
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    8 categories · {CATALOG.reduce((sum, h) => sum + h.pages.length, 0)} pages
                  </p>
                </div>
                <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CATEGORY_CARDS.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <Link
                        key={cat.id}
                        to={cat.href}
                        className={`group relative surface-card card-hover block p-4 sm:p-5 ${cat.tone}`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={16} aria-hidden="true" />
                          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                            {cat.label}
                          </h3>
                          {cat.highlight === 'live' && (
                            <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-brand-600 dark:text-brand-400">
                              <span className="relative inline-flex h-1 w-1">
                                <span
                                  className="absolute inset-0 rounded-full bg-brand-500 live-pulse"
                                  aria-hidden="true"
                                />
                                <span className="relative inline-block h-1 w-1 rounded-full bg-brand-500" />
                              </span>
                              live
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">
                          {cat.description}
                        </p>
                        <dl className="mt-3 flex items-center justify-between border-t border-[rgb(var(--border-400))] pt-2 font-mono text-[10px]">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <dt className="uppercase tracking-wider opacity-70">pages</dt>
                            <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                              {cat.pages}
                            </dd>
                          </div>
                          <span className="inline-flex items-center gap-0.5 text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            open
                            <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </dl>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </details>

            {/* ── Collapsible: Getting started */}
            <details className="group surface-card">
              <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">New here?</h2>
                <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      step: '1',
                      title: 'Pick a topic',
                      desc: "Choose one of the categories above that matches what you're investigating.",
                    },
                    {
                      step: '2',
                      title: 'Explore the tools',
                      desc: 'Each category has focused dashboards and tools — no need to search through everything.',
                    },
                    {
                      step: '3',
                      title: 'Go deep',
                      desc: 'Drill into specific actors, campaigns, or IOCs. Cross-reference across sources.',
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 dark:bg-white/5 font-mono text-sm font-bold text-brand-600 dark:text-brand-400">
                        {s.step}
                      </span>
                      <div>
                        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {s.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            {/* ── Full catalog link */}
            <div className="flex justify-center">
              <Link
                to="/threatintel/catalog"
                className="surface-card inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-600 dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
              >
                <Compass size={16} />
                Browse the full catalog
                <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                  {CATALOG.reduce((sum, h) => sum + h.pages.length, 0)} pages
                </span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
