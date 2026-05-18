import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { TOOL_COUNT } from '../components/dfir/ToolGrid';
import { GROUP_META, type ToolGroup } from '../components/dfir/tool-sections';
import { IocDispatchInput } from '../components/dfir/IocDispatchInput';
import { personalInfo } from '../data/content';
import { AppHero } from '../components/AppHero';
import { AppFooter } from '../components/AppFooter';
import { StatBar } from '../components/StatBar';

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
        sub="Scanners, decoders, forensic parsers, lookups and frameworks that run entirely in your browser. Sub-200ms IOC checks across 22 sources — no signup, no key."
        meta={
          <>
            {TOOL_COUNT} tools · by{' '}
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${personalInfo.name} (opens in new tab)`}
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              {personalInfo.name}
            </a>{' '}
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
          { label: 'Tools', value: String(TOOL_COUNT) },
          { label: 'Data sources', value: '90+' },
          { label: 'Credits required', value: '0' },
          { label: 'Last build', value: __BUILD_DATE__, mono: true },
        ]}
      />

      {/* Paste-to-dispatch — sits above the tool grid so the most common
          workflow (paste an indicator -> jump to the right tool) doesn't
          require opening Cmd+K or scrolling through 60 tiles. */}
      <IocDispatchInput />

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
