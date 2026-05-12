import { memberships } from '../../data/content';

/**
 * Memberships — flat editorial list. Monochrome abbreviation tile +
 * serif name + sans description. No glass, no hover-glow, no
 * per-org color differentiation.
 */
export function Memberships() {
  return (
    <section id="memberships" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Professional affiliations
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Active contributor to cybersecurity and intelligence communities.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {memberships.map((membership) => (
          <article
            key={membership.name}
            className="flex h-full flex-col border border-rule bg-surface-raised p-6 transition-colors duration-enter hover:border-ink-1"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-12 w-12 place-items-center bg-accent-soft text-sm font-semibold tracking-tight text-accent">
                {membership.abbreviation}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Member</div>
            </div>
            <h3 className="mt-5 font-serif text-xl font-medium leading-tight text-ink-1">{membership.name}</h3>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{membership.period}</p>
            <p className="mt-3 text-sm leading-[1.55] text-ink-2">{membership.description}</p>
            {membership.details && (
              <ul className="mt-4 space-y-2 text-sm text-ink-2">
                {membership.details.map((detail) => (
                  <li key={detail.label} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>
                      <span className="text-ink-1">{detail.label}:</span> {detail.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
