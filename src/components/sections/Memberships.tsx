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
    <section id="memberships" className="mt-32 scroll-mt-24">
      {/* Header */}
      <div className="mb-16 max-w-3xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Professional Affiliations
        </div>
        <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
          Memberships
        </h2>
        <p className="animate-fade-in-up mt-4 text-lg text-slate-700 dark:text-slate-400">
          Active contributor to premier cybersecurity and intelligence communities.
        </p>
      </div>

      {/* Memberships Grid */}
      <div className="animate-fade-in-up grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {memberships.map((membership) => {
          const colors = colorMap[membership.color] || colorMap.brand;
          return (
            <div
              key={membership.name}
              className="animate-fade-in-up glass group flex flex-col gap-6 p-8 rounded-[2rem] transition-all hover:shadow-glow hover:-translate-y-2 border-white/20 bg-white/40 dark:bg-slate-900/40 h-full"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`grid h-14 w-14 place-items-center rounded-2xl font-black text-xl ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}
                >
                  {membership.abbreviation}
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}
                >
                  Member
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
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
