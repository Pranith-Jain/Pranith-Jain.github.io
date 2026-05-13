import { Link } from 'react-router-dom';
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
  Github,
  Globe,
  Globe2,
  Grid3x3,
  Layers,
  MessageSquare,
  Microscope,
  Newspaper,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';

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
  {
    id: 'external',
    label: 'External Sources',
    blurb: 'Off-site catalogues and dashboards I cross-reference.',
    tools: [
      {
        to: 'https://www.mythreatintel.com/?lang=en',
        label: 'My Threat Intel',
        desc: 'Live ransomware dashboard · country / sector / timeline charts · 180+ ransomware groups with ransom-note transcripts and leak-site screenshots',
        icon: ExternalLink,
        external: true,
      },
      {
        to: 'https://github.com/fastfire/deepdarkCTI',
        label: 'deepdarkCTI',
        desc: 'Continuously updated repository of dark-web and CTI sources, by fastfire',
        icon: Github,
        external: true,
      },
      {
        to: 'https://threatlandscape.io/free-tools',
        label: 'Threat Landscape Free Tools',
        desc: 'Curated free DFIR and threat-intel tools directory',
        icon: Compass,
        external: true,
      },
      {
        to: 'https://analyzer.vecert.io/index',
        label: 'Vecert Analyzer',
        desc: 'Free file and indicator analyzer for incident response',
        icon: Microscope,
        external: true,
      },
      {
        to: 'https://www.worldmonitor.app',
        label: 'World Monitor',
        desc: 'Real-time OSINT dashboard, news, markets, ADS-B and AIS tracking across 435+ sources',
        icon: Compass,
        external: true,
      },
      {
        to: 'https://osinttools.io/tools',
        label: 'OSINT Tools',
        desc: 'Curated OSINT directory',
        icon: Compass,
        external: true,
      },
      {
        to: 'https://osintrack.com/',
        label: 'OSINTrack',
        desc: 'OSINT investigation tracker',
        icon: Compass,
        external: true,
      },
      {
        to: 'https://leakradar.io/en/leaks',
        label: 'LeakRadar',
        desc: '290B+ leaked credentials indexed from stealer logs, combolists, and database dumps. REST API + Telegram/Slack/webhook alerts.',
        icon: ShieldAlert,
        external: true,
      },
      {
        to: 'https://serus.ai',
        label: 'Serus',
        desc: 'AI-powered data-exposure monitoring and dark-web surveillance for individuals and orgs. Combines breach search with takedown automation.',
        icon: ShieldAlert,
        external: true,
      },
    ],
  },
];

export default function ThreatIntelHome(): JSX.Element {
  const totalTiles = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      {/* App-style stat bar — replaces the portfolio-style 6xl hero on app routes */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TiStat label="Intel surfaces" value={String(totalTiles)} />
        <TiStat label="IOC feeds correlated" value="18" />
        <TiStat label="Live IOC sources" value="10" />
        <TiStat label="Refresh cadence" value="30m–1h" mono />
      </section>

      <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
        Live ransomware leak claims, CVE merged with CISA KEV (active-exploitation flag inline), a malware-sample
        stream, a phishing-URL feed with brand attribution, and firehoses from Bluesky, Mastodon, Reddit, and Telegram.
        Daily briefings, ten-panel metrics, STIX 2.1 export. Need interactive tools instead?{' '}
        <Link to="/dfir" className="text-brand-600 dark:text-brand-400 hover:underline">
          /dfir
        </Link>{' '}
        (separate app).
      </p>

      {/* Quick links to power-user surfaces */}
      <div className="flex flex-wrap items-center gap-2 mb-12 text-[11px] font-mono text-slate-500 dark:text-slate-500">
        <span>quick:</span>
        <Link
          to="/threatintel/metrics"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          metrics
        </Link>
        <Link
          to="/threatintel/correlation"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          correlation
        </Link>
        <Link
          to="/threatintel/actor-timeline"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          actor timeline
        </Link>
        <Link
          to="/threatintel/re-leaks"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          re-leaks
        </Link>
        <Link
          to="/threatintel/live-iocs"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          live stream
        </Link>
        <Link
          to="/threatintel/status"
          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          feed status
        </Link>
      </div>

      <section className="animate-fade-in-up">
        <LiveSnapshotPanel compact subtitle="live intel pulse across the platform" mbClass="mb-12" />
      </section>

      {SECTIONS.map((section) => (
        <section key={section.id} className="animate-fade-in-up mb-12">
          <div className="mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">{section.label}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-mono mt-1">
              {section.blurb} · {section.tools.length} {section.tools.length === 1 ? 'source' : 'sources'}
            </p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {section.tools.map((t) => {
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
              if (t.external) {
                return (
                  <li key={t.to}>
                    <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                      {inner}
                    </a>
                  </li>
                );
              }
              return (
                <li key={t.to}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TiStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">{label}</div>
      <div
        className={`font-display font-bold text-xl text-slate-900 dark:text-slate-100 ${mono ? 'font-mono text-sm' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}
