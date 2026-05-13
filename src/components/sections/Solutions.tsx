import { ArrowRight, ShieldAlert, Search, Globe, Activity, BookOpen, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

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
    <section id="solutions" className="mt-32 scroll-mt-24">
      <div className="mb-12 max-w-3xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Solutions
        </div>
        <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
          Everything you need for threat intelligence &amp; DFIR
        </h2>
        <p className="animate-fade-in-up mt-4 text-lg text-slate-700 dark:text-slate-400">
          A complete ecosystem of tools, feeds, and frameworks — built by an analyst, for analysts.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Link
              key={pillar.href}
              to={pillar.href}
              className="glass animate-fade-in-up group block rounded-2xl p-6 transition-all hover:border-brand-500/50 hover:-translate-y-1 hover:shadow-glow"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 group-hover:bg-brand-500/20 transition-colors">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {pillar.title}
                </h3>
                <ArrowRight
                  size={18}
                  className="ml-auto text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-all"
                  aria-hidden="true"
                />
              </div>
              <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{pillar.desc}</p>
              <ul className="flex flex-wrap gap-2">
                {pillar.bullets.map((b) => (
                  <li
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-glow transition-all hover:bg-brand-700 hover:-translate-y-0.5"
        >
          <Search size={16} aria-hidden="true" /> Open DFIR Toolkit
        </Link>
        <Link
          to="/threatintel"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-2.5 font-semibold text-slate-700 backdrop-blur-md transition-all hover:border-brand-500/50 hover:text-brand-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:text-brand-400"
        >
          <Globe size={16} aria-hidden="true" /> Browse Threat Intel
        </Link>
      </div>
    </section>
  );
}
