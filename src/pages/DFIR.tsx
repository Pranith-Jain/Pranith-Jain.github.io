import { Link } from 'react-router-dom';
import { ArrowRight, Hash, Mail, FileCode, AlertOctagon, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_COUNT } from '../components/dfir/ToolGrid';
import { GROUP_META, MAIN_TOOL_COUNT, UTILITY_TOOLS, type ToolGroup } from '../components/dfir/tool-sections';
import { IocDispatchInput } from '../components/dfir/IocDispatchInput';
import { personalInfo } from '../data/content';
import { AppHero } from '../components/AppHero';
import { AppFooter } from '../components/AppFooter';
import { StatBar } from '../components/StatBar';

/**
 * The five tools that earn their place on the front door — the ones with
 * genuine depth versus the long-tail utility tools. Surfaced on the hub
 * landing so a visitor lands on the strong work, not the timestamp
 * converter (which is also useful but doesn't make the case for the
 * platform). Hand-picked, not generated — adding or removing entries here
 * is a deliberate editorial call.
 */
interface FeaturedTool {
  path: string;
  icon: LucideIcon;
  label: string;
  pitch: string;
  /** Why use this over a generic equivalent — concrete differentiator. */
  edge: string;
}
const FEATURED_TOOLS: FeaturedTool[] = [
  {
    path: '/dfir/ioc-check',
    icon: Hash,
    label: 'IOC & Hash Checker',
    pitch: 'Streaming verdicts on IPs, domains, URLs, and file hashes across 24 providers in parallel.',
    edge: 'Cross-source consensus is the only signal worth trusting at scale; single-feed flags are noise.',
  },
  {
    path: '/dfir/email-defense',
    icon: Mail,
    label: 'Email Defense / BEC Score',
    pitch: 'Full SPF / DKIM / DMARC / BIMI / MTA-STS / TLS-RPT audit in one scan with the failure mode called out.',
    edge: 'Built from a 1,300-domain DMARC rollout. The rules check what actually breaks in practice.',
  },
  {
    path: '/dfir/rule-converter',
    icon: FileCode,
    label: 'Universal Rule Converter',
    pitch:
      'Round-trip detection rules between Sigma, KQL, SPL, Lucene, EQL, YARA, DLP, and supply-chain via one canonical RuleIR.',
    edge: 'Single source of truth across SIEM dialects. No more re-authoring the same rule six ways.',
  },
  {
    path: '/dfir/detection-lab',
    icon: AlertOctagon,
    label: 'Detection Lab',
    pitch: 'In-browser playground for writing and evaluating detection rules against a curated event corpus.',
    edge: 'Author rules with feedback in seconds, not the day-long round-trip of a live SIEM.',
  },
  {
    path: '/dfir/cve-prioritizer',
    icon: ShieldAlert,
    label: 'CVE Prioritizer',
    pitch:
      'Score a CVE against CVSS + EPSS + CISA KEV + ransomware-use signals and get a concrete patch-priority verdict.',
    edge: 'Most CVE pages tell you the score; this one tells you what to do with it this week.',
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

export default function DFIRPage(): JSX.Element {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <AppHero
        kicker="Privacy-first · No upload · No login · Local analysis only"
        title="DFIR & security toolkit"
        sub="Scanners, decoders, forensic parsers, lookups and frameworks that run entirely in your browser. Sub-200ms IOC checks across 22 sources, no signup, no key."
        meta={
          <>
            {TOOL_COUNT} tools · by{' '}
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
      <StatBar
        items={[
          { label: 'Tools', value: String(MAIN_TOOL_COUNT) },
          { label: 'Data sources', value: '90+' },
          { label: 'Credits required', value: '0' },
          { label: 'Last build', value: __BUILD_DATE__, mono: true },
        ]}
      />

      {/* Paste-to-dispatch — sits above the tool grid so the most common
          workflow (paste an indicator -> jump to the right tool) doesn't
          require opening Cmd+K or scrolling through 60 tiles. */}
      <IocDispatchInput />

      {/* Featured tools — the five tools that earn their place on the front
          door. Promotes the strong work above the category picker so a
          first-time visitor doesn't bounce off a 60-tile grid. The rest of
          the toolkit stays one click away via "Pick a workbench" below. */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Featured tools</h2>
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500">
            {FEATURED_TOOLS.length} of {MAIN_TOOL_COUNT}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.path}
                to={t.path}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 transition hover:border-brand-500/40"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {t.label}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{t.pitch}</p>
                <p className="mt-3 text-[12px] font-mono text-slate-500 leading-relaxed">
                  <span className="text-brand-600 dark:text-brand-400">Why this:</span> {t.edge}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="animate-fade-in-up mb-16">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">Pick a workbench</h2>
          <Link
            to="/dfir/dashboard"
            className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            recent lookups <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(['dfir', 'ir', 'ti', 'osint', 'aisec', 'cloudsec', 'apisec', 'datasec', 'grc'] as ToolGroup[]).map((g) => (
            <Link
              key={g}
              to={`/dfir/tools/${g}`}
              className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {GROUP_META[g].label}
                </span>
                <ArrowRight
                  size={14}
                  className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                />
              </div>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{GROUP_META[g].blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Utilities & converters — duplicative of well-known online tools
          (timestamp converters, hex/base64 decoders, hash calculators).
          Surfaced behind a collapsible so the headline tool count reads
          as the real depth of the toolkit, not a padded list. Routes
          still resolve — nothing is deleted, only de-emphasised. */}
      {UTILITY_TOOLS.length > 0 && (
        <section className="mb-12">
          <details>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 font-mono">
              Utilities &amp; converters ({UTILITY_TOOLS.length}). Encoders, hashes, timestamps
            </summary>
            <p className="mt-3 text-[12px] font-mono text-slate-500 max-w-2xl">
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
                      className="group flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 hover:border-brand-500/40 transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-500 group-hover:text-brand-500 transition-colors shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
                          {t.label}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">{t.desc}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      <section className="mt-20 pt-10 border-t border-slate-200 dark:border-slate-800">
        <details>
          <summary className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-6 cursor-pointer">
            Data Sources
          </summary>
          <div className="space-y-5 mt-4">
            {PROVIDER_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">{group.label}</div>
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

      <AppFooter
        aboutTo="/dfir/tools/about"
        blurb={`DFIR & security toolkit by ${personalInfo.name}. Everything runs in your browser — no uploads, no keys, no tracking. Triage support only; validate findings with your standard workflow.`}
      />
    </div>
  );
}
