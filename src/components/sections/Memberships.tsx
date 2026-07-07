import type { Membership } from '../../core/entities';

interface MembershipsProps {
  memberships: Membership[];
}

// Single brand palette across every membership card — the previous
// 4-color colorMap read as the "bento with 5+ accent colors" AI tell.
const ABBREV_TILE =
  'grid h-9 w-9 place-items-center rounded bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-mono text-meta font-semibold';
const MEMBER_PILL =
  'rounded bg-slate-100 px-2 py-0.5 text-micro font-mono uppercase tracking-[0.15em] text-slate-500 dark:bg-white/5 dark:text-slate-400';

export function Memberships({ memberships }: MembershipsProps) {
  return (
    <section id="memberships" className="scroll-mt-24">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Professional Affiliations
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Memberships
        </h2>
        <p className="mt-3 text-base sm:text-lg text-muted">Member of the communities I learn the most from.</p>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {memberships.map((membership) => {
          return (
            <div key={membership.name} className="flex flex-col gap-5 p-6 surface-card h-full">
              <div className="flex items-center justify-between">
                <span className={ABBREV_TILE}>{membership.abbreviation}</span>
                <span className={MEMBER_PILL}>Member</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-[-0.96px] text-slate-900 dark:text-white">
                  {membership.name}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{membership.period}</p>
                <p className="mt-3 text-sm text-muted leading-relaxed">{membership.description}</p>
                {membership.details && (
                  <ul className="mt-4 space-y-2 text-xs text-muted">
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
