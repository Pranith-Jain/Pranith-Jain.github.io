import { Link } from 'react-router-dom';
import { ArrowRight, Cloud, Github, Mail } from 'lucide-react';
import { ToolGrid, TOOL_COUNT } from '../components/dfir/ToolGrid';
import { LiveSnapshotPanel } from '../components/dfir/LiveSnapshotPanel';
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
      'Feodo Tracker',
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
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 text-slate-900 dark:text-slate-100">
      <header className="animate-fade-in-up mb-12">
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          DFIR Toolkit
        </span>
        <h1 className="text-5xl sm:text-6xl font-display font-bold text-slate-900 dark:text-slate-100 mb-4 leading-tight">
          Interactive DFIR tools on the edge.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mb-6 leading-relaxed">
          The action surface — scanners, decoders, lookup tools, frameworks, and analysers. Sub-200ms IOC checks across
          22 threat-intel sources, with no signup required. The whole stack runs on Cloudflare Workers, free at the
          edge.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-slate-600 dark:text-slate-400">
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">{TOOL_COUNT}</span> tools
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">90+</span> data sources
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">0</span> credits required
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Cloud size={12} aria-hidden="true" />
            edge, last build {__BUILD_DATE__}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-500 font-mono mt-4">
          Looking for sources, briefings, RSS feeds, leak-site mirrors, or news? →{' '}
          <Link to="/threatintel" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel
          </Link>{' '}
          (separate platform).
        </p>
      </header>

      <section className="animate-fade-in-up">
        <LiveSnapshotPanel compact subtitle="live activity across the toolkit" mbClass="mb-12" />
      </section>

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
