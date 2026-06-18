import { Link } from 'react-router-dom';
import { Shield, Radio, ArrowUpRight } from 'lucide-react';

const toolkits = [
  {
    id: 'dfir',
    icon: Shield,
    title: 'DFIR Toolkit',
    description: 'Browser-side tools I built for the incidents I work — edge-hosted on Cloudflare, free, no signup.',
    rows: [
      ['IOC checker', '20+ providers · SSE streaming'],
      ['Frameworks', 'Diamond Model · Kill Chain · MITRE ATT&CK'],
      ['STIX 2.1 viewer', 'Interactive relationship graph'],
    ],
    builtWith: ['Cloudflare Workers', 'Hono', 'SSE', 'TypeScript'],
    href: '/dfir',
    stat: '60+',
    statLabel: 'tools',
    cta: 'Open the toolkit',
  },
  {
    id: 'threatintel',
    icon: Radio,
    title: 'Threat Intel Platform',
    description: 'Live CTI surface that correlates 18 feeds into consensus verdicts instead of single-source noise.',
    rows: [
      ['IOC correlation', '18 feeds · cross-source consensus'],
      ['Coverage', 'Ransomware · dark web · breaches · actors'],
      ['Export', 'STIX 2.1 bundle · actor KB · live detections'],
    ],
    builtWith: ['Cloudflare Workers', 'Durable Objects', 'Python', 'STIX 2.1'],
    href: '/threatintel',
    stat: '18',
    statLabel: 'feeds',
    cta: 'Open the platform',
  },
];

export function Toolkits() {
  return (
    <section id="toolkits" className="scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="mb-3 text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">Tooling</div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Toolkits I ship
        </h2>
        <p className="mt-3 text-base sm:text-lg text-muted leading-relaxed">
          Edge-hosted security tools that do the work alongside me — free, no login, built in public.
        </p>
      </div>

      <div className="stagger grid gap-4 grid-cols-1 md:grid-cols-2">
        {toolkits.map((tk) => {
          const Icon = tk.icon;
          return (
            <Link
              key={tk.id}
              to={tk.href}
              className="group card-hover flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 transition h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="font-display text-2xl font-bold text-slate-900 dark:text-white">{tk.stat}</span>
                  <span className="text-mini font-mono text-slate-400">{tk.statLabel}</span>
                </div>
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {tk.title}
              </h3>
              <p className="mt-2 text-sm text-muted leading-relaxed flex-1">{tk.description}</p>

              {/* Hunt.io style: a small data-table of capabilities rather
                  than bullet copy. One column label, one value, hairline
                  rows, mono values. */}
              <dl className="mt-4 -mx-1 divide-y divide-slate-200/70 dark:divide-slate-800 border-y border-slate-200/70 dark:border-slate-800">
                {tk.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-3 px-1 py-2 text-sm">
                    <dt className="text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">{k}</dt>
                    <dd className="text-slate-700 dark:text-slate-300 font-mono text-meta leading-snug">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {tk.builtWith.map((tech) => (
                  <span
                    key={tech}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 text-micro font-mono text-slate-500 dark:text-slate-400"
                  >
                    {tech}
                  </span>
                ))}
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400">
                <span>{tk.cta}</span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
