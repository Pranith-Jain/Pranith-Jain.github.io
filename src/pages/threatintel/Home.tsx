import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Compass,
  ExternalLink,
  FileCode,
  FileText,
  Github,
  Globe,
  Globe2,
  Grid3x3,
  Layers,
  Microscope,
  Newspaper,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  AlertTriangle,
  BookText,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';

/**
 * Threat-Intel landing page — the SOLE entry point for sources, feeds, RSS,
 * news, briefings, and curated catalogues. /dfir keeps the interactive
 * tools; /threatintel keeps everything you READ.
 *
 * The pages themselves still live at their /dfir/<slug> URLs (no migration
 * churn) — this landing just curates them under intel-flavoured sections.
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
    blurb: 'Streaming intel surfaces — fresh data each visit.',
    tools: [
      {
        to: '/threatintel/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist · per-source separation',
        icon: Bell,
        badge: 'live',
      },
      {
        to: '/threatintel/onion-watch',
        label: 'Onion Watch',
        desc: 'Live .onion mirror inventory for top ransomware leak sites · per-group reachability from Ransomlook · search · copy-all URLs',
        icon: Globe,
      },
      {
        to: '/threatintel/telegram-watch',
        label: 'Telegram Watch',
        desc: 'Curated index of public threat-intel + cybercrime channels · category + language filters',
        icon: Send,
      },
      {
        to: '/threatintel/threat-feeds',
        label: 'Threat Feeds',
        desc: 'CISA · vendor labs · IR write-ups · Reddit infosec · CVE/Exploit-DB · security press · 40 sources',
        icon: Radio,
      },
      {
        to: '/threatintel/scam-watch',
        label: 'Scam Watch',
        desc: 'Live FTC + FBI IC3 alerts · deepfake-scam news · Reddit victim reports · search + filter',
        icon: AlertTriangle,
      },
      {
        to: '/threatintel/tech-ai-news',
        label: 'Tech & AI News',
        desc: 'AI labs · cyber-vendor funding · M&A · general tech · HN/YC · 16 sources, threat-intel kept separate',
        icon: Newspaper,
      },
      {
        to: '/threatintel/threat-map',
        label: 'Cyber Threat Map',
        desc: 'Live geolocation of malicious infrastructure · choropleth + leaderboard · IP / URL / domain / hash buckets',
        icon: Globe2,
      },
    ],
  },
  {
    id: 'briefings',
    label: 'Briefings & Reports',
    blurb: 'Synthesised intel — daily, weekly, and per-group write-ups.',
    tools: [
      {
        to: '/threatintel/briefings',
        label: 'Intel Briefings',
        desc: 'Daily + weekly digest · auto-generated from feeds · ransomware claims · breach disclosures · IOCs of the day',
        icon: Briefcase,
      },
      {
        to: '/threatintel/ransom-library',
        label: 'Ransom Note Library',
        desc: '180+ ransomware groups · transcript of each ransom note + leak-site landing-page screenshot · sourced from mythreatintel.com',
        icon: FileText,
        badge: 'new',
      },
    ],
  },
  {
    id: 'adversary',
    label: 'Adversary Catalogs',
    blurb: 'Who is attacking, with what — browseable indexes.',
    tools: [
      {
        to: '/threatintel/actors',
        label: 'Threat Actors',
        desc: 'APT catalog · STIX-aware · TTPs · associated tooling · MITRE technique mapping',
        icon: Users,
      },
      {
        to: '/threatintel/mitre',
        label: 'MITRE ATT&CK',
        desc: 'Matrix · technique deep-dive · actor-to-technique and technique-to-actor pivots',
        icon: Grid3x3,
      },
    ],
  },
  {
    id: 'rules-iocs',
    label: 'Detection Rules & IOC Feeds',
    blurb: 'Public rule + indicator catalogues — pull and ingest.',
    tools: [
      {
        to: '/threatintel/rules',
        label: 'Detection Rules',
        desc: 'Sigma · YARA · Elastic · Splunk · KQL · Suricata · live commit feeds from upstream repos',
        icon: FileCode,
      },
      {
        to: '/dfir/cve',
        label: 'CVE Lookup',
        desc: 'NVD · CVSS · EPSS · KEV · combined patch-priority score with rationale',
        icon: ShieldAlert,
      },
      {
        to: '/threatintel/cve-resources',
        label: 'CVE Resources Catalog',
        desc: '~70 curated CVE sources — databases · exploit/PoC · vendor PSIRTs · scoring · research labs · alert feeds',
        icon: BookText,
      },
    ],
  },
  {
    id: 'catalogs',
    label: 'Curated Catalogs',
    blurb: 'Reference indexes — start here when a question is broader than a single tool.',
    tools: [
      {
        to: '/threatintel/secops-tools',
        label: 'SecOps Tools Catalog',
        desc: '~140 hand-picked tools across 14 categories — DFIR / Threat Intel / AI Sec / Malware / Vuln / Detection',
        icon: Layers,
      },
      {
        to: '/threatintel/awesome-lists',
        label: 'Awesome Lists',
        desc: 'Curated GitHub awesome-lists for OSINT, Threat Intel, IR, MCP / AI security · star + focus filter',
        icon: Sparkles,
      },
      {
        to: '/threatintel/osint-framework',
        label: 'OSINT Framework',
        desc: '70+ curated OSINT tools across 15 categories · pricing-tier + category filter',
        icon: Compass,
      },
      {
        to: '/threatintel/wiki',
        label: 'Knowledge Base',
        desc: 'Long-form articles — Telegram OSINT tradecraft, dark-web monitoring, MITRE workflows, briefing methodology',
        icon: BookOpen,
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
        desc: 'Live ransomware dashboard · country / sector / timeline charts · the upstream of /threatintel/ransom-library',
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
        to: 'https://github.com/rawfilejson/awesome-osint-arsenal',
        label: 'awesome-osint-arsenal',
        desc: 'Curated arsenal of OSINT tools, frameworks, and references by rawfilejson',
        icon: Github,
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
    ],
  },
];

export default function ThreatIntelHome(): JSX.Element {
  const totalTiles = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 text-slate-900 dark:text-slate-100">
      <header className="animate-fade-in-up mb-12">
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          Threat Intelligence
        </span>
        <h1 className="text-5xl sm:text-6xl font-display font-bold text-slate-900 dark:text-slate-100 mb-4 leading-tight">
          Sources, feeds, and intel surfaces.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mb-6 leading-relaxed">
          Everything you READ — live leak-site mirrors, RSS aggregators, briefings, adversary catalogues, detection-rule
          feeds, and a searchable library of {180}+ ransomware-group notes + leak-site screenshots.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-slate-600 dark:text-slate-400">
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">{totalTiles}</span> intel surfaces
          </span>
          <span aria-hidden="true">·</span>
          <span>
            For interactive tools (IOC checker, decoder, scanners, frameworks) →{' '}
            <Link to="/dfir" className="text-brand-600 dark:text-brand-400 hover:underline">
              /dfir
            </Link>
          </span>
        </div>
      </header>

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

      <section className="mt-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <h3 className="font-display font-bold text-xl mb-2">Strict separation</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
          /threatintel and /dfir are two separate platforms on the same domain. /threatintel is sources you READ; /dfir
          is interactive tools you RUN. No threat-intel sources live on the /dfir landing; no scanners or decoders live
          here. Use the top nav to switch between them.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono">
          Pages still resolve at their existing /dfir/&lt;slug&gt; URLs (no broken bookmarks). The /threatintel landing
          is the curated entry point that surfaces them grouped by intel use-case.
        </p>
      </section>
    </div>
  );
}
