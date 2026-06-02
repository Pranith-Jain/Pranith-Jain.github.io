import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SidebarConfig } from '../data/sidebar-nav';

interface SidebarProps {
  config: SidebarConfig;
}

const STORAGE_KEY = 'sidebar-collapsed';

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  if (href === '/threatintel') return false;
  if (href === '/dfir') return false;
  return pathname.startsWith(href + '/') || pathname.startsWith(href + '?');
}

export function Sidebar({ config }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const width = collapsed ? 'w-14' : 'w-60';
  const showLabels = !collapsed;

  return (
    <aside
      className={`hidden md:flex flex-col ${width} flex-shrink-0 transition-[width] duration-200 ease-out`}
      aria-label={`${config.sectionLabel} navigation`}
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] flex flex-col rounded-2xl border border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 px-3 py-2.5 dark:border-white/10">
          {showLabels ? (
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 truncate">
              {config.sectionLabel}
            </span>
          ) : (
            <span className="sr-only">{config.sectionLabel}</span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label={collapsed ? `Expand ${config.sectionLabel} sidebar` : `Collapse ${config.sectionLabel} sidebar`}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={`${config.sectionLabel} categories`}>
          {config.groups.map((group) => (
            <div key={group.title} className={showLabels ? 'mb-4 last:mb-0' : 'mb-3 last:mb-0'}>
              {showLabels ? (
                <div className="px-2 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </div>
              ) : (
                <div className="mx-2 mb-1.5 h-px bg-slate-200/60 dark:bg-white/10" aria-hidden="true" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(location.pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={showLabels ? undefined : item.label}
                        className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
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
                        {showLabels && <span className="truncate">{item.label}</span>}
                        {showLabels && active && (
                          <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {showLabels && (
          <div className="border-t border-slate-200/60 px-3 py-2 dark:border-white/10">
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 leading-relaxed">
              {config.groups.reduce((n, g) => n + g.items.length, 0)} tools
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
