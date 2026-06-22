import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { SidebarConfig } from '../data/sidebar-nav';

interface SidebarProps {
  config: SidebarConfig;
}

const STORAGE_KEY = 'sidebar-collapsed';
const GROUPS_KEY = 'sidebar-expanded-groups';

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  if (href === '/threatintel') return false;
  if (href === '/dfir') return false;
  return pathname.startsWith(href + '/') || pathname.startsWith(href + '?');
}

function toneClasses(tone: 'brand' | 'rose' = 'brand') {
  if (tone === 'rose') {
    return {
      // Geist active: surface-200 wash (subtle), tone-tinted icon, and
      // a tone-tinted dot at the trailing edge. The label itself stays
      // slate-900 so the text colour always reads at WCAG AA.
      activeBg: 'bg-rose-500/10 text-slate-900 dark:text-white',
      activeIcon: 'text-rose-600 dark:text-rose-400',
      activeDot: 'bg-rose-500',
      activeBorder: 'border-rose-500',
      focusRing: 'focus-visible:ring-rose-500',
    };
  }
  return {
    activeBg: 'bg-brand-500/10 text-slate-900 dark:text-white',
    activeIcon: 'text-brand-600 dark:text-brand-400',
    activeDot: 'bg-brand-500',
    activeBorder: 'border-brand-500',
    focusRing: 'focus-visible:ring-brand-500',
  };
}

function useExpandedGroups(pathname: string): [Set<string>, (title: string) => void] {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(GROUPS_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return new Set();
  });

  // Auto-expand the group containing the active page
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      // Find which group has the active item — always expand it
      // This is done by the caller passing the groups config
      return next;
    });
  }, [pathname]);

  const toggle = (title: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return [expanded, toggle];
}

/**
 * Sidebar with collapsible groups. Each group has a toggle at the top
 * so users don't have to scroll to the bottom to find controls.
 */
export function SidebarContent({ config }: { config: SidebarConfig }): JSX.Element {
  const location = useLocation();
  const totalItems = config.groups.reduce((n, g) => n + g.items.length, 0);
  const { activeBg, activeIcon, activeDot, focusRing } = toneClasses(config.tone);
  const [expanded, toggle] = useExpandedGroups(location.pathname);

  // Auto-expand group containing active page
  useEffect(() => {
    for (const group of config.groups) {
      if (group.items.some((item) => isActive(location.pathname, item.href))) {
        if (!expanded.has(group.title)) {
          toggle(group.title);
        }
      }
    }
  }, [location.pathname]);

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={`${config.sectionLabel} categories`}>
        {config.groups.map((group) => {
          const isExpanded = expanded.has(group.title);
          const hasActive = group.items.some((item) => isActive(location.pathname, item.href));
          return (
            <div key={group.title} className="mb-1 last:mb-0">
              <button
                type="button"
                onClick={() => toggle(group.title)}
                className={`w-full flex items-center justify-between gap-1 px-2 py-1.5 text-micro font-mono font-semibold uppercase tracking-[0.12em] transition-colors rounded ${
                  hasActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-expanded={isExpanded}
                aria-controls={`sidebar-group-${group.title.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <span className="truncate">{group.title}</span>
                <ChevronDown
                  size={12}
                  className={`shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                  aria-hidden="true"
                />
              </button>
              {isExpanded && (
                <ul id={`sidebar-group-${group.title.replace(/\s+/g, '-').toLowerCase()}`} className="space-y-0.5 pb-2">
                  {group.items.map((item) => {
                    const active = isActive(location.pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`group flex items-center gap-2 px-2 py-1.5 text-[13px] transition focus:outline-none focus-visible:ring-2 ${focusRing} ${
                            active
                              ? `${activeBg} font-medium`
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#16161f] dark:hover:text-slate-200'
                          }`}
                        >
                          <Icon
                            size={14}
                            className={`flex-shrink-0 ${
                              active
                                ? activeIcon
                                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                          {active && (
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${activeDot} shrink-0 ml-auto`}
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[rgb(var(--border-400))] px-3 py-2">
        <span className="text-micro font-mono text-slate-400 dark:text-slate-500">{totalItems} tools</span>
      </div>
    </>
  );
}

export function Sidebar({ config }: SidebarProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* private mode / quota */
    }
  }, [collapsed]);

  const width = collapsed ? 'w-12' : 'w-56';

  return (
    <aside
      className={`hidden md:flex flex-col ${width} flex-shrink-0 transition-[width] duration-200 ease-out`}
      aria-label={`${config.sectionLabel} navigation`}
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] flex flex-col border-r border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))]">
        {collapsed ? <SidebarContentCollapsed config={config} /> : <SidebarContent config={config} />}
        <div className="flex items-center justify-end border-t border-[rgb(var(--border-400))] px-2 py-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-6 w-6 place-items-center text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarContentCollapsed({ config }: { config: SidebarConfig }): JSX.Element {
  const location = useLocation();
  const { activeBg, activeIcon, activeBorder, focusRing } = toneClasses(config.tone);
  return (
    <nav className="flex-1 overflow-y-auto px-1.5 py-3" aria-label={`${config.sectionLabel} categories`}>
      {config.groups.map((group) => (
        <div key={group.title} className="mb-1 last:mb-0 space-y-0.5">
          {group.items.map((item) => {
            const active = isActive(location.pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={`grid h-8 w-8 mx-auto place-items-center transition focus:outline-none focus-visible:ring-2 ${focusRing} ${
                  active
                    ? `${activeBg} border-l-2 ${activeBorder}`
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#16161f] dark:hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={active ? activeIcon : ''} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
