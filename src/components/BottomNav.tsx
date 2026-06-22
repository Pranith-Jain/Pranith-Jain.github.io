import { Link, useLocation } from 'react-router-dom';
import { Home, Search, LayoutGrid, Clock } from 'lucide-react';
import { useRecentTools } from '../hooks/useRecentTools';

interface BottomNavProps {
  mode: 'dfir' | 'threatintel' | 'radar';
  onOpenSearch: () => void;
}

const NAV_ITEMS = {
  dfir: [
    { href: '/dfir', label: 'Home', icon: Home },
    { href: '/dfir/catalog', label: 'Catalog', icon: LayoutGrid },
  ],
  threatintel: [
    { href: '/threatintel', label: 'Home', icon: Home },
    { href: '/threatintel/catalog', label: 'Catalog', icon: LayoutGrid },
  ],
  radar: [{ href: '/radar', label: 'Scan', icon: Home }],
};

/**
 * Bottom navigation bar for mobile devices. Shows on screens < md (768px).
 * Provides quick access to Home, Search, Catalog, and Recent tools.
 * Replaces the need to open the hamburger drawer for common tasks.
 */
export function BottomNav({ mode, onOpenSearch }: BottomNavProps): JSX.Element {
  const location = useLocation();
  const { entries } = useRecentTools(mode, location.pathname, 1);
  const items = NAV_ITEMS[mode];
  const hasRecent = entries.length > 0;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[rgb(var(--border-400))] bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-100))] safe-area-pb"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center gap-0.5 min-w-[60px] py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                active
                  ? mode === 'dfir'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <item.icon size={20} aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Search button */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-col items-center gap-0.5 min-w-[60px] py-1 text-slate-500 dark:text-slate-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Search size={20} aria-hidden="true" />
          <span className="text-[10px] font-medium">Search</span>
        </button>

        {/* Recent (if available) */}
        {hasRecent && (
          <Link
            to={entries[0].path}
            className={`flex flex-col items-center gap-0.5 min-w-[60px] py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              location.pathname === entries[0].path
                ? mode === 'dfir'
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Clock size={20} aria-hidden="true" />
            <span className="text-[10px] font-medium truncate max-w-[60px]">{entries[0].label}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
