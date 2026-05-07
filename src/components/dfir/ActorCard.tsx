import { Link } from 'react-router-dom';
import type { ThreatActor } from '../../data/dfir/threat-actors';

const SOPH_STYLES: Record<string, string> = {
  'nation-state': 'bg-rose-500/15 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  expert: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  advanced: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-500 border-amber-500/40',
  intermediate:
    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
  novice: 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700',
};

export function ActorCard({ actor }: { actor: ThreatActor }): JSX.Element {
  return (
    <Link
      to={`/dfir/actors/${actor.slug}`}
      className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{actor.name}</h3>
          {actor.aliases.length > 0 && (
            <p className="text-xs font-mono text-slate-500 mt-0.5">{actor.aliases.slice(0, 3).join(' · ')}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded border ${
              actor.status === 'active'
                ? 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
            }`}
          >
            {actor.status}
          </span>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded border ${SOPH_STYLES[actor.sophistication] ?? SOPH_STYLES.novice}`}
          >
            {actor.sophistication}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 mb-3">
        {actor.description}
      </p>
      <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
        {actor.country && <span>{actor.country}</span>}
        <span>{actor.techniques.length} techniques</span>
        <span>{actor.malware.length} tools</span>
      </div>
    </Link>
  );
}
