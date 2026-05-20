import { memberships } from '../../data/content';

const colorMap: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  brand: {
    bg: 'bg-brand-50',
    text: 'text-brand-600',
    darkBg: 'dark:bg-brand-900/30',
    darkText: 'dark:text-brand-300',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    darkBg: 'dark:bg-emerald-900/30',
    darkText: 'dark:text-emerald-300',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    darkBg: 'dark:bg-cyan-900/30',
    darkText: 'dark:text-cyan-300',
  },
};

export function Memberships() {
  return (
    <section id="memberships" className="mt-20 scroll-mt-24">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Professional Affiliations
        </div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Memberships
        </h2>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Active contributor to premier cybersecurity and intelligence communities.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {memberships.map((membership) => {
          const colors = colorMap[membership.color] || colorMap.brand;
          return (
            <div
              key={membership.name}
              className="group flex flex-col gap-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 transition hover:border-brand-500/40 h-full"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-xl font-black text-lg ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}
                >
                  {membership.abbreviation}
                </div>
                <div
                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}
                >
                  Member
                </div>
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {membership.name}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{membership.period}</p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {membership.description}
                </p>
                {membership.details && (
                  <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    {membership.details.map((detail) => (
                      <li key={detail.label} className="flex items-start gap-2">
                        <span className="text-brand-500 mt-0.5">•</span>
                        <span>
                          <strong>{detail.label}:</strong> {detail.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
