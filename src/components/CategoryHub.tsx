import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Card } from './ui/Card';
import { DataPageLayout } from './DataPageLayout';

export interface CategoryItem {
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  badge?: 'live' | 'new' | 'beta';
}

export interface CategoryHubProps {
  /** Hub title shown in the page header. */
  title: string;
  /** Optional hub subtitle / blurb. */
  blurb?: string;
  /** Hero icon for the page header. */
  icon: LucideIcon;
  /** Path to navigate "back" to. */
  backTo: string;
  /** Back link label. Defaults to "back". */
  backLabel?: string;
  /** Items rendered as a tile grid. */
  items: ReadonlyArray<CategoryItem>;
  /** Optional per-tile accent — applied to the icon. */
  accentClass?: string;
}

/**
 * SaaS-style "category landing" page.
 *
 * Used at the root of each /threatintel/<hub> URL (e.g. /threatintel/iocs,
 * /threatintel/cves). Replaces the old tab-bar pattern with a clean tile
 * grid that links to direct sub-page URLs.
 *
 * Layout:
 *   <PageHeader />
 *   <TileGrid>
 *     <Tile label="Live IOCs" icon={Radar} href="/threatintel/iocs/live" />
 *     <Tile label="C2 Tracker" icon={Wifi} href="/threatintel/iocs/c2" />
 *     ...
 *   </TileGrid>
 *
 * Sub-pages (e.g. /threatintel/iocs/c2) are registered separately in
 * App.tsx and render the page component directly — no hub wrapper.
 */
export function CategoryHub({
  title,
  blurb,
  icon,
  backTo,
  backLabel = 'Threat Intel home',
  items,
  accentClass = 'text-rose-600 dark:text-rose-400',
}: CategoryHubProps): JSX.Element {
  return (
    <DataPageLayout
      backTo={backTo}
      backLabel={backLabel}
      icon={<CategoryHubIcon Icon={icon} accentClass={accentClass} />}
      title={title}
      description={blurb}
      maxWidthClass="max-w-7xl"
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 font-mono text-mini text-slate-500 dark:text-slate-400">
          <span>
            {items.length} {items.length === 1 ? 'page' : 'pages'} in this category · each tile links to a direct URL
          </span>
        </div>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <CategoryTile item={item} accentClass={accentClass} />
          </li>
        ))}
      </ul>
    </DataPageLayout>
  );
}

function CategoryHubIcon({ Icon, accentClass }: { Icon: LucideIcon; accentClass: string }): JSX.Element {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-current/30 bg-current/10 ${accentClass}`}
    >
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}

function CategoryTile({ item, accentClass }: { item: CategoryItem; accentClass: string }): JSX.Element {
  const Icon = item.icon;
  return (
    <Link to={item.href} className="group block h-full">
      <Card
        variant="interactive"
        padding="md"
        className="h-full transition-[transform,border-color,box-shadow] group-hover:-translate-y-0.5"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-current/20 bg-current/10 ${accentClass}`}
          >
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="flex flex-col items-end gap-1">
            {item.badge && (
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  item.badge === 'live'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : item.badge === 'new'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                }`}
              >
                {item.badge}
              </span>
            )}
            <ArrowRight
              size={14}
              className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-slate-700"
              aria-hidden="true"
            />
          </div>
        </div>
        <h3 className="mb-1 font-display text-base font-semibold text-slate-900 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
          {item.label}
        </h3>
        <p className="line-clamp-2 text-tool leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
        <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{item.href}</p>
      </Card>
    </Link>
  );
}
