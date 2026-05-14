import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Command, Menu, Moon, Sun, X, type LucideIcon } from 'lucide-react';
import { preloadRoute } from '../lib/route-preloaders';

/**
 * App-shell chrome for the two stand-alone surfaces hosted next to the
 * portfolio: /dfir/* (interactive DFIR tools) and /threatintel/* (live CTI
 * platform).
 *
 * Goal: make those routes feel like their own web app, not pages inside a
 * portfolio. The portfolio Header / Footer / background-gradient are
 * suppressed by App.tsx when the route matches, and this shell takes over
 * with its own compact top bar, in-app nav, and bottom status row.
 *
 * Two visual variants (dfir / threatintel) share the same shell. The only
 * differences are the brand label, the in-app nav links, and an optional
 * "live status pip" on threatintel that polls /api/v1/feed-status for an
 * at-a-glance health indicator.
 */

interface NavItem {
  label: string;
  to: string;
  /** When true, mark active only on exact-match; otherwise use prefix-match. */
  exact?: boolean;
}

const DFIR_NAV: NavItem[] = [
  { label: 'Tools', to: '/dfir', exact: true },
  { label: 'IOC Check', to: '/dfir/ioc-check' },
  { label: 'URL Preview', to: '/dfir/url-preview' },
  { label: 'Domain', to: '/dfir/domain' },
  { label: 'CVE', to: '/dfir/cve' },
  { label: 'Extract', to: '/dfir/extract' },
  { label: 'Breach', to: '/dfir/breach' },
  { label: 'Decode', to: '/dfir/decode' },
  { label: 'WebScan', to: '/dfir/web-scan' },
  { label: 'Diamond', to: '/dfir/diamond' },
];

const TI_NAV: NavItem[] = [
  { label: 'Overview', to: '/threatintel', exact: true },
  { label: 'Live Feeds', to: '/threatintel/live-iocs' },
  { label: 'Correlation', to: '/threatintel/correlation' },
  { label: 'Actors', to: '/threatintel/actor-timeline' },
  { label: 'Writeups', to: '/threatintel/writeups' },
  { label: 'Metrics', to: '/threatintel/metrics' },
  { label: 'Status', to: '/threatintel/status' },
];

interface BrandSpec {
  short: string;
  long: string;
  accent: string;
  icon?: LucideIcon;
}

interface AppShellProps {
  mode: 'dfir' | 'threatintel';
  isDark: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function AppShell({ mode, isDark, onToggleTheme, children }: AppShellProps): JSX.Element {
  const location = useLocation();
  const nav = mode === 'dfir' ? DFIR_NAV : TI_NAV;
  const brand: BrandSpec =
    mode === 'dfir'
      ? { short: 'DFIR', long: 'DFIR Toolkit', accent: 'text-brand-600 dark:text-brand-400' }
      : { short: 'TI', long: 'Threat Intel', accent: 'text-rose-600 dark:text-rose-400' };

  const isActive = (item: NavItem) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-50">
      <AppHeader brand={brand} nav={nav} isActive={isActive} isDark={isDark} onToggleTheme={onToggleTheme} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <AppStatusBar mode={mode} />
    </div>
  );
}

