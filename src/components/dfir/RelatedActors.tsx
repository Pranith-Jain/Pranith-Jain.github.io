import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { lookupActors, type CtiHints } from '../../lib/dfir/actor-lookup';

export function RelatedActors({ hints }: { hints: CtiHints }): JSX.Element | null {
  const matches = lookupActors(hints, 6);
  if (matches.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <header className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Related Threat Actors</h3>
      </header>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {matches.map(({ actor, matched }) => (
          <Link
            key={actor.slug}
            to={`/dfir/actors/${actor.slug}`}
            className="block rounded-lg border border-slate-200 dark:border-slate-800 p-3 hover:border-brand-500/40 transition-colors"
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                {actor.name}
              </span>
              {actor.country && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  {actor.country.length <= 3 ? actor.country : actor.country.slice(0, 3)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">
              {actor.description.split('.')[0]}.
            </p>
            <div className="flex flex-wrap gap-1">
              {matched.slice(0, 3).map((m) => (
                <span
                  key={m}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                >
                  {m}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
