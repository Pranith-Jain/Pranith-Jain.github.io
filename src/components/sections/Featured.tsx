import { featuredArticles } from '../../data/content';

export function Featured() {
  return (
    <section id="featured" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Recognition
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Where the work shows up
        </h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
          Interviews and writeups across security platforms.
        </p>
      </div>

      {/* Articles Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featuredArticles.map((article) => (
          <a
            key={article.title}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 transition hover:border-brand-500/40 h-full"
          >
            <div className="flex items-center justify-between">
              <div
                className={`grid h-12 w-12 place-items-center rounded-xl font-black text-lg ${
                  article.category === 'Security Specialist'
                    ? 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
                }`}
              >
                {article.category === 'Security Specialist' ? 'F' : 'D'}
              </div>
              <div
                className={`rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] ${
                  article.category === 'Security Specialist'
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                }`}
              >
                {article.category === 'Security Specialist' ? 'Expert Profile' : 'Published Article'}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {article.title}
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{article.description}</p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>{article.source}</span>
                <span>•</span>
                <span>{article.category}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
