import { companies } from '../../data/content';

export function Companies() {
  return (
    <section id="companies" className="mt-32 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-3xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Worked with
        </div>
        <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
          Brands I&rsquo;ve worked with
        </h2>
        <p className="animate-fade-in-up mt-4 text-lg text-slate-700 dark:text-slate-400">
          Email infrastructure, DFIR, and detection work shipped across 150+ startups and enterprises in AI, HealthTech,
          and SaaS.
        </p>
      </div>

      {/* Companies Grid */}
      <div className="animate-fade-in-up flex flex-wrap justify-start gap-4">
        {companies.map((company) => (
          <div
            key={company}
            className="animate-fade-in-up glass px-6 py-3 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-all hover:border-brand-500/50 hover:bg-brand-500/5 hover:-translate-y-1 cursor-default"
          >
            {company}
          </div>
        ))}
      </div>
    </section>
  );
}
