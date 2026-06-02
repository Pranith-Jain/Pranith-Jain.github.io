import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Moon, Sun } from 'lucide-react';

interface TopBarProps {
  sectionLabel: string;
  sectionHref: string;
  accentClass: string;
  isDark: boolean;
  onToggleTheme: () => void;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  dfir: 'Search 60+ DFIR tools, decoders, rule converters…',
  threatintel: 'Search actors, CVEs, campaigns, briefings, IOCs…',
};

export function TopBar({ sectionLabel, sectionHref, accentClass, isDark, onToggleTheme }: TopBarProps) {
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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 h-16 flex items-center gap-3 sm:gap-4">
        <Link
          to={sectionHref}
          className="flex items-baseline gap-1.5 shrink-0 group focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded-md"
          aria-label={`${sectionLabel} home`}
        >
          <span className={`font-mono font-bold text-sm ${accentClass} group-hover:opacity-80 transition`}>
            {sectionLabel.split(' ')[0]}
          </span>
          {sectionLabel.includes(' ') && (
            <span className="hidden sm:inline text-[11px] font-mono text-slate-400 dark:text-slate-500">
              / {sectionLabel.toLowerCase()}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={openPalette}
          className="group flex-1 flex items-center gap-2.5 min-w-0 rounded-lg border border-slate-200/70 bg-slate-100/60 px-3 py-1.5 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:border-white/20 dark:hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label="Open search (press Cmd+K or Ctrl+K)"
        >
          <Search
            className="h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
            aria-hidden="true"
          />
          <span className="truncate flex-1">{SEARCH_PLACEHOLDERS[searchKey] ?? `Search ${sectionLabel}…`}</span>
          {isMac !== null && (
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {isMac ? '⌘' : 'Ctrl'} K
            </kbd>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="grid h-9 w-9 sm:h-9 sm:w-9 place-items-center rounded-lg border border-slate-200/60 bg-white/70 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
