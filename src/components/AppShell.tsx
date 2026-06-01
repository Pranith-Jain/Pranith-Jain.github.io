import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Command, Moon, Sun, type LucideIcon } from 'lucide-react';
import { preloadRoute } from '../lib/route-preloaders';
import { useDataFetch } from '../hooks/useDataFetch';

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
  { label: 'C2 Tracker', to: '/threatintel/c2-tracker' },
  { label: 'Correlation', to: '/threatintel/correlation' },
  { label: 'Actors', to: '/threatintel/actor-timeline' },
  { label: 'Writeups', to: '/threatintel/writeups' },
  { label: 'Metrics', to: '/threatintel/metrics' },
  { label: 'Status', to: '/threatintel/status' },
  { label: 'Domain Monitor', to: '/threatintel/domain-monitor' },
  { label: 'Search', to: '/threatintel/search' },
  { label: 'Copilot', to: '/threatintel/copilot' },
  { label: 'Watches', to: '/threatintel/watches' },
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
  // Key by location so the wrapper remounts on every route change,
  // replaying the fade-in animation for a smooth page transition.
  const pageKey = location.pathname;
  const brand: BrandSpec =
    mode === 'dfir'
      ? { short: 'DFIR', long: 'DFIR Toolkit', accent: 'text-brand-600 dark:text-brand-400' }
      : { short: 'TI', long: 'Threat Intel', accent: 'text-rose-600 dark:text-rose-400' };

  const isActive = (item: NavItem) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  // No `overflow-x-clip` on the outer wrapper. AppShell has no decorative
  // blobs (those live in Layout's portfolio routes), so the clip rule
  // was purely defensive against wide children. In practice it was
  // silently clipping legitimately-wide content on mobile (tables,
  // code blocks, the actor-timeline grid) so the user couldn't scroll
  // to see it. Removing the clip lets the document's native horizontal
  // scroll engage on the rare wide-child case. Sticky AppHeader keeps
  // working because we didn't introduce any scroll-container parent.
  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-50">
      <AppHeader brand={brand} nav={nav} isActive={isActive} isDark={isDark} onToggleTheme={onToggleTheme} />
      <main id="main-content" key={pageKey} className="flex-1 animate-fade-in-up">
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
  /**
   * Mobile UX redesign 2026-05-21: the hamburger + drawer pattern is gone.
   * The previous version had a Menu trigger on mobile that opened a
   * right-side drawer; user feedback flagged that as a "3-dot menu" that
   * read as filler, with the section indicator + nav buried behind it.
   *
   * New shape on every viewport: brand on the left, the in-app nav
   * scrolling horizontally inline (with a fade-mask at the edges so the
   * scrollability is obvious), theme toggle on the right. One tap to
   * any section, no interstitial drawer, no focus trap, no body-scroll
   * lock, no auto-close-on-route effects. The desktop experience is
   * unchanged because the nav was already inline at md+; mobile now
   * uses the same nav with smaller padding and an active-pill that
   * survives the horizontal scroll.
   */

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-12 flex items-center gap-2 sm:gap-4">
        {/* Brand. The long form "/ dfir toolkit" is dropped below sm so the
            nav has the most space. The short label keeps the surface
            identity (DFIR / TI) visible in the very-left position. */}
        <Link to={nav[0]?.to ?? '/'} className="flex items-baseline gap-2 shrink-0">
          <span className={`font-mono font-bold text-sm ${brand.accent}`}>{brand.short}</span>
          <span className="hidden sm:inline text-meta font-mono text-slate-500 dark:text-slate-400">
            / {brand.long.toLowerCase()}
          </span>
        </Link>

        {/* In-app nav — now visible on every viewport. Horizontal scroll
            with hidden scrollbar + edge fade-mask, so a phone user sees
            three or four tabs at once and can flick to the rest. Padding
            is slightly tighter on mobile so more items fit per visible
            slice. Each link is at least 32px tall, which combined with
            the 12-character labels keeps tap targets large enough on a
            phone (Apple HIG recommends 44pt minimum; ours run ~38–44pt
            depending on label length). */}
        <nav
          aria-label={`${brand.long} navigation`}
          className="flex-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]"
        >
          {nav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                onMouseEnter={() => preloadRoute(item.to)}
                onFocus={() => preloadRoute(item.to)}
                className={`text-[12px] font-mono px-2.5 sm:px-2.5 py-3 sm:py-1 rounded transition-colors whitespace-nowrap ${
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

        {/* Utility row — theme toggle only on mobile; CmdkHint joins on
            sm+ since the keyboard shortcut isn't usable on a phone. */}
        <div className="flex items-center gap-1 shrink-0">
          <CmdkHint />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
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

export interface FeedStatusBrief {
  generated_at: string;
  overall: 'ok' | 'degraded' | 'down' | 'cold';
  rows: Array<{ id: string; status: 'ok' | 'degraded' | 'down' | 'cold' }>;
}

/**
 * Slim status row at the bottom of the app. For /threatintel, polls
 * /api/v1/feed-status via useDataFetch (stale-while-revalidate) and
 * surfaces the overall health pip. For /dfir, shows the static "all
 * tools client-side or edge-only" note.
 */
function AppStatusBar({ mode }: { mode: 'dfir' | 'threatintel' }): JSX.Element {
  const {
    data: status,
    error,
    loading,
  } = useDataFetch<FeedStatusBrief>({
    url: mode === 'threatintel' ? '/api/v1/feed-status' : null,
    ttl: 30_000,
    staleWhileRevalidate: true,
  });

  return (
    <footer className="border-t border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[44px] sm:h-9 py-2 sm:py-0 flex items-center justify-between gap-3 text-meta font-mono text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          {mode === 'dfir' ? (
            <>
              <span>Edge-hosted on Cloudflare Workers.</span>
              <span className="hidden sm:inline">No signup, no key.</span>
            </>
          ) : (
            <StatusPip status={status} error={error} loading={loading} />
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com/Pranith-Jain/Pranith-Jain.github.io"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="github (opens in new tab)"
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

function StatusPip({
  status,
  error,
  loading,
}: {
  status: FeedStatusBrief | null;
  error: string | null;
  loading: boolean;
}): JSX.Element {
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
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${loading ? 'bg-slate-400 animate-pulse' : 'bg-slate-500'}`}
        />
        {loading ? 'checking feeds…' : 'no data'}
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
