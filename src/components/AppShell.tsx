import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Command, Moon, Sun, type LucideIcon } from 'lucide-react';
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
      <main className="flex-1">{children}</main>
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

        {/* In-app nav */}
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
        <div className="flex items-center gap-1 shrink-0">
          <CmdkHint />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
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
        </div>
      </div>
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
      className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
      aria-label="Open command palette"
      title="Command palette"
    >
      <Command size={10} />
      <span>{isMac ? '⌘' : 'Ctrl'} K</span>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-9 flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-500">
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
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Pranith-Jain/Pranith-Jain.github.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-slate-100"
          >
            github
          </a>
          <Link to="/" className="hover:text-slate-900 dark:hover:text-slate-100">
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
