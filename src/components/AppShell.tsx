import { Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { getSidebarForSection } from '../data/sidebar-nav';
import { useDataFetch } from '../hooks/useDataFetch';

const SECTION_META: Record<'dfir' | 'threatintel', { label: string; href: string; accent: string }> = {
  dfir: { label: 'DFIR', href: '/dfir', accent: 'text-brand-600 dark:text-brand-400' },
  threatintel: { label: 'Threat Intel', href: '/threatintel', accent: 'text-rose-600 dark:text-rose-400' },
};

/**
 * App-shell chrome for the two stand-alone surfaces hosted next to the
 * portfolio: /dfir/* (interactive DFIR tools) and /threatintel/* (live CTI
 * platform).
 *
 * Goal: make those routes feel like their own web app, not pages inside a
 * portfolio. The portfolio Header / Footer / background-gradient are
 * suppressed by App.tsx when the route matches, and this shell takes over
 * with a minimal top utility bar (search + theme toggle) + a left sidebar
 * (grouped categories) + a bottom status row.
 *
 * Two visual variants (dfir / threatintel) share the same shell. The only
 * difference is the sidebar's grouped items + the search placeholder, plus
 * an optional "live status pip" on threatintel that polls
 * /api/v1/feed-status for an at-a-glance health indicator.
 */

interface AppShellProps {
  mode: 'dfir' | 'threatintel';
  isDark: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function AppShell({ mode, isDark, onToggleTheme, children }: AppShellProps): JSX.Element {
  const location = useLocation();
  // Key by location so the wrapper remounts on every route change,
  // replaying the fade-in animation for a smooth page transition.
  const pageKey = location.pathname;

  const sidebarConfig = getSidebarForSection(location.pathname);
  const section = SECTION_META[mode];

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-50">
      <TopBar
        sectionLabel={section.label}
        sectionHref={section.href}
        accentClass={section.accent}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />
      <div className="flex-1 flex min-h-0 max-w-[1500px] w-full mx-auto px-3 sm:px-6">
        {sidebarConfig && <Sidebar config={sidebarConfig} />}
        <main id="main-content" key={pageKey} className="flex-1 min-w-0 animate-fade-in-up">
          {children}
        </main>
      </div>
      <AppStatusBar mode={mode} />
    </div>
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
