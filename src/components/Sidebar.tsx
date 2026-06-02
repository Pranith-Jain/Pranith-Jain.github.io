import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SidebarConfig } from '../data/sidebar-nav';

interface SidebarProps {
  config: SidebarConfig;
}

/**
 * Same localStorage key as the desktop sidebar so the collapsed/expanded
 * preference is shared. (Mobile drawer never has a "collapsed" state
 * because there's no width to collapse into; the key is reserved for
 * future use if the drawer gets a hamburger-toggle variant.)
 */
const STORAGE_KEY = 'sidebar-collapsed';

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  if (href === '/threatintel') return false;
  if (href === '/dfir') return false;
  return pathname.startsWith(href + '/') || pathname.startsWith(href + '?');
}

/**
 * Inner content shared between the desktop Sidebar and the mobile
 * drawer. Renders the section label header, the grouped category list,
 * and the bottom item-count footer. No outer positioning chrome — the
 * caller decides whether to wrap in a sticky aside (desktop) or a
 * full-height drawer panel (mobile).
 */
export function SidebarContent({ config }: { config: SidebarConfig }): JSX.Element {
  const location = useLocation();
  const totalItems = config.groups.reduce((n, g) => n + g.items.length, 0);

  // No header row here. The section label is already provided by:
  //   - the TopBar brand on desktop
  //   - the Drawer's `title` prop on mobile
  // Showing it again would be duplicate chrome. The footer carries
  // the item count, which is the only stat the user needs to know
  // "how big is this surface".
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={`${config.sectionLabel} categories`}>
        {config.groups.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            <div className="px-2 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(location.pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                        active
                          ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 ${
                          active
                            ? 'text-brand-600 dark:text-brand-400'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate flex-1">{item.label}</span>
                      {active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200/60 px-3 py-2 dark:border-white/10">
        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{totalItems} tools</span>
      </div>
    </>
  );
}

/**
 * Desktop sidebar. Sticky on the left, collapsible to an icon-rail
 * (56px) with a persisted localStorage preference. The collapse toggle
 * is desktop-only because there's no width to collapse into on the
 * mobile drawer; the mobile drawer always shows full labels (sized
 * for thumb-tap targets).
 */
export function Sidebar({ config }: SidebarProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const width = collapsed ? 'w-14' : 'w-60';

  return (
    <aside
      className={`hidden md:flex flex-col ${width} flex-shrink-0 transition-[width] duration-200 ease-out`}
      aria-label={`${config.sectionLabel} navigation`}
    >
      <div className="sticky top-16 max-h-[calc(100vh-4rem)] flex flex-col border-r border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
        {collapsed ? <SidebarContentCollapsed config={config} /> : <SidebarContent config={config} />}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 px-2 py-1.5 dark:border-white/10">
          {/* Expanded state shows the item count in SidebarContent's footer
              already; only the collapsed rail needs an sr-only count here. */}
          {collapsed && <span className="sr-only">{config.groups.reduce((n, g) => n + g.items.length, 0)} tools</span>}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 ml-auto"
            aria-label={collapsed ? `Expand ${config.sectionLabel} sidebar` : `Collapse ${config.sectionLabel} sidebar`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Icon-rail variant for the desktop collapsed state. Re-uses the same
 * nav items but hides labels and group headers, leaving only the icons
 * (and a tooltip via the `title` attr). Items are still full-width
 * rows for tap targets.
 */
function SidebarContentCollapsed({ config }: { config: SidebarConfig }): JSX.Element {
  const location = useLocation();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={`${config.sectionLabel} categories`}>
      {config.groups.map((group) => (
        <div key={group.title} className="mb-2 last:mb-0 space-y-0.5">
          {group.items.map((item) => {
            const active = isActive(location.pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={`grid h-9 w-9 mx-auto place-items-center rounded-lg transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  active
                    ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'text-slate-500 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-brand-600 dark:text-brand-400' : ''}`} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
