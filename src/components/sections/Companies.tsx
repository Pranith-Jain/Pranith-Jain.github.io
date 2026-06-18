interface CompaniesProps {
  companies: string[];
}

export function Companies({ companies }: CompaniesProps) {
  return (
    <section id="companies" className="scroll-mt-24">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Worked with
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Brands I&rsquo;ve worked with
        </h2>
        <p className="mt-3 text-base sm:text-lg text-muted">
          Email infrastructure, DFIR, and detection work shipped across 150+ startups and enterprises in AI, HealthTech,
          and SaaS.
        </p>
      </div>

      {/* Company tiles — small bordered chips, consistent with the rest of
          the design system: rounded-xl, thin border, no glass, no lift on
          hover. The hover state only nudges the border colour. */}
      <div className="flex flex-wrap gap-2.5">
        {companies.map((company) => (
          <div
            key={company}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:border-brand-500/40"
          >
            {company}
          </div>
        ))}
      </div>
    </section>
  );
}
