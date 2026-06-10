import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface AppBreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface AppBreadcrumbProps {
  items: AppBreadcrumbItem[];
  /**
   * Optional section root for the first crumb. When `home` is supplied, the
   * breadcrumb is prefixed with a small Home icon linking to the section
   * landing (e.g. /threatintel or /dfir). Most tool pages will pass this.
   */
  home?: { label: string; href: string };
  className?: string;
}

/**
 * Breadcrumb for the /dfir and /threatintel surfaces. Uses react-router
 * `Link` (not raw <a>) so navigation stays SPA-instant. The existing
 * portfolio `ui/Breadcrumbs` keeps raw anchors because it lives outside
 * the router and must work in static prerender too.
 *
 * Visual contract:
 *   - mono font, xs size, slate-500 with a brighter last crumb
 *   - chevron separator (same as the portfolio version for consistency)
 *   - when `home` is set, a small Home glyph prefixes the trail
 *   - the last crumb is aria-current="page" + non-link
 */
export function AppBreadcrumb({ items, home, className = '' }: AppBreadcrumbProps): JSX.Element | null {
  if (items.length === 0 && !home) return null;
  const trail: AppBreadcrumbItem[] = home ? [{ label: home.label, href: home.href, icon: Home }, ...items] : items;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-mini font-mono text-slate-500 dark:text-slate-400">
        {trail.map((item, i) => {
          const isLast = i === trail.length - 1;
          const Icon = item.icon;
          return (
            <li key={`${item.href ?? ''}::${item.label}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="inline-flex items-center gap-1 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
                >
                  {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={`inline-flex items-center gap-1 ${isLast ? 'font-semibold text-slate-900 dark:text-white' : ''}`}
                >
                  {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
                  <span>{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Convenience: derive breadcrumb items from a path + label map. The label
 * map is keyed by full path; unmatched segments are auto-capitalised.
 *
 * Example:
 *   <AppBreadcrumbAuto
 *     pathname={location.pathname}
 *     labels={{ '/threatintel/live-iocs': 'Live IOCs' }}
 *     home={{ label: 'Threat Intel', href: '/threatintel' }}
 *   />
 */
export function AppBreadcrumbAuto({
  pathname,
  labels,
  home,
}: {
  pathname: string;
  labels: Record<string, string>;
  home: { label: string; href: string };
}): JSX.Element | null {
  if (pathname === home.href) {
    return <AppBreadcrumb items={[{ label: 'Dashboard' }]} home={home} />;
  }
  const segments = pathname.split('/').filter(Boolean);
  // Skip the section root (e.g. "threatintel") since `home` carries it.
  const rest = segments.slice(1);
  const items: AppBreadcrumbItem[] = [];
  let acc = `/${segments[0]}`;
  for (const seg of rest) {
    acc += `/${seg}`;
    const label = labels[acc] ?? humanise(seg);
    items.push({ label, href: acc });
  }
  // Last item shouldn't be a link (visual convention: current page).
  if (items.length > 0) {
    items[items.length - 1] = { label: items[items.length - 1]!.label };
  }
  return <AppBreadcrumb items={items} home={home} />;
}

function humanise(seg: string): string {
  return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
