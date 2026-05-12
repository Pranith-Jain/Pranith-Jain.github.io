import { ArrowUpRight } from 'lucide-react';
import { featuredArticles } from '../../data/content';

/**
 * Featured — divider rows. Mono numeral + serif title + sans body.
 * Hover slides the right-side arrow forward; no scale, no spring.
 */
export function Featured() {
  return (
    <section id="featured" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Where the work shows up
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">Interviews and write-ups across security platforms.</p>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {featuredArticles.map((article, idx) => {
          const indexLabel = String(idx + 1).padStart(2, '0');
          return (
            <li key={article.title}>
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-2 py-7 sm:gap-x-6"
              >
                {/* Left numeral */}
                <span className="self-start pt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
                  {indexLabel}
                </span>

                {/* Title + description */}
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 transition-colors duration-enter group-hover:text-accent sm:text-2xl">
                    {article.title}
                  </h3>
                  <p className="mt-2 max-w-[65ch] text-sm leading-[1.55] text-ink-2">{article.description}</p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                    {article.source}
                  </div>
                </div>

                {/* Right arrow */}
                <ArrowUpRight
                  className="hidden h-4 w-4 shrink-0 self-start text-ink-3 transition-colors duration-enter group-hover:text-accent sm:block"
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
