import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { companies } from '../../data/content';

const DEFAULT_VISIBLE = 6;

/**
 * Companies — quiet wordmark row. By default shows the first 6 brands
 * as a typeset row; "Show all" reveals the rest. No logos, no chip
 * chrome — typography carries the trust signal.
 */
export function Companies() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? companies : companies.slice(0, DEFAULT_VISIBLE);
  const remaining = companies.length - DEFAULT_VISIBLE;

  return (
    <section id="companies" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Enterprise partnerships
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Email infrastructure secured for 150+ startups and enterprises across AI, HealthTech, and SaaS.
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-8 text-base font-medium text-ink-2">
        {visible.map((company) => (
          <li key={company} className="transition-colors duration-enter hover:text-ink-1">
            {company}
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-colors duration-enter hover:text-brand-700"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
              Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              Show all {companies.length}
            </>
          )}
        </button>
      )}
    </section>
  );
}
