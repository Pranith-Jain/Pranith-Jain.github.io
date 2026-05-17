import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BookText,
  Briefcase,
  Cloud,
  Compass,
  ExternalLink,
  FileCode,
  GitBranchPlus,
  Globe,
  Globe2,
  Grid3x3,
  KeyRound,
  Layers,
  MessageSquare,
  Newspaper,
  Radio,
  Radar,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';
import { WhatsNewBanner } from '../../components/threatintel/WhatsNewBanner';
import { PlatformPulse } from '../../components/threatintel/PlatformPulse';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { personalInfo } from '../../data/content';
import { AppHero } from '../../components/AppHero';
import { AppFooter } from '../../components/AppFooter';
import { StatBar } from '../../components/StatBar';

/**
 * Threat-Intel landing page — the SOLE entry point for sources, feeds, RSS,
 * news, briefings, and curated catalogues. /dfir keeps the interactive
 * tools; /threatintel keeps everything you READ.
 *
 * The pages themselves now live at /threatintel/<slug>; old /dfir/<slug>
 * URLs redirect via `MovedRedirect` in App.tsx so existing bookmarks keep
 * resolving (query string + hash preserved).
 *
 * If you add a new SOURCE / FEED / CATALOG, add the tile here AND remove
 * any matching tile from src/components/dfir/ToolGrid.tsx so the two
 * landings stay strictly disjoint.
 */

interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** Tag hint shown alongside title (e.g. "live", "new"). */
  badge?: string;
  /** Set true when `to` is an off-site URL (renders as <a target=_blank>). */
  external?: boolean;
}

interface Section {
  id: string;
  label: string;
  blurb: string;
  tools: Tool[];
}