function AppHeader({
  brand,
  nav,
  isActive,
  isDark,
  onToggleTheme,
}: {
  brand: BrandSpec;
  nav: NavItem[];
  isActive: (item: NavItem) => boolean;
  isDark: boolean;
  onToggleTheme: () => void;
}): JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer when the route changes (link tap) — depending on
  // useLocation alone isn't enough because the same Link can be tapped while
  // already on that path.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Lock body scroll while the drawer is open so the page underneath doesn't
  // scroll under the user's finger. ESC to dismiss.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-4">
        {/* Brand */}
        <Link to={nav[0]?.to ?? '/'} className="flex items-baseline gap-2 shrink-0">
          <span className={`font-mono font-bold text-sm ${brand.accent}`}>{brand.short}</span>
          <span className="hidden sm:inline text-[11px] font-mono text-slate-500 dark:text-slate-500">
            / {brand.long.toLowerCase()}
          </span>
        </Link>

        {/* In-app nav (md+) */}
        <nav className="flex-1 hidden md:flex items-center gap-0.5 overflow-x-auto">
          {nav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                onMouseEnter={() => preloadRoute(item.to)}
                onFocus={() => preloadRoute(item.to)}
                className={`text-[12px] font-mono px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile-friendly nav indicator (selected only) */}
        <div className="flex-1 md:hidden font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate">
          {nav.find((n) => isActive(n))?.label ?? '…'}
        </div>

        {/* Utility row */}
        <div className="flex items-center gap-2 sm:gap-1 shrink-0">
          <CmdkHint />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Back to portfolio"
          >
            <ArrowLeft size={11} /> portfolio
          </Link>
          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="appshell-mobile-nav"
            className="md:hidden min-h-[44px] min-w-[44px] p-2.5 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu size={16} />
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm"
          />
          <nav
            id="appshell-mobile-nav"
            aria-label={`${brand.long} navigation`}
            className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between h-12 px-4 border-b border-slate-200 dark:border-slate-800">
              <span className={`font-mono font-bold text-sm ${brand.accent}`}>{brand.short}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto p-2">
              {nav.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={`block font-mono text-sm px-3 py-3 rounded transition-colors ${
                        active
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-200 dark:border-slate-800 p-2">
              <Link
                to="/"
                className="flex items-center gap-2 font-mono text-xs px-3 py-2 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft size={12} /> Back to portfolio
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function CmdkHint(): JSX.Element | null {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  if (isMac === null) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // Dispatch a synthetic Cmd+K to open the command palette. The palette
        // is mounted globally in App.tsx so any route can summon it.
        const ev = new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
        });
        window.dispatchEvent(ev);
      }}
      className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-slate-900"
      aria-label="Search across tools, wiki, actors, CVEs, and Telegram channels"
      title="Search across tools, wiki, actors, CVEs, and Telegram channels"
    >
      <Command size={11} />
      <span>Search</span>
      <kbd className="ml-1 px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}

interface FeedStatusBrief {
  generated_at: string;
  overall: 'ok' | 'degraded' | 'down' | 'cold';
  rows: Array<{ id: string; status: 'ok' | 'degraded' | 'down' | 'cold' }>;
}

/**
 * Slim status row at the bottom of the app. For /threatintel, polls
 * /api/v1/feed-status every 60s and surfaces the overall health pip.
 * For /dfir, shows the static "all tools client-side or edge-only" note.
 */
function AppStatusBar({ mode }: { mode: 'dfir' | 'threatintel' }): JSX.Element {
  const [status, setStatus] = useState<FeedStatusBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'threatintel') return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/v1/feed-status');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as FeedStatusBrief;
        if (!cancelled) {
          setStatus(j);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [mode]);

  return (
    <footer className="border-t border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[44px] sm:h-9 py-2 sm:py-0 flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-500">
        <div className="flex items-center gap-3">
          {mode === 'dfir' ? (
            <>
              <span>Edge-hosted on Cloudflare Workers.</span>
              <span className="hidden sm:inline">No signup, no key.</span>
            </>
          ) : (
            <StatusPip status={status} error={error} />
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com/Pranith-Jain/Pranith-Jain.github.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 sm:px-0 hover:text-slate-900 dark:hover:text-slate-100"
          >
            github
          </a>
          <Link
            to="/"
            className="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 sm:px-0 hover:text-slate-900 dark:hover:text-slate-100"
          >
            portfolio
          </Link>
        </div>
      </div>
    </footer>
  );
}

function StatusPip({ status, error }: { status: FeedStatusBrief | null; error: string | null }): JSX.Element {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
        feed-status unreachable
      </span>
    );
  }
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
        checking feeds…
      </span>
    );
  }
  const okCount = status.rows.filter((r) => r.status === 'ok').length;
  const total = status.rows.length;
  const pipCls =
    status.overall === 'ok'
      ? 'bg-emerald-500'
      : status.overall === 'degraded'
        ? 'bg-amber-500'
        : status.overall === 'cold'
          ? 'bg-slate-400'
          : 'bg-rose-500';
  const label =
    status.overall === 'ok'
      ? 'all feeds healthy'
      : status.overall === 'degraded'
        ? 'partial degradation'
        : status.overall === 'cold'
          ? 'cold caches at this edge'
          : 'feeds offline';
  return (
    <Link
      to="/threatintel/status"
      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${pipCls}`} />
      {okCount}/{total} feeds · {label}
    </Link>
  );
}
