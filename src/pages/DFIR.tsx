import { Link } from 'react-router-dom';
import { ArrowRight, Github, Mail } from 'lucide-react';
import { ToolGrid, TOOL_COUNT } from '../components/dfir/ToolGrid';
import { GROUP_META, type ToolGroup } from '../components/dfir/tool-sections';
import { IocDispatchInput } from '../components/dfir/IocDispatchInput';
import { personalInfo } from '../data/content';

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
      <h1 className="sr-only">DFIR Toolkit</h1>
      {/* App-style stat bar — replaces the portfolio-style 6xl hero on app routes */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Tools" value={String(TOOL_COUNT)} />
        <Stat label="Data sources" value="90+" />
        <Stat label="Credits required" value="0" />
        <Stat label="Last build" value={__BUILD_DATE__} mono />
      </section>

      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
        Scanners, decoders, lookup tools, frameworks, and analysers I reach for on shift. Sub-200ms IOC checks across 22
        threat-intel sources, no signup, no key. Looking for live feeds, briefings, RSS, or leak-site mirrors? Try{' '}
        <Link to="/threatintel" className="text-rose-600 dark:text-rose-400 hover:underline">
          /threatintel
        </Link>{' '}
        (separate app).
      </p>

      {/* Paste-to-dispatch — sits above the tool grid so the most common
          workflow (paste an indicator -> jump to the right tool) doesn't
          require opening Cmd+K or scrolling through 60 tiles. */}
      <IocDispatchInput />

      <section className="animate-fade-in-up mb-16">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">Tools</h2>
          <Link
            to="/dfir/dashboard"
            className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            recent lookups <ArrowRight size={12} />
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6 text-[11px] font-mono">
          <span className="text-slate-500">jump to:</span>
          {(['dfir', 'osint', 'aisec', 'datasec', 'grc'] as ToolGroup[]).map((g) => (
            <Link
              key={g}
              to={`/dfir/tools/${g}`}
              className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              {GROUP_META[g].label}
            </Link>
          ))}
        </div>
        <ToolGrid />
      </section>

      <section className="mt-20 pt-10 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-6">
          Data Sources
        </h3>
        <div className="space-y-5">
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
      </section>

      <section className="mt-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <h3 className="font-display font-bold text-xl mb-2">Built by Pranith Jain</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
          Security analyst and detection engineer. I defend email integrity for 150+ startups, with 1,300+ domains under
          active monitoring. Open to collaboration on DFIR tooling, threat intelligence platforms, and edge-native
          security infrastructure.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white px-4 py-2 text-sm font-mono font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
          >
            About me <ArrowRight size={14} />
          </Link>
          <a
            href={`mailto:${personalInfo.email}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Mail size={14} /> Get in touch
          </a>
          <a
            href={personalInfo.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Github size={14} /> GitHub
          </a>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
