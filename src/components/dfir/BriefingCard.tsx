import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { Briefing } from '../../data/dfir/briefings';

function TypeChip({ type }: { type: 'daily' | 'weekly' }): JSX.Element {
  const isDaily = type === 'daily';
  return (
    <span
      className={`text-xs font-mono px-2 py-0.5 rounded border ${
        isDaily
          ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
          : 'bg-violet-500/15 dark:bg-violet-400/15 text-violet-600 dark:text-violet-400 border-violet-500/40'
      }`}
    >
      {type}
    </span>
  );
}

function MitreTechniqueChip({ technique }: { technique: string }): JSX.Element {
  const href = `https://attack.mitre.org/techniques/${technique.replace('.', '/')}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 transition-colors"
    >
      {technique}
    </a>
  );
}

function IocChip({ type, value }: { type: string; value: string }): JSX.Element {
  return (
    <Link
      to={`/dfir/ioc-check?indicator=${encodeURIComponent(value)}`}
      className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
    >
      <span className="text-slate-400 dark:text-slate-600 uppercase">{type}</span>
      <span className="truncate max-w-[180px]">{value}</span>
    </Link>
  );
}

export function BriefingCard({ briefing }: { briefing: Briefing }): JSX.Element {
  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 leading-snug">
            {briefing.title}
          </h3>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            {briefing.type === 'weekly' ? briefing.date_range : briefing.date}
          </p>
        </div>
        <TypeChip type={briefing.type} />
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">{briefing.summary}</p>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs font-mono text-slate-500 mb-4">
        <span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{briefing.findings_count}</span> findings
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{briefing.cves_count}</span> CVEs
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-400">{briefing.sources.join(', ')}</span>
      </div>

      {/* MITRE techniques */}
      {briefing.mitre_techniques.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {briefing.mitre_techniques.map((t) => (
            <MitreTechniqueChip key={t} technique={t} />
          ))}
        </div>
      )}

      {/* Key IOCs */}
      {briefing.key_iocs && briefing.key_iocs.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Key IOCs</p>
          <div className="flex flex-wrap gap-2">
            {briefing.key_iocs.map((ioc) => (
              <IocChip key={ioc.value} type={ioc.type} value={ioc.value} />
            ))}
          </div>
        </div>
      )}

      {/* External publisher link */}
      {briefing.external_url && (
        <a
          href={briefing.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          View on {briefing.external_publisher ?? new URL(briefing.external_url).hostname}
          <ExternalLink size={12} />
        </a>
      )}
    </article>
  );
}
