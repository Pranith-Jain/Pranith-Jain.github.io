import { Link } from 'react-router-dom';
import { Shield, Radio, Wrench } from 'lucide-react';

const toolkits = [
  {
    id: 'dfir',
    icon: Shield,
    title: 'DFIR Toolkit',
    description: 'Interactive DFIR tools I built for the incidents I work every day — edge-hosted, free, no signup.',
    features: [
      'IOC checker that fans out to 20+ threat intel providers over SSE',
      'Diamond Model, Kill Chain, and MITRE ATT&CK Matrix visualizers',
      'STIX 2.1 viewer with interactive relationship graph',
    ],
    builtWith: ['Cloudflare Workers', 'Hono', 'SSE', 'TypeScript'],
    href: '/dfir',
    stat: '60+',
    statLabel: 'tools',
    cta: 'Explore the tools',
  },
  {
    id: 'threatintel',
    icon: Radio,
    title: 'Threat Intel Platform',
    description: 'Live CTI surface that correlates 18 feeds into consensus verdicts instead of single-source noise.',
    features: [
      'Multi-source IOC correlation — 18 feeds, consensus verdicts',
      'Ransomware group tracking, dark web & breach monitoring',
      'STIX 2.1 export, actor KB, and live detection engine',
    ],
    builtWith: ['Cloudflare Workers', 'Durable Objects', 'Python', 'STIX 2.1'],
    href: '/threatintel',
    stat: '18',
    statLabel: 'feeds',
    cta: 'Explore the platform',
  },
];

export function Toolkits() {
  return (
    <section id="toolkits" className="mt-20 scroll-mt-24">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-eyebrow font-bold uppercase text-brand-600 dark:text-brand-400">Tooling</div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Toolkits I ship
        </h2>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Edge-hosted security tools that do the work alongside me — free, no login, built in public.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        {toolkits.map((tk) => {
          const Icon = tk.icon;
          return (
            <Link
              key={tk.id}
              to={tk.href}
              className="group flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 transition hover:border-brand-500/40 h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="font-display text-2xl font-bold text-brand-600 dark:text-brand-400">{tk.stat}</span>
                  <span className="text-[11px] font-mono text-slate-400">{tk.statLabel}</span>
                </div>
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {tk.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex-1">{tk.description}</p>
              <ul className="mt-4 space-y-1.5">
                {tk.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tk.builtWith.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400"
                  >
                    {tech}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tk.cta}</span>
                <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
