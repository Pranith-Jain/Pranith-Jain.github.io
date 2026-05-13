import { Quote } from 'lucide-react';
import { getQuoteOfTheDay } from '../data/quotes';

/**
 * Daily rotating quote shown between Hero and Featured on the home page.
 * Selection is deterministic by day-of-year (UTC) so SSR and client agree.
 */
export function DailyQuote() {
  const quote = getQuoteOfTheDay();
  return (
    <section aria-label="Quote of the day" className="py-3 sm:py-5">
      <figure className="glass relative overflow-hidden px-6 py-7 sm:px-10 sm:py-9 group transition-colors duration-enter hover:border-accent/30">
        {/* Soft accent glow behind the quote — strongest on hover */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full opacity-60 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)',
          }}
        />

        <div className="relative flex items-start gap-4">
          <Quote className="h-5 w-5 shrink-0 text-accent/80" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent mb-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" />
                Quote of the day
              </span>
              <span className="text-rule" aria-hidden="true">
                ·
              </span>
              <span className="text-ink-3">{quote.topic}</span>
            </div>
            <blockquote className="text-[clamp(1.125rem,2vw,1.375rem)] leading-[1.45] text-ink-1 font-medium tracking-tight max-w-[60ch]">
              “{quote.text}”
            </blockquote>
            <figcaption className="mt-3 text-[12px] text-ink-2">
              — <span className="text-ink-1">{quote.attribution}</span>
            </figcaption>
          </div>
        </div>
      </figure>
    </section>
  );
}
