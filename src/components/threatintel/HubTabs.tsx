/**
 * HubTabs — the threat-intel tool directory, one tab per hub.
 *
 * Structure borrowed from the novasky.io/threat-intelligence reference: a
 * sticky horizontal tab rail where every tab owns a slice of the area, and
 * each panel is a section header (icon + <h2> + blurb) followed by a grid of
 * widgets. That anatomy maps cleanly onto this app because the registry in
 * `data/threatintel-hubs.ts` already groups every routable page into a hub.
 *
 * Deliberately NOT ported from the reference:
 *   - Its tab bar is 12 flat buttons with no active-state affordance beyond
 *     a background wash. Here the active tab gets an underline + tinted
 *     background so it survives being scrolled or landed on via deep link.
 *   - Its panels are server-rendered HTML swapped by an inline script. Here
 *     the panels are pure render output of an in-memory registry, so there
 *     is no per-section fetch, no `data-ti-loaded` bookkeeping, and no
 *     polling timer - React handles the switch in one tick.
 *   - It hand-rolls `role="tab"` markup with no keyboard support. This uses
 *     the WAI-ARIA APG tabs pattern (roving tabindex, Arrow/Home/End, focus
 *     following activation).
 *
 * Deep linking: the active hub is mirrored to `?hub=<id>` with
 * `replace: true` so the URL is shareable and reload-stable without
 * pushing 19 entries onto the back stack. An unknown or missing `?hub`
 * falls back to the first hub rather than rendering an empty panel.
 *
 * All colour comes from the tokens in `src/index.css` (`--border-400`,
 * `--surface-200`, `--ink-heading`, `--muted`, `--color-brand-*`) so this
 * inherits both themes without a single raw `dark:slate-*` escape hatch.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { HUB_META } from '../../data/threatintel-hubs';

/** Query param that carries the active hub id. */
const HUB_PARAM = 'hub';

/** Total routable pages across every hub - shown in the rail header. */
const TOTAL_PAGES = HUB_META.reduce((sum, hub) => sum + hub.pages.length, 0);

/** Badge tone per `HubPageBadge`. Kept as literal strings so the JIT
 *  scanner sees every class (no template-built class names). */
const BADGE_CLASS: Record<string, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  new: 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-400',
  beta: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/** Tile grid: 1 col on phones, 2 from `sm`, 3 from `lg`. */
const TILE_GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';

