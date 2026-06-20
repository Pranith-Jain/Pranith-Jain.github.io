import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { BottomNav } from './BottomNav';
import { getSidebarForSection } from '../data/sidebar-nav';
import { SectionErrorBoundary } from './ErrorBoundary';
import { useDataFetch } from '../hooks/useDataFetch';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { BackToTop } from './ui/BackToTop';
import { SkipToContent } from './SkipToContent';
import { McpKeyBar } from './ti-mindmap-mcp/McpKeyBar';
import { recordVisit } from '../lib/recentTools';

const SECTION_META: Record<'dfir' | 'threatintel' | 'radar', { label: string; href: string; accent: string }> = {
  dfir: { label: 'CRUCIBLE', href: '/dfir', accent: 'text-brand-600 dark:text-brand-400' },
  threatintel: { label: 'PANOPTICON', href: '/threatintel', accent: 'text-rose-600 dark:text-rose-400' },
  radar: { label: 'SCOUT', href: '/radar', accent: 'text-brand-600 dark:text-brand-400' },
};

/**
 * Pretty labels for routes used in the auto-breadcrumb. Unmapped paths
 * fall back to a humanised version of the segment (e.g. "actor-kb" →
 * "Actor Kb") — so even a path we haven't audited reads sensibly.
 *
 * Add a label here when a route's slug doesn't match its display name
 * (slugs use kebab-case, display uses Title Case or brand names).
 */
