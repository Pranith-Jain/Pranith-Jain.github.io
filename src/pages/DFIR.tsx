import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Filter as FilterIcon,
  GitBranch,
  Hash,
  Mail,
  Search,
  ShieldAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { MAIN_TOOL_COUNT, UTILITY_TOOLS } from '../components/dfir/tool-sections';
import { HUB_META, type HubMeta, type HubPage } from '../data/dfir-hubs';
import { ToolSearchBar } from '../components/dfir/ToolSearchBar';
import { personalInfo } from '../data/content';
import { AppHero } from '../components/AppHero';
import { catalogSearch } from '../data/dfir-catalog';

import { QuickActions, type QuickAction } from '../components/QuickActions';
import { RecentToolsRow } from '../components/RecentToolsRow';
import { CapabilityBand } from '../components/dfir/CapabilityBand';

/**
 * "Start here." Three tools, one prescribed sequence. Solves the hub
 * problem: a first-time visitor on the toolkit index doesn't know which
 * of the 60 tiles is the right place to start. This isn't "our best
 * three"; it's a 60-second onboarding path. Each pick has a concrete
 * "do this if you..." trigger, not a generic feature pitch.
 *
 * Ordering matters: IOC check is the universal entry, the lab/converter
 * pair is the detection-engineering loop, and CVE prioritizer is the
 * "I have a CVE number on my plate today" lookup. Three different jobs,
 * three different audiences. If a visitor only clicks one, they should
 * still land on something useful for them.
 */
interface StartHerePick {
  path: string;
  trigger: string;
  action: string;
}
const START_HERE: StartHerePick[] = [
  {
    path: '/dfir/ioc-check',
    trigger: 'You have one suspicious indicator (IP, domain, URL, or hash).',
    action: 'Paste it. 24 providers in parallel, cross-source consensus in under a second.',
  },
  {
    path: '/dfir/detection-lab',
    trigger: 'You write or evaluate detection rules.',
    action:
      'Author against a curated event corpus, see fires in seconds, then export through the Rule Converter to Sigma, KQL, SPL, EQL, Lucene, or YARA.',
  },
  {
    path: '/dfir/cve-prioritizer',
    trigger: 'You have a CVE ID and a stakeholder asking how worried to be.',
    action:
      'Get a verdict that combines CVSS, EPSS, CISA KEV, and ransomware-use signals into a single patch-priority call.',
  },
];

/**
 * Real cases that exercised the toolkit. The point of this panel: prove
 * the 60 tools aren't an inventory, they're a workshop. Each row links a
 * case study (already written, already publicly readable on this site)
 * to the specific tools it used, with a one-line description of what the
 * tool did inside the case. No telemetry; the anchor is the prose body
 * of the case study, which is the durable artefact.
 */
interface ToolCase {
  caseSlug: string;
  caseTitle: string;
  tools: { path: string; label: string }[];
  contribution: string;
}
const TOOL_CASES: ToolCase[] = [
  {
    caseSlug: '/projects/phishing-program-at-scale',
    caseTitle: 'Phishing program at scale (250+ incidents, −25% FPs)',
    tools: [
      { path: '/dfir/ioc-check', label: 'IOC & Hash Checker' },
      { path: '/dfir/email-defense', label: 'Email Defense' },
    ],
    contribution:
      'Cross-source consensus on the IOC checker is what re-classified ~12% of "suspicious, escalate" cases as single-feed false alarms. Email Defense pre-filtered the SPF/DKIM/DMARC posture of new vendor domains before any reply went out.',
  },
  {
    caseSlug: '/projects/dmarc-enforcement-1300-domains',
    caseTitle: 'DMARC enforcement across 1,300+ domains',
    tools: [{ path: '/dfir/email-defense', label: 'Email Defense / BEC Score' }],
    contribution:
      'The audit rules in Email Defense came directly from the failure modes seen in this rollout. Same code paths now live as the public scanner.',
  },
  {
    caseSlug: '/projects/dfir-toolkit-design',
    caseTitle: 'Building the toolkit itself: lab → converter loop',
    tools: [
      { path: '/dfir/detection-lab', label: 'Detection Lab' },
      { path: '/dfir/rule-converter', label: 'Rule Converter' },
    ],
    contribution:
      'The lab and converter are not independent tools; they are one detection-engineering loop. Author in the lab, prove the rule fires, export to the SIEM dialect you actually run. This is the pairing that justified shipping both.',
  },
  {
    caseSlug: '/projects/threat-intel-platform-build',
    caseTitle: 'Autonomous CTI pipeline (layer-1 + layer-2 IOC defence)',
    tools: [{ path: '/dfir/ioc-check', label: 'IOC & Hash Checker' }],
    contribution:
      'The same VT / AbuseIPDB / abuse.ch validators that power the public IOC checker also gate every IOC the autonomous case-study pipeline emits before it reaches a draft. The defence layer is shared, not duplicated.',
  },
];

