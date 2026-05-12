import { ArrowUpRight } from 'lucide-react';
import { featuredArticles } from '../../data/content';

/**
 * Featured — editorial divider rows. F/D letter mark on the left rail
 * (kept as a brand signature), title + description + source on the
 * right. Hover: arrow translates 2px on the spring easing.
 */
export function Featured() {
  return (
    <section id="featured" className="mt-24 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="animate-fade-in-up mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          05 — Recognition
        </div>
        <h2 className="animate-fade-in-up font-serif text-3xl font-normal italic tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Where the work shows up
        </h2>
        <p className="animate-fade-in-up mt-3 max-w-[65ch] text-base text-slate-700 dark:text-slate-400">
          Interviews and write-ups across security platforms.
        </p>
      </div>

      <ul className="animate-fade-in-up divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {featuredArticles.map((article) => {
          const isExpert = article.category === 'Security Specialist';
          const markLetter = isExpert ? 'F' : 'D';
          return (
            <li key={article.title}>
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-2 py-7 sm:gap-x-6"
              >
                {/* Left mark — F (profile) / D (article) */}
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center self-start rounded-lg font-display text-base font-black ${
                    isExpert
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-gradient-to-br from-brand-600 to-brand-400 text-white'
                  }`}
                  aria-hidden="true"
                >
                  {markLetter}
                </div>

                {/* Title + description */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-serif text-lg font-normal italic leading-tight text-slate-900 transition-transform duration-200 ease-spring group-hover:translate-x-1 sm:text-xl dark:text-white">
                      {article.title}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        isExpert
                          ? 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {isExpert ? 'profile' : 'article'}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[65ch] text-[13px] leading-relaxed text-slate-700 dark:text-slate-400">
                    {article.description}
                  </p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {article.source}
                  </div>
                </div>

                {/* Right arrow — spring nudge on hover */}
                <ArrowUpRight
                  className="hidden h-4 w-4 shrink-0 self-start text-slate-400 transition-transform duration-200 ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 sm:block dark:group-hover:text-brand-400"
                  aria-hidden="true"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