const SECTIONS: Section[] = [
  {
    id: 'live-feeds',
    label: 'Live Feeds',
    blurb: 'Streaming intel surfaces. Fresh data each visit.',
    tools: [
      {
        to: '/threatintel/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist · per-source separation',
        icon: Bell,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-activity',
        label: 'Live ransomware activity',
        desc: 'Recent ransomware leak-site claims aggregated from Ransomlook · per-victim screenshots when available',
        icon: AlertTriangle,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-live',
        label: 'ransomware.live PRO',
        desc: 'Authenticated, edge-cached view of the ransomware.live PRO API: stats, recent cyberattacks (HudsonRock infostealer-enriched), leaked negotiation logs, and per-group YARA rules.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/infostealer',
        label: 'Infostealer live tracker',
        desc: 'Three live infostealer surfaces in one: HudsonRock victim exposure (ransomware.live PRO), demonforums ULP / cloud-log market threads, and the active stealer-log Telegram channel directory.',
        icon: KeyRound,
        badge: 'live',
      },
      {
        to: '/threatintel/pulse',
        label: 'Threat Pulse',
        desc: 'Real-time aggregator of fresh threat entities — actors, malware families, CVEs, IOCs — ranked by cross-source activity over the last 24h',
        icon: Activity,
        badge: 'live',
      },
      {
        to: '/threatintel/cybersec',
        label: 'Cybersec Telegram firehose',
        desc: 'Message stream from curated public cybersec Telegram channels. IOC drops, vendor advisories, leak announcements, with per-channel quality scores so the loud channels stop drowning the signal.',
        icon: Send,
        badge: 'live',
      },
      {
        to: '/threatintel/reddit',
        label: 'Cybersec Reddit firehose',
        desc: '16 cybersec subreddits: r/netsec, r/blueteamsec, r/redteamsec, r/Malware, r/OSINT, r/computerforensics, plus scam/fraud coverage on r/Scams, r/IdentityTheft, r/phishing, r/scambait',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/x',
        label: 'Cybersec social firehose',
        desc: '16 cybersec researchers and vendor labs on Bluesky and Mastodon. Krebs, MalwareTech, Talos, Mandiant, Beaumont, Florian Roth, Cimpanu, vxunderground. Keyless RSS, no auth.',
        icon: Cloud,
        badge: 'live',
      },
      {
        to: '/threatintel/breach',
        label: 'Live breach disclosures',
        desc: 'Public breach disclosures from Have I Been Pwned, with verification flags, sensitivity markers, and the data classes that leaked.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/onion-watch',
        label: 'Onion Watch',
        desc: 'Live inventory of .onion mirrors for the top ransomware leak sites. Per-group reachability from Ransomlook, with search and copy-all.',
        icon: Globe,
      },
      {
        to: '/threatintel/threat-feeds',
        label: 'Threat Feeds',
        desc: '40-source aggregation: CISA advisories, vendor labs, IR write-ups, Reddit infosec, CVE/Exploit-DB, and security press.',
        icon: Radio,
      },
      {
        to: '/threatintel/scam-watch',
        label: 'Scam Watch',
        desc: 'Live FTC and FBI IC3 alerts, deepfake-scam news, and Reddit victim reports. Search and filter built in.',
        icon: AlertTriangle,
      },
      {
        to: '/threatintel/cyber-crime',
        label: 'Cyber crime & fraud feeds',
        desc: 'Live incident coverage: DOJ indictments and takedowns, Chainalysis and Elliptic crypto-crime tracing, Krebs/BleepingComputer/HackRead breach reporting, DataBreaches.net, CISA, The Record. Round-robin so no one source dominates.',
        icon: AlertOctagon,
        badge: 'live',
      },
      {
        to: '/threatintel/tech-ai-news',
        label: 'Tech & AI News',
        desc: '16-source feed for AI labs, cyber-vendor funding and M&A, general tech, and HN/YC. Threat-intel kept on its own surface.',
        icon: Newspaper,
      },
      {
        to: '/threatintel/threat-map',
        label: 'Cyber Threat Map',
        desc: 'Live geolocation of malicious infrastructure. Choropleth map plus country leaderboard, with IP, URL, domain, and hash buckets.',
        icon: Globe2,
      },
    ],
  },
  {
    id: 'writeups',
    label: 'Writeups Feed',
    blurb: 'Analyst blogs and vendor research labs, aggregated live.',
    tools: [
      {
        to: '/threatintel/writeups',
        label: 'Writeups Feed',
        desc: '18+ analyst blogs and vendor research labs aggregated live: The DFIR Report, BushidoToken, DoublePulsar, Krebs, SentinelLabs, Unit 42, Check Point Research, Google TI, Huntress, and more.',
        icon: BookText,
        badge: 'live',
      },
    ],
  },
  {
    id: 'briefings',
    label: 'Briefings & Reports',
    blurb: 'Synthesised intel. Daily, weekly, and per-group write-ups.',
    tools: [
      {
        to: '/threatintel/briefings',
        label: 'Intel Briefings',
        desc: 'Daily and weekly digest, auto-generated from the upstream feeds. Ransomware claims, breach disclosures, and the IOCs of the day, with auto-tagged actors and CVEs per item.',
        icon: Briefcase,
      },
    ],
  },
  {
    id: 'adversary',
    label: 'Adversary Catalogs',
    blurb: 'Who is attacking, with what. Browseable indexes.',
    tools: [
      {
        to: '/threatintel/actors',
        label: 'Threat Actors',
        desc: 'APT catalogue. STIX-aware, with TTPs, associated tooling, and MITRE technique mapping per actor.',
        icon: Users,
      },
      {
        to: '/threatintel/mitre',
        label: 'MITRE ATT&CK',
        desc: 'The matrix, plus per-technique deep-dives. Pivot both ways: actor to technique, technique to actor.',
        icon: Grid3x3,
      },
    ],
  },
  {
    id: 'rules-iocs',
    label: 'Detection Rules & IOC Feeds',
    blurb: 'Public rule and indicator catalogues. Pull and ingest.',
    tools: [
      {
        to: '/threatintel/rules',
        label: 'Detection Rules',
        desc: 'Sigma, YARA, Elastic, Splunk, KQL, and Suricata. Live commit feeds from the upstream repos, so the new rules show up the day they land.',
        icon: FileCode,
      },
      {
        to: '/threatintel/cve-resources',
        label: 'CVE Resources Catalog',
        desc: 'About 70 curated CVE sources. Databases, exploit and PoC repos, vendor PSIRTs, scoring services, research labs, and alert feeds.',
        icon: BookText,
      },
    ],
  },
  {
    id: 'ioc-feeds',
    label: 'Live IOC Feeds',
    blurb: 'Curated streams of fresh indicators. Pull, ingest, or pivot to the IOC Checker.',
    tools: [
      {
        to: '/threatintel/cve-list',
        label: 'Live CVE updates',
        desc: 'NVD published-CVE feed (last 14 days) merged with the CISA KEV catalogue (last 30 days). Severity, KEV flag, ransomware-use flag, and a curated actor pill where attribution exists.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/c2-tracker',
        label: 'C2 Infrastructure Tracker',
        desc: 'Live C2 server IPs from MontySecurity C2-Tracker (Shodan-detected). Filter by framework: Cobalt Strike, Sliver, Metasploit, Havoc, Brute Ratel, and more.',
        icon: Radar,
        badge: 'new',
      },
    ],
  },
  {
    id: 'catalogs',
    label: 'Curated Catalogs',
    blurb: 'Reference indexes. Start here when the question is broader than a single tool.',
    tools: [
      {
        to: '/threatintel/telegram-watch',
        label: 'Telegram Catalog',
        desc: 'Curated index of public threat-intel, cybercrime, and OSINT Telegram channels. Category and language filters, for when you want to find new channels rather than read the firehose at /threatintel/cybersec.',
        icon: Send,
      },
      {
        to: '/threatintel/secops-tools',
        label: 'SecOps Tools Catalog',
        desc: 'About 140 hand-picked tools across 14 categories: DFIR, Threat Intel, AI Sec, Malware, Vuln Mgmt, Detection.',
        icon: Layers,
      },
      {
        to: '/threatintel/awesome-lists',
        label: 'Awesome Lists',
        desc: 'GitHub awesome-lists for OSINT, threat intel, IR, and MCP / AI security. Filterable by stars and focus area.',
        icon: Sparkles,
      },
      {
        to: '/threatintel/external-resources',
        label: 'External Resources',
        desc: 'Off-site cross-references — dashboards, OSINT directories, training labs, malware samples, and research portfolios. Filter by kind. Featured quality-content markers and research-discovery mode.',
        icon: ExternalLink,
      },
      {
        to: '/threatintel/deepdarkcti',
        label: 'deepdarkCTI Index',
        desc: 'Parsed mirror of fastfire/deepdarkCTI — ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor Telegram/Twitter channels, dark-web search engines. 18 source lists, filterable, onion-aware.',
        icon: Globe,
      },
      {
        to: '/threatintel/domain-monitor',
        label: 'Domain Monitor',
        desc: 'Typosquatting and domain impersonation scanner. Generates lookalike variants — character swaps, TLD swaps, homoglyphs, prefix/suffix abuse. Inspired by haveibeensquatted.com.',
        icon: Search,
      },
      {
        to: '/threatintel/osint-framework',
        label: 'OSINT Framework',
        desc: '70+ curated OSINT tools across 15 categories. Filter by pricing tier and category.',
        icon: Compass,
      },
      {
        to: '/threatintel/wiki',
        label: 'Knowledge Base',
        desc: 'Long-form articles on Telegram OSINT tradecraft, dark-web monitoring, MITRE workflows, and briefing methodology.',
        icon: BookOpen,
      },
      {
        to: '/threatintel/metrics',
        label: 'Threat Intel Metrics',
        desc: 'Ten panels covering the questions CTI teams actually ask. Most-active ransomware groups, CVE severity, KEV cadence, top-impersonated brands, IOC volume by source, sector targeting, malware families, re-leak hotspots.',
        icon: BarChart3,
      },
      {
        to: '/threatintel/correlation',
        label: 'Cross-source IOC correlation',
        desc: 'Indicators that appear in 2+ independent feeds, ranked by source consensus. A single-feed flag can be a false positive. Cross-source overlap is the signal CTI analysts actually trust.',
        icon: GitBranchPlus,
      },
      {
        to: '/threatintel/actor-timeline',
        label: 'Actor activity timeline',
        desc: 'Per-actor leak-site cadence Gantt for the most-active ransomware groups · joins Ransomlook per-group history with curated MITRE Group lookup',
        icon: ShieldAlert,
      },
      {
        to: '/threatintel/re-leaks',
        label: 'Victim re-leak detection',
        desc: 'Victims claimed by 2+ ransomware groups in the last 12 months. Usually a failed double-extortion, or an affiliate switching programs. Cross-actor match on normalised victim names.',
        icon: Users,
      },
      {
        to: '/threatintel/live-iocs',
        label: 'Live IOC stream',
        desc: 'Chronological firehose with per-IOC reporter handles + timestamps. Sources: TweetFeed, SANS ISC, C2IntelFeeds, URLhaus, ThreatFox, MalwareBazaar, PhishTank, OpenPhish.',
        icon: Radio,
      },
      {
        to: '/threatintel/status',
        label: 'Feed status',
        desc: 'Health of every upstream-backed feed on /threatintel. When a page looks empty, check here first to see whether the gap is upstream or our worker.',
        icon: Activity,
      },
    ],
  },
];

