import { Link } from 'react-router-dom';
import { Shield, Eye, Radar } from 'lucide-react';

const APPS = [
  {
    name: 'CRUCIBLE',
    description:
      'Digital forensics & incident response toolkit. 90+ interactive tools for IOC triage, malware analysis, memory forensics, and cloud incident response.',
    href: '/dfir',
    icon: Shield,
    accent: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20',
    tag: '90+ Tools',
  },
  {
    name: 'PANOPTICON',
    description:
      'Threat intelligence platform. Live CTI feeds, actor dossiers, campaign tracking, dark web monitoring, and predictive analytics.',
    href: '/threatintel',
    icon: Eye,
    accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    tag: '100+ Sources',
  },
  {
    name: 'SCOUT',
    description:
      'Domain & URL reconnaissance scanner. Deep crawl, JS analysis, API endpoint discovery, secret detection, and security scoring.',
    href: '/radar',
    icon: Radar,
    accent: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20',
    tag: 'Live Scan',
  },
];

export function AccessApps() {
  return (
    <section className="w-full">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Applications
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link
              key={app.name}
              to={app.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:shadow-slate-900/50"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${app.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {app.tag}
                </span>
              </div>
              <h3 className="mb-1.5 text-sm font-bold text-slate-900 dark:text-white">{app.name}</h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{app.description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300">
                Open
                <ArrowIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
