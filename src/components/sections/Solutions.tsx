import { ArrowRight, ShieldAlert, Search, Globe, Activity, BookOpen, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../Badge';

interface SolutionPillar {
  title: string;
  desc: string;
  href: string;
  icon: typeof ShieldAlert;
  bullets: string[];
}

const PILLARS: SolutionPillar[] = [
  {
    title: 'DFIR Toolkit',
    desc: 'Interactive analyst tools — IOC enrichment, domain triage, email defense, breach lookup, OSINT pivots, web/cert scanning. All client-side or edge-hosted.',
    href: '/dfir',
    icon: ShieldAlert,
    bullets: ['60+ tools', 'IOC Checker', 'Email Defense (SPF/DKIM/DMARC)', 'Domain · ASN · Cert · Web'],
  },
  {
    title: 'Threat Intel Platform',
    desc: 'Live CTI surface — ransomware leak claims, infostealer logs, CVE/KEV stream, Telegram/Bluesky/Mastodon firehose, dark-web watch, daily + weekly briefings.',
    href: '/threatintel',
    icon: Activity,
    bullets: ['40+ live feeds', 'Ransomware activity', 'Live CVE + KEV', 'Threat Pulse'],
  },
  {
    title: 'Knowledge Base',
    desc: 'Long-form articles, MITRE ATT&CK matrices, ATLAS for AI-attacks, OWASP Top 10 reference, kill-chain walkthroughs, and analyst write-ups.',
    href: '/threatintel/wiki',
    icon: BookOpen,
    bullets: ['MITRE ATT&CK', 'OWASP web/API/LLM', 'ATLAS', 'Kill chain · Diamond'],
  },
  {
    title: 'IOC Stream',
    desc: 'Cross-source correlation engine — indicators appearing in 2+ feeds ranked by source consensus, with per-IOC reporter handles and freshness badges.',
    href: '/threatintel/correlation',
    icon: Radio,
    bullets: ['18 IOC feeds', 'Consensus ranking', 'STIX 2.1 export', 'Live stream'],
  },
];

export function Solutions() {
  return (
    <section id="solutions" className="scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="mb-3 text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">Solutions</div>
        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-1.28px] text-slate-900 dark:text-white">
          Everything you need for threat intelligence &amp; DFIR
        </h2>
        <p className="mt-3 text-base sm:text-lg text-muted">
          A complete ecosystem of tools, feeds, and frameworks — built by an analyst, for analysts.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Link
              key={pillar.href}
              to={pillar.href}
              className="group block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 transition hover:border-brand-500/50"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 transition-colors group-hover:bg-brand-500/20">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-semibold tracking-[-0.96px] text-slate-900 dark:text-white transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {pillar.title}
                </h3>
                <ArrowRight
                  size={18}
                  className="ml-auto text-slate-400 transition-transform group-hover:text-brand-500 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted">{pillar.desc}</p>
              <ul className="flex flex-wrap gap-1.5">
                {pillar.bullets.map((b) => (
                  <li key={b}>
                    <Badge size="xs">{b}</Badge>
                  </li>
                ))}
              </ul>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 text-sm">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-5 py-2.5 font-semibold text-white transition hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Search size={14} aria-hidden="true" /> Open DFIR toolkit
        </Link>
        <Link
          to="/threatintel"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Globe size={14} aria-hidden="true" /> Browse threat intel
        </Link>
      </div>
    </section>
  );
}