const ROUTE_LABELS: Record<string, string> = {
  // ── DFIR ─────────────────────────────────────────────────────
  '/dfir/phishing': 'Phishing',
  '/dfir/phishops': 'PHISHOPS',
  '/dfir/phishbook': 'PhishBook',
  '/dfir/asset-intel': 'Asset Intel',
  '/dfir/cve-prioritizer': 'CVE Prioritizer',
  '/dfir/cve': 'CVE Lookup',
  '/dfir/ioc-investigate': 'IOC Investigator',
  '/dfir/domain-investigator': 'Domain Investigator',
  '/dfir/malware-analyzer': 'Malware Analyzer',
  '/dfir/yara-workbench': 'YARA Workbench',
  '/dfir/stix-workbench': 'STIX Workbench',
  '/dfir/username-investigator': 'Username Investigator',
  '/dfir/cloudtrail-triage': 'CloudTrail Triage',
  '/dfir/k8s-rbac': 'K8s RBAC',
  '/dfir/gcp-iam': 'GCP IAM',
  '/dfir/azure-rbac': 'Azure RBAC',
  '/dfir/iam-analyzer': 'IAM Analyzer',
  '/dfir/rule-converter': 'Rule Converter',
  '/dfir/agent': 'Agent',
  '/dfir/mitre': 'MITRE ATT&CK',
  '/dfir/decode': 'Decode',
  '/dfir/encoder': 'Encoder',
  '/dfir/sec-headers': 'Security Headers',
  '/dfir/kill-chain': 'Kill Chain',
  '/dfir/diamond': 'Diamond Model',
  '/dfir/dashboard': 'Recent Lookups',
  '/dfir/wiki': 'Knowledge Base',
  '/dfir/briefings': 'Briefings',
  '/dfir/breach': 'Breach Lookup',
  '/dfir/rules': 'Detection Rules',
  '/dfir/owasp': 'OWASP Top 10',
  '/dfir/tools': 'All Tools',
  '/dfir/tools/about': 'About the Toolkit',
  // ── Threat Intel ────────────────────────────────────────────
  '/threatintel': 'Threat Intel',
  '/threatintel/threat-landscape': 'Threat Landscape',
  '/threatintel/threat-actor-catalog': 'Threat Actor Catalog',
  '/threatintel/actors': 'Actor Directory',
  '/threatintel/campaigns': 'Campaigns',
  '/threatintel/iocs': 'IOC Hub',
  '/threatintel/soc-dashboard': 'SOC Dashboards',
  '/threatintel/darkweb': 'Dark Web',
  '/threatintel/social': 'Social Feeds',
  '/threatintel/detections': 'Detection Hub',
  '/threatintel/cves': 'CVE Hub',
  '/threatintel/malware': 'Malware Hub',
  '/threatintel/malware-sandbox': 'Malware Sandbox',
  '/threatintel/phishing': 'Phishing',
  '/threatintel/tools': 'Frameworks & Tools',
  '/threatintel/osint': 'OSINT Hub',
  '/threatintel/osint-cli-tools': 'OSINT CLI Tools',
  '/threatintel/stix-bundles': 'STIX Bundles',
  '/threatintel/ioc-feeds': 'IOC Feeds',
  '/threatintel/briefings': 'Briefings',
  '/threatintel/reports': 'Threat Intel Reports',
  '/threatintel/feeds': 'Feed Hub',
  '/threatintel/external': 'External Resources',
  '/threatintel/wiki': 'Knowledge Base',
  '/threatintel/about': 'About',
  '/threatintel/research-hub': 'Research Hub',
  '/threatintel/predictive': 'Predictive Intel',
  '/threatintel/metrics': 'Metrics',
  '/threatintel/malware-iocs': 'Malware IOCs',
  '/threatintel/malpedia': 'Malpedia',
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
  mode: 'dfir' | 'threatintel' | 'radar';
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

  // Mobile drawer state. Closed by default; opens when the user taps
  // the hamburger in the TopBar. Closes automatically on every route
  // change so navigating via the drawer never leaves the panel
  // dangling in front of a different page.
  const { showBackToTop, scrollToTop } = useScrollProgress();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setMobileNavOpen(false);
    // Record the visit for the "Recently used" row on the home pages.
    // Section-prefixed so a DFIR visitor doesn't see Threat Intel
    // visits in their DFIR "Recently used" row.
    const label = ROUTE_LABELS[location.pathname] ?? humaniseLastSegment(location.pathname);
    recordVisit(mode, location.pathname, label);
  }, [location.pathname, mode]);

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-50">
      <div className="page-top-accent" aria-hidden="true" />
      <SkipToContent />
      <TopBar
        sectionLabel={section.label}
        sectionHref={section.href}
        accentClass={section.accent}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        mark={mode}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        mobileNavOpen={mobileNavOpen}
        topBarExtra={<McpKeyBar />}
      />
      <div className="flex-1 flex min-h-0 max-w-[1500px] w-full mx-auto px-3 sm:px-6 gap-3 sm:gap-4">
        {sidebarConfig && <Sidebar config={sidebarConfig} />}
        {sidebarConfig && (
          <MobileSidebarDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} config={sidebarConfig} />
        )}
        {/* tabIndex={-1} so the SkipToContent anchor (href="#main-content") can
            actually move focus here — without it the skip link only scrolls and
            focus stays in the header, breaking it across the whole TI/DFIR app. */}
        <main id="main-content" key={pageKey} tabIndex={-1} className="flex-1 min-w-0 outline-none pb-16 md:pb-0">
          <div className="animate-fade-in-up">
            <SectionErrorBoundary sectionName={section.label}>{children}</SectionErrorBoundary>
          </div>
        </main>
      </div>
      <AppStatusBar mode={mode} />
      <BackToTop visible={showBackToTop} onClick={scrollToTop} />
      <BottomNav
        mode={mode}
        onOpenSearch={() => {
          // Dispatch Cmd+K to open the command palette
          const ev = new KeyboardEvent('keydown', {
            key: 'k',
            metaKey: /Mac|iPhone|iPad/.test(navigator.platform),
            ctrlKey: !/Mac|iPhone|iPad/.test(navigator.platform),
            bubbles: true,
          });
          window.dispatchEvent(ev);
        }}
      />
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
function AppStatusBar({ mode }: { mode: 'dfir' | 'threatintel' | 'radar' }): JSX.Element {
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
    <footer className="border-t border-[rgb(var(--border-400))] chrome-glass pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 min-h-[44px] sm:h-9 py-2 sm:py-0 flex items-center justify-between gap-3 text-mini font-mono text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3 min-w-0">
          {mode === 'radar' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-brand-500 live-pulse" aria-hidden />
                  <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                scout
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="hidden sm:inline">Domain recon — analyze any URL instantly.</span>
            </>
          ) : mode === 'dfir' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-brand-500 live-pulse" aria-hidden />
                  <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                crucible
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="hidden sm:inline">No signup, no key, runs in your browser.</span>
            </>
          ) : (
            <StatusPip status={status} error={error} loading={loading} />
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden md:inline text-slate-500 dark:text-slate-400 tabular-nums">
            build {__BUILD_DATE__}
          </span>
          <a
            href="https://github.com/Pranith-Jain/Pranith-Jain.github.io"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="github (opens in new tab)"
            className="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 sm:px-0 hover:text-slate-900 dark:hover:text-slate-100"
          >
            github
          </a>
          <span className="text-slate-300 dark:text-slate-700">·</span>
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
      to="/threatintel/catalog?cat=social"
      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${pipCls}`} />
      {okCount}/{total} feeds · {label}
    </Link>
  );
}

/**
 * Humanise the last URL segment when a route isn't in the `ROUTE_LABELS`
 * map. Used by the "Recently used" tracker so a deep page we haven't
 * audited still produces a sensible display label.
 */
function humaniseLastSegment(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean).pop() ?? pathname;
  return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