/** Flat tool + parent-section pair used by the search results view. */
interface ToolMatch {
  tool: Tool;
  section: Section;
}

function flattenTools(sections: Section[]): ToolMatch[] {
  return sections.flatMap((s) => s.tools.map((t) => ({ tool: t, section: s })));
}

function matchesQuery(t: ToolMatch, q: string): boolean {
  if (!q) return true;
  const hay = `${t.tool.label} ${t.tool.desc} ${t.section.label}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

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
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <h1 className="sr-only">Threat Intel Platform</h1>
      {/* "What's new since your last visit" banner — silent on first
          visit / zero deltas. Reuses the localStorage marker key
          'threatintel-home'. */}
      <WhatsNewBanner />
      {/* 7-day platform-pulse sparklines (IOCs + findings per day). Real
          data from /api/v1/briefings/list — the daily-briefing cron has
          ~30 days of history. Decorative only when fewer than 2 days
          are available. */}
      <PlatformPulse />
      <LatestBriefingCard />
      <AppHero
        kicker="Privacy-first · Live edge feeds · No login · No tracking"
        title="Threat-intel platform"
        sub="Live ransomware leak claims, CVE × CISA-KEV, malware-sample and phishing-URL streams, dark-web and social firehoses, daily briefings, ten-panel metrics and STIX 2.1 export — aggregated at the edge and refreshed every visit."
        meta={
          <>
            {totalTiles} intel surfaces · by{' '}
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              {personalInfo.name}
            </a>{' '}
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
      <StatBar
        items={[
          { label: 'Intel surfaces', value: String(totalTiles) },
          { label: 'IOC feeds correlated', value: '18' },
          { label: 'Live IOC sources', value: '10' },
          { label: 'Refresh cadence', value: '30m–1h', mono: true },
        ]}
      />

      {/* Quick links to power-user surfaces */}
      <div className="flex flex-wrap items-center gap-2 mb-12 text-[11px] font-mono text-slate-500 dark:text-slate-500">
        <span>quick:</span>
        <Link
          to="/threatintel/metrics"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          metrics
        </Link>
        <Link
          to="/threatintel/correlation"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          correlation
        </Link>
        <Link
          to="/threatintel/actor-timeline"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          actor timeline
        </Link>
        <Link
          to="/threatintel/re-leaks"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          re-leaks
        </Link>
        <Link
          to="/threatintel/live-iocs"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          live stream
        </Link>
        <Link
          to="/threatintel/status"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          feed status
        </Link>
      </div>

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
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-20 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search intel surfaces"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X size={11} /> clear
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                /
              </kbd>
              <span>or</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                ⌘K
              </kbd>
            </span>
          )}
        </div>
        {isSearching && (
          <div className="mt-2 font-mono text-[11px] text-slate-500">
            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}&rdquo;
            {searchResults.length === 0 && ' · try fewer or different keywords'}
          </div>
        )}
      </div>

      {!isSearching && !cat && (
        <section className="animate-fade-in-up">
          <LiveSnapshotPanel compact subtitle="live intel pulse across the platform" mbClass="mb-12" />
        </section>
      )}

      {isSearching ? (
        <section className="animate-fade-in-up mb-12">
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map(({ tool: t, section }) => {
              const Icon = t.icon;
              const cardClass =
                'block h-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-500/40 dark:hover:border-brand-400/40 transition-colors group';
              const inner = (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span className="mt-0.5 inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
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
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">{t.desc}</p>
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
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center font-mono text-[12px] text-slate-500 dark:border-slate-700">
              No matches. Searching across {allTools.length} intel surfaces, catalogs, and feeds.
            </div>
          )}
        </section>
      ) : activeSection ? (
        <section className="animate-fade-in-up mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-6 text-[11px] font-mono">
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
            <p className="text-sm text-slate-500 dark:text-slate-500 font-mono mt-1">
              {activeSection.blurb} · {activeSection.tools.length}{' '}
              {activeSection.tools.length === 1 ? 'source' : 'sources'}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              Reference only — feeds refreshed at the edge each visit; verify indicators in your own environment.
            </p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeSection.tools.map((t) => {
              const Icon = t.icon;
              const cardClass =
                'block h-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-500/40 dark:hover:border-brand-400/40 transition-colors group';
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                    <ArrowRight
                      size={14}
                      className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors mt-0.5 shrink-0"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{t.desc}</p>
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
          <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100 mb-1">
            Browse by category
          </h2>
          <p className="text-sm font-mono text-slate-500 mb-6">
            Pick a surface to dive in — or use the search above to jump straight to a tool.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {s.label}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                  />
                </div>
                <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{s.blurb}</p>
                <p className="mt-2 text-[11px] font-mono text-slate-400">
                  {s.tools.length} {s.tools.length === 1 ? 'source' : 'sources'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <AppFooter
        aboutTo="/threatintel/about"
        blurb={`Privacy-first threat intelligence by ${personalInfo.name}. Live feeds aggregated at the edge — no tracking, no accounts. Reference only; verify indicators in your own environment.`}
      />
    </div>
  );
}