const PROVIDER_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'Commercial (key required)',
    items: ['VirusTotal', 'AbuseIPDB', 'Shodan', 'OTX', 'URLScan', 'Hybrid Analysis'],
  },
  {
    label: 'abuse.ch (one shared free key)',
    items: ['ThreatFox', 'URLhaus', 'MalwareBazaar'],
  },
  {
    label: 'Public lists & DoH (no signup)',
    items: [
      'Spamhaus',
      'Tor Exit',
      'OpenPhish',
      'PhishStats',
      'CINS Army',
      'CIRCL Hashlookup',
      'Cloudflare DoH',
      'Quad9',
      'Bitwire',
      'Blocklist.de',
      'Binary Defense',
      'Ipsum',
      'Phishing Army',
      'TweetFeed',
      'crt.sh',
      'RDAP',
    ],
  },
];

/**
 * The 4 most-clicked surfaces in the DFIR toolkit, surfaced as
 * "Quick actions" directly below the AppHero. Solves the "I'm back,
 * just get me to the thing" problem: a returning analyst doesn't
 * need the prescribed Start-here sequence, the Featured grid, or the
 * category picker — they need IOC check / search / rule converter /
 * CVE prioritizer in one row of large tiles.
 *
 * The `hint` field on the search action renders the ⌘K shortcut so
 * keyboard-first users see the affordance inline (TopBar also has
 * the same hint, but reinforcing it on the landing increases
 * discoverability for first-time visitors).
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/dfir/ioc-check',
    label: 'IOC Check',
    description: 'Streaming verdicts across 24 providers in parallel.',
    icon: Hash,
  },
  {
    to: '/dfir/email-defense',
    label: 'Email Defense',
    description: 'SPF / DKIM / DMARC / BIMI audit with failure modes called out.',
    icon: Mail,
  },
  {
    to: '/dfir/rule-converter',
    label: 'Rule Converter',
    description: 'Sigma ↔ KQL ↔ SPL ↔ YARA via one canonical IR.',
    icon: GitBranch,
  },
  {
    to: '/dfir/cve-prioritizer',
    label: 'CVE Prioritizer',
    description: 'CVSS + EPSS + KEV + ransomware-use in one call.',
    icon: ShieldAlert,
  },
];

export default function DFIRPage(): JSX.Element {
  return (
    <div className="w-full py-4 sm:py-8 text-slate-900 dark:text-slate-100 space-y-6 sm:space-y-8">
      <AppHero
        kicker="Privacy-first · No upload · No login · Local analysis only"
        title="DFIR & security toolkit"
        sub="Scanners, decoders, forensic parsers, lookups and frameworks that run entirely in your browser. Sub-200ms IOC checks across 22 sources, no signup, no key."
        meta={
          <>
            {MAIN_TOOL_COUNT} tools · by{' '}
            <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              {personalInfo.name}
            </Link>{' '}
            ·{' '}
            <Link to="/dfir/tools/about" className="text-brand-600 dark:text-brand-400 hover:underline">
              about
            </Link>{' '}
            · live feeds:{' '}
            <Link to="/threatintel" className="text-brand-600 dark:text-brand-400 hover:underline">
              /threatintel
            </Link>
          </>
        }
      />
      {/* Capability band — elevates the old static StatBar figures into the
          same operations-console cluster used on /threatintel, under a static
          TOOLKIT mark (no live feeds here to fake). Build date moves to the
          thin caption below. */}
      <div>
        <CapabilityBand />
        <p className="mt-2 px-1 font-mono text-mini text-slate-400">
          {MAIN_TOOL_COUNT} tools · client-side · build {__BUILD_DATE__}
        </p>
      </div>

      {/* Quick actions — the dock a returning analyst uses 90% of the
          time. Placed BEFORE the prose-y "Start here" sequence because
          it answers the "I'm back, get me in" question first; the
          prescribed onboarding below carries the first-time-visitor
          flow. Each tile has a one-line description so a returning
          user who's forgotten which tool is which can self-orient. */}
      <QuickActions actions={QUICK_ACTIONS} />

      {/* Recently used — surfaces the last few tools the user actually
          opened (tracked in localStorage by the AppShell on every
          route change). Renders only after the user has visited at
          least 2 distinct paths, so first-time visitors don't see an
          empty/half-empty row. Sits ABOVE the curated QuickActions so
          a power user gets to their last tool in one tap. */}
      <RecentToolsRow section="dfir" />

      {/* Tool search — inline equivalent of the Cmd+K palette. Replaces
          the previous "Paste an indicator" IOC-dispatch input that lived
          here; that flow is still one click away via the first "Start
          here" entry below (IOC & Hash Checker). For a returning analyst
          who knows which of the 60+ tools they want, this is the fastest
          path; for a first-time visitor, the prescribed Start-here
          sequence below carries the navigational weight. */}
      <ToolSearchBar />

      {/* Start here — 3-tool prescribed sequence for a first-time visitor.
          Solves the hub problem (60 tiles, no direction). Different from
          "Featured" below: that's editorial best-of; this is "if you only
          have 60 seconds, run one of these three." */}
      <section>
        <div className="flex items-baseline gap-3 mb-4">
          <Zap size={16} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Start here</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-3xl leading-relaxed">
          Three picks, one prescribed sequence. Skip the grid below if any of these match what's on your screen right
          now.
        </p>
        <ol className="stagger grid gap-3 sm:grid-cols-3">
          {START_HERE.map((p, i) => (
            <li key={p.path}>
              <Link
                to={p.path}
                className="group block h-full rounded-xl border border-brand-500/20 bg-brand-50/30 dark:bg-brand-900/10 p-4 hover:border-brand-500/60 transition"
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-mini text-brand-600 dark:text-brand-400">{`0${i + 1}`}</span>
                  <span className="font-mono text-mini uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {p.path.replace('/dfir/', '')}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1.5 leading-snug">
                  {p.trigger}
                </p>
                <p className="text-meta text-slate-600 dark:text-slate-400 leading-relaxed">{p.action}</p>
                <div className="mt-2.5 inline-flex items-center gap-1 text-mini font-mono text-brand-600 dark:text-brand-400 group-hover:underline">
                  open <ArrowRight size={11} aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="animate-fade-in-up">
        <div className="mb-6 flex items-baseline justify-between gap-3 border-t border-slate-200/70 pt-6 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">Pick a workbench</h2>
          <Link
            to="/dfir/catalog"
            className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            full catalog <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_META.map((h) => {
            const Icon = h.icon;
            return (
              <Link
                key={h.id}
                to={`/dfir/catalog?cat=${h.id}`}
                className="group surface-card p-5 transition hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-e2"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${h.tone}`}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    {h.label}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-tool text-slate-600 dark:text-slate-400 leading-relaxed">{h.blurb}</p>
                <p className="mt-2 font-mono text-mini text-slate-400">
                  {h.pages.length} {h.pages.length === 1 ? 'tool' : 'tools'}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Used in real cases — proves the toolkit isn't an inventory. Each
          row links a case study (already published on this site) to the
          specific tools the case exercised, with a sentence of context.
          Anchored to the prose body of the case study, not telemetry. */}
      <section>
        <details>
          <summary className="cursor-pointer rounded font-display text-xl font-bold text-slate-900 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-100 dark:hover:text-brand-400">
            Used in real cases{' '}
            <span className="font-mono text-mini font-normal text-slate-500 dark:text-slate-400">({TOOL_CASES.length})</span>
          </summary>
          <ul className="mt-5 space-y-3">
            {TOOL_CASES.map((tc) => (
              <li
                key={tc.caseSlug}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                  <Link
                    to={tc.caseSlug}
                    className="font-display font-semibold text-base text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {tc.caseTitle}
                  </Link>
                  <span className="text-mini font-mono text-slate-500 dark:text-slate-400">{tc.caseSlug}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{tc.contribution}</p>
                <div className="flex flex-wrap gap-1.5">
                  {tc.tools.map((t) => (
                    <Link
                      key={t.path}
                      to={t.path}
                      className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {/* Utilities & converters — duplicative of well-known online tools
          (timestamp converters, hex/base64 decoders, hash calculators).
          Surfaced behind a collapsible so the headline tool count reads
          as the real depth of the toolkit, not a padded list. Routes
          still resolve — nothing is deleted, only de-emphasised. */}
      {UTILITY_TOOLS.length > 0 && (
        <section>
          <details>
            <summary className="cursor-pointer rounded text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              Utilities &amp; converters ({UTILITY_TOOLS.length}). Encoders, hashes, timestamps
            </summary>
            <p className="mt-3 text-meta font-mono text-slate-500 max-w-2xl">
              These are duplicative of well-known online tools (CyberChef, epochconverter, etc.) — kept here for offline
              / client-side analysis when you can't send data outside your environment. Not where the toolkit's depth
              is.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {UTILITY_TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <li key={t.path}>
                    <Link
                      to={t.path}
                      className="group flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 px-3 py-2 hover:border-brand-500/40 transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-500 group-hover:text-brand-500 transition-colors shrink-0" />
                      <div className="min-w-0">
                        <div className="text-tool font-medium text-slate-900 dark:text-slate-100 truncate">
                          {t.label}
                        </div>
                        <div className="text-mini font-mono text-slate-500 truncate">{t.desc}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      <section className="pt-8 border-t border-slate-200/80 dark:border-slate-800/80">
        <details>
          <summary className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-6 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Data Sources
          </summary>
          <div className="space-y-5 mt-4">
            {PROVIDER_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">{group.label}</div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((p) => (
                    <span
                      key={p}
                      className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/* ── Full catalog embed ────────────────────────────────── */}
      <HomeCatalog />
    </div>
  );
}

/**
 * The full DFIR catalog embedded in the home page, with search + filter
 * chips. Mirrors the threatintel Home.tsx HomeCatalog (commit 4fb739ae,
 * 2026-06-17). Sits at the bottom of the page so a power-user can pivot
 * to any tool without leaving the home view; the dedicated
 * /dfir/catalog page is the bookmarkable copy of this same widget.
 */
const BADGE_STYLES: Record<NonNullable<HubPage['badge']>, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  new: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  beta: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

function HomeCatalog(): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const totalEntries = useMemo(() => [...HUB_META].reduce((sum, h) => sum + h.pages.length, 0), []);
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return catalogSearch(query);
  }, [query]);
  const visibleCategories = useMemo<HubMeta[]>(() => {
    const all = [...HUB_META];
    if (searchResults) {
      const ids = new Set(searchResults.map((r) => r.category.id));
      return all.filter((c) => ids.has(c.id));
    }
    if (activeCat === 'all') return all;
    return all.filter((c) => c.id === activeCat);
  }, [searchResults, activeCat]);

  return (
    <section className="animate-fade-in-up mb-12">
      <div className="mb-5 border-t border-slate-200/70 pt-6 dark:border-slate-800">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-700 dark:text-slate-300">
          <Compass size={18} className="text-brand-600 dark:text-brand-400" /> Tool Catalog
          <span className="font-mono text-mini text-slate-400 font-normal">- {totalEntries} tools</span>
        </h2>
      </div>

      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every DFIR tool, by name, route, or keyword..."
            aria-label="Search DFIR tools"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-10 font-mono text-tool text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-micro text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X size={11} /> clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Catalog categories">
          <span className="inline-flex items-center gap-1 font-mono text-micro uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <FilterIcon size={11} /> filter
          </span>
          <HomeCategoryPill
            label="All"
            count={totalEntries}
            active={activeCat === 'all'}
            onClick={() => setActiveCat('all')}
            accent="text-slate-700 dark:text-slate-300"
          />
          {HUB_META.map((c) => (
            <HomeCategoryPill
              key={c.id}
              label={c.label}
              count={c.pages.length}
              active={activeCat === c.id}
              onClick={() => setActiveCat(c.id)}
              accent={c.tone}
            />
          ))}
        </div>

        {searchResults && (
          <div className="font-mono text-mini text-slate-500">
            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}&rdquo;
            {searchResults.length === 0 ? ' - try fewer or different keywords' : ''}
          </div>
        )}
      </div>

      <div className="space-y-8">
        {visibleCategories.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No tools match the current filter. Try a different category or clear the search box.
            </p>
          </div>
        )}
        {visibleCategories.map((cat) => {
          const entries =
            searchResults != null
              ? searchResults.filter((r) => r.category.id === cat.id).map((r) => r as HubPage)
              : cat.pages;
          return <HomeCatalogSection key={cat.id} category={cat} entries={entries} />;
        })}
      </div>
    </section>
  );
}

function HomeCategoryPill({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro transition-colors ${
        active
          ? `${accent} border-current bg-current/10`
          : 'border-slate-300/60 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${active ? 'bg-current/15' : 'bg-slate-100 dark:bg-slate-800'}`}
      >
        {count}
      </span>
    </button>
  );
}

function HomeCatalogSection({ category, entries }: { category: HubMeta; entries: readonly HubPage[] }): JSX.Element {
  if (entries.length === 0) return <></>;
  return (
    <section aria-labelledby={`home-hub-${category.id}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <h2 id={`home-hub-${category.id}`} className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${category.tone}`}>
            <category.icon size={16} aria-hidden="true" />
          </span>
          {category.label}
          <span className="font-mono text-micro text-slate-400">- {entries.length}</span>
        </h2>
        <p className="hidden text-tool text-slate-500 dark:text-slate-400 sm:block">{category.blurb}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <HomeCatalogCard key={e.path} entry={e} hubIcon={category.icon} />
        ))}
      </ul>
    </section>
  );
}

function HomeCatalogCard({ entry, hubIcon }: { entry: HubPage; hubIcon: LucideIcon }): JSX.Element {
  const Icon = entry.icon ?? hubIcon;
  return (
    <li>
      <Link
        to={entry.path}
        className="group block h-full rounded-xl border border-slate-200 bg-white p-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-e2 focus-visible:-translate-y-0.5 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-2">
          <Icon size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          {entry.badge && (
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${BADGE_STYLES[entry.badge]}`}
            >
              {entry.badge}
            </span>
          )}
        </div>
        <h3 className="mt-2 font-display text-sm font-semibold text-slate-900 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
          {entry.label}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-tool text-slate-500 dark:text-slate-400">{entry.desc}</p>
        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-slate-400">
          <code className="truncate font-mono">{entry.path}</code>
          <span className="inline-flex items-center gap-0.5 text-brand-600 dark:text-brand-400 opacity-0 transition-opacity group-hover:opacity-100">
            open <ArrowRight size={10} />
          </span>
        </div>
      </Link>
    </li>
  );
}