export function HubTabs(): JSX.Element {
  const baseId = useId();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get(HUB_PARAM);
  // An unrecognised ?hub (stale bookmark, hand-edited URL) must not blank the
  // page - fall through to the first hub instead.
  const activeId = HUB_META.some((hub) => hub.id === requested) ? (requested as string) : HUB_META[0]!.id;
  const activeHub = HUB_META.find((hub) => hub.id === activeId) ?? HUB_META[0]!;

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = useCallback(
    (id: string) => {
      if (id === activeId) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(HUB_PARAM, id);
          return next;
        },
        // replace, not push: arrow-keying across 19 hubs should not create 19
        // history entries the user has to back through.
        { replace: true }
      );
    },
    [activeId, setSearchParams]
  );

  // Keep the active tab visible when the rail overflows (narrow viewports,
  // or deep-linking to a hub near the end of the list).
  useEffect(() => {
    tabRefs.current[activeId]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  /**
   * APG "Tabs with Automatic Activation". Safe here because panels render
   * from an in-memory registry - switching is synchronous, so there is no
   * latency for the eye to catch up on. Home/End jump to the ends; arrows
   * wrap. Only horizontal arrows are bound so PageUp/PageDown and vertical
   * scrolling keep working while focus sits in the rail.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = HUB_META.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;

    e.preventDefault();
    const hub = HUB_META[next]!;
    select(hub.id);
    tabRefs.current[hub.id]?.focus();
  }

  return (
    <section className="mt-10 sm:mt-12" aria-labelledby={`${baseId}-heading`}>
      {/* ── Section header ────────────────────────────────────────
          Same anatomy as the reference's per-panel header, hoisted to the
          section level because the rail is sticky and shared. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id={`${baseId}-heading`} className="font-display text-lg font-bold text-heading">
            Explore by topic
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {HUB_META.length} categories · {TOTAL_PAGES} pages · every tab is a shareable URL
          </p>
        </div>
        <Link
          to="/threatintel/catalog"
          className="group inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Compass size={13} aria-hidden="true" />
          Browse the full catalog
          <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      {/* ── Sticky tab rail ─────────────────────────────────────────
          `chrome-glass` gives it the same blur + hairline treatment as the
          site header, so it reads as a continuation of the chrome rather
          than a second floating bar. `scroll-snap-x` keeps the active tab
          aligned to the start edge once the list overflows.

          The `top-*` pair clears the sticky site header (Header.tsx renders
          a 36px logo inside `py-2.5 sm:py-3`, i.e. 56px tall on phones and
          60px from `sm` up). Matching those two values keeps the rail flush
          under the header instead of overlapping or floating a gap above it. */}
      <div className="chrome-glass sticky top-14 z-30 -mx-4 mb-6 px-4 py-2 sm:top-15 sm:-mx-6 sm:px-6">
        <div
          role="tablist"
          aria-label="Threat intelligence categories"
          aria-orientation="horizontal"
          className="flex gap-1.5 overflow-x-auto overscroll-x-contain scroll-snap-x scroll-mt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {HUB_META.map((hub, i) => {
            const isActive = hub.id === activeId;
            const Icon = hub.icon;
            return (
              <button
                key={hub.id}
                ref={(el) => {
                  tabRefs.current[hub.id] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${hub.id}`}
                aria-selected={isActive}
                // Only the selected tab carries aria-controls. Panels render
                // on demand rather than all 19 existing-but-hidden, so an
                // inactive tab pointing at an absent id would leave assistive
                // tech chasing a dangling reference. The active tab always has
                // its panel mounted, so the relationship resolves when needed.
                aria-controls={isActive ? `${baseId}-panel-${activeHub.id}` : undefined}
                // Roving tabindex: only the active tab is in the page tab
                // sequence, arrow keys move within the list.
                tabIndex={isActive ? 0 : -1}
                onClick={() => select(hub.id)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isActive
                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    : 'border-transparent text-muted hover:bg-wash hover:text-heading'
                }`}
              >
                <Icon size={13} aria-hidden="true" className={isActive ? '' : 'opacity-70'} />
                {hub.label}
                <span className="text-micro tabular-nums opacity-60">{hub.pages.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active panel ─────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeHub.id}`}
        aria-labelledby={`${baseId}-tab-${activeHub.id}`}
        // tabIndex 0 so keyboard users land inside the panel after tabbing
        // out of the rail, and screen readers announce its label.
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {/* Panel header - hub icon, title, blurb, and a jump to the
            filterable catalog scoped to this hub. */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-start gap-3">
            {(() => {
              const Icon = activeHub.icon;
              return (
                <span
                  className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded border border-line-1 bg-surface-200 text-rose-600 dark:text-rose-400"
                  aria-hidden="true"
                >
                  <Icon size={17} />
                </span>
              );
            })()}
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold leading-tight text-heading">{activeHub.label}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{activeHub.blurb}</p>
            </div>
          </div>
          <Link
            to={`/threatintel/catalog?cat=${activeHub.id}`}
            className="group inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Filter in catalog
            <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Tile grid. The hub icon is the default for pages that don't
            declare their own, which keeps the grid visually even. */}
        {activeHub.pages.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-2 p-8 text-center text-sm text-muted">
            Nothing in this category yet.
          </p>
        ) : (
          <ul className={TILE_GRID}>
            {activeHub.pages.map((page) => {
              const Icon = page.icon ?? activeHub.icon;
              return (
                <li key={page.path} className="h-full">
                  <Link
                    to={page.path}
                    className="group flex h-full flex-col rounded-card border border-line-1 bg-surface-100 p-4 transition-all hover:border-rose-500/30 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:border-line-2"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      {page.badge && (
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider ${
                            BADGE_CLASS[page.badge] ?? ''
                          }`}
                        >
                          {page.badge}
                        </span>
                      )}
                    </div>
                    <h4 className="font-display text-sm font-semibold leading-snug text-heading transition-colors group-hover:text-rose-700 dark:group-hover:text-rose-400">
                      {page.label}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{page.desc}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default HubTabs;
