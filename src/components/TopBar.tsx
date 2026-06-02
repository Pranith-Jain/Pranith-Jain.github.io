import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Moon, Sun, Shield, Radar, Menu } from 'lucide-react';

interface TopBarProps {
  sectionLabel: string;
  sectionHref: string;
  accentClass: string;
  isDark: boolean;
  onToggleTheme: () => void;
  /**
   * 'dfir' = shield (DFIR toolkit). 'threatintel' = radar (live threat platform).
   * Drives the small mark beside the section name. Kept as a string prop so
   * the TopBar doesn't need to know the section's URL structure.
   */
  mark?: 'dfir' | 'threatintel';
  /**
   * Mobile-only: when set, renders a hamburger button on the left edge
   * (visible <md) that toggles the sidebar drawer. The AppShell wires
   * this to its `MobileSidebarDrawer` open state.
   */
  onOpenMobileNav?: () => void;
  /**
   * Whether a mobile nav drawer is open — drives the hamburger
   * → X transition. When undefined, always render the hamburger.
   */
  mobileNavOpen?: boolean;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  dfir: 'Search 60+ DFIR tools, decoders, rule converters…',
  threatintel: 'Search actors, CVEs, campaigns, briefings, IOCs…',
};

const MARK_ACCENT: Record<'dfir' | 'threatintel', string> = {
  dfir: 'bg-brand-500/15 text-brand-600 dark:text-brand-300 ring-1 ring-brand-500/20',
  threatintel: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/20',
};

const TAGLINE: Record<'dfir' | 'threatintel', string> = {
  dfir: 'toolkit',
  threatintel: 'platform',
};

export function TopBar({
  sectionLabel,
  sectionHref,
  accentClass,
  isDark,
  onToggleTheme,
  mark = 'dfir',
  onOpenMobileNav,
  mobileNavOpen,
}: TopBarProps): JSX.Element {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  const searchKey = sectionHref.replace(/^\//, '');

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const openPalette = () => {
    const ev = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: isMac ?? false,
      ctrlKey: !(isMac ?? false),
      bubbles: true,
    });
    window.dispatchEvent(ev);
  };

  const MarkIcon = mark === 'dfir' ? Shield : Radar;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80 pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="md:hidden -ml-1 grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-lg border border-slate-200/60 bg-white/70 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen ?? false}
            aria-controls="mobile-sidebar-drawer"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <Link
          to={sectionHref}
          className="flex items-center gap-2 sm:gap-2.5 shrink-0 group rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          aria-label={`${sectionLabel} home`}
        >
          <span
            className={`grid h-8 w-8 place-items-center rounded-lg ${MARK_ACCENT[mark]} transition group-hover:scale-105`}
          >
            <MarkIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span className={`font-display font-bold text-[14px] sm:text-[15px] ${accentClass} truncate`}>
              {sectionLabel}
            </span>
            <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 truncate">
              {TAGLINE[mark]}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={openPalette}
          className="group flex-1 flex items-center gap-2 sm:gap-2.5 min-w-0 rounded-lg border border-slate-200/70 bg-slate-100/60 px-2.5 sm:px-3 py-1.5 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:border-white/20 dark:hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label="Open search (press Cmd+K or Ctrl+K)"
        >
          <Search
            className="h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
            aria-hidden="true"
          />
          <span className="truncate flex-1 text-[13px] sm:text-sm">
            {SEARCH_PLACEHOLDERS[searchKey] ?? `Search ${sectionLabel}…`}
          </span>
          {isMac !== null && (
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {isMac ? '⌘' : 'Ctrl'} K
            </kbd>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-lg border border-slate-200/60 bg-white/70 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
