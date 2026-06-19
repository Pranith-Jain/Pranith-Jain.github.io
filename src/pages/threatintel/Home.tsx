import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { CATALOG, catalogSearch } from '../../data/threatintel-catalog';
import { ThreatIntelStructuredData } from '../../components/ToolStructuredData';

/**
 * Threat-Intel home page — redesigned following SaaS UX patterns from
 * Recorded Future, Huntress, Shodan, and VirusTotal.
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
    tone: 'text-rose-600 dark:text-rose-400 bg-white dark:bg-[rgb(18,18,24)] border-slate-200 dark:border-white/10',
    pages: 12,
  },
  {
    id: 'campaigns',
    label: 'Campaigns & Briefings',
    description: 'Track active and historical campaigns. Daily briefings, attribution, and cross-campaign correlation.',
    icon: Activity,
    href: '/threatintel/catalog?cat=campaigns',
    tone: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    pages: 8,
  },
  {
    id: 'darkweb',
    label: 'Dark Web & Ransomware',
    description: 'Monitor ransomware leak sites, dark web forums, breach disclosures, and criminal marketplaces.',
    icon: Flame,
    href: '/threatintel/catalog?cat=darkweb',
    tone: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    pages: 12,
    highlight: 'live',
  },
  {
    id: 'iocs',
    label: 'IOCs & Indicators',
    description: 'Live indicator feeds, enrichment, cross-correlation, and entity resolution across 12+ sources.',
    icon: Shield,
    href: '/threatintel/catalog?cat=iocs',
    tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
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
    tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    pages: 6,
  },
  {
    id: 'social',
    label: 'Social & Open Source',
    description:
      'Streaming intelligence from Telegram, X/Twitter, Reddit, and crypto scam feeds. Real-time social monitoring.',
    icon: Radio,
    href: '/threatintel/catalog?cat=social',
    tone: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
    pages: 11,
    highlight: 'live',
  },
  {
    id: 'malware',
    label: 'Malware Intelligence',
    description: 'Malware families, IOCs, sample metadata, supply chain packages, and sandbox analysis.',
    icon: Bug,
    href: '/threatintel/catalog?cat=malware',
    tone: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    pages: 6,
  },
  {
    id: 'feeds',
    label: 'Feeds & Sources',
    description:
      'Manage, quality-check, and schedule intelligence feeds. Source reliability scoring and health monitoring.',
    icon: Globe,
    href: '/threatintel/catalog?cat=feeds',
    tone: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
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

  useDocumentMeta({
    title: 'Threat Intel',
    description:
      'Live threat intelligence — ransomware activity, threat actors, IOCs, CVEs, dark web monitoring, and social media feeds.',
    section: 'Threat Intel',
    canonicalPath: '/threatintel',
    ogImage: '/og-threatintel.svg',
  });

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
    <div className="w-full py-4 sm:py-8 text-slate-900 dark:text-slate-100 space-y-6">
      <ThreatIntelStructuredData />
      <WhatsNewBanner />
      <LatestBriefingCard />

      {/* ── Hero — bold value prop + primary search ───────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-6 sm:p-8 lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brand-500/10 dark:bg-brand-400/10 blur-3xl"
        />
        <div className="relative">
          <div className="text-mini font-mono uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400 mb-3 inline-flex items-center gap-2">
            Free · No login · Live data
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight">
            See the threats.
            <br />
            Stop them before they strike.
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-3xl text-base sm:text-lg leading-relaxed">
            Monitor ransomware activity, track threat actors, enrich IOCs, and stay ahead of campaigns — live
            intelligence from 30+ public feeds, all in one place.
          </p>

          {/* Primary search — the VirusTotal/Shodan pattern */}
          <div className="mt-6 relative max-w-2xl">
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-24 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/20 dark:border-[#1e2030] dark:bg-[#0e0e15] dark:text-slate-100 dark:placeholder:text-slate-500"
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
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-[#1e2030] dark:bg-[#12121a] dark:text-slate-300 dark:hover:border-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Stats — Huntress "5M+ endpoints" pattern */}
          <div className="mt-6 flex flex-wrap gap-6 text-sm">
            {[
              { value: '30+', label: 'live feeds' },
              { value: '100+', label: 'intel pages' },
              { value: '12+', label: 'IOC sources' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-bold text-slate-900 dark:text-white">{stat.value}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
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
                    <Link
                      to={t.path}
                      className="group block h-full rounded-xl border border-slate-200 bg-white p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-rose-500/40 hover:shadow-e2 dark:border-[#1e2030] dark:bg-[#12121a]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Icon size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {category.label}
                        </span>
                      </div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 group-hover:text-rose-600 dark:text-slate-100 dark:group-hover:text-rose-400">
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
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#1e2030] p-10 text-center">
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
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-rose-500/40 hover:shadow-e2 dark:border-[#1e2030] dark:bg-[#12121a]"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 dark:bg-white/5 text-rose-600 dark:text-rose-400 shrink-0">
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
                      className="ml-auto text-slate-300 dark:text-slate-700 group-hover:text-rose-500 transition-colors shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── Collapsible: Live Intelligence */}
          <details className="group rounded-xl border border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white dark:border-[#1e2030] dark:from-[#12121a] dark:to-[#0e0e15]">
            <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Live Intelligence</h2>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
              <LivePulse />
              <LiveSnapshotPanel
                tone="rose"
                compact
                subtitle="real-time feed health across the platform"
                mbClass="mb-0"
              />
            </div>
          </details>

          {/* ── Collapsible: Explore by topic */}
          <details className="group rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]">
            <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Explore by topic</h2>
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
                      className={`group relative rounded-xl border p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-e2 ${cat.tone}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <Icon size={20} aria-hidden="true" />
                        {cat.highlight === 'live' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            live
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                        {cat.label}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {cat.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {cat.pages} pages
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          explore <ArrowRight size={10} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </details>

          {/* ── Collapsible: Getting started */}
          <details className="group rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]">
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
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 dark:bg-white/5 font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:border-rose-300 hover:text-rose-600 dark:border-[#1e2030] dark:bg-[#12121a] dark:text-slate-300 dark:hover:border-rose-600 dark:hover:text-rose-400 transition-colors"
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
  );
}
