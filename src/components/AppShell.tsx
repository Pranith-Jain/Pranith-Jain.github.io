import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { getSidebarForSection } from '../data/sidebar-nav';
import { SectionErrorBoundary } from './ErrorBoundary';
import { useDataFetch } from '../hooks/useDataFetch';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { BackToTop } from './ui/BackToTop';
import { recordVisit } from '../lib/recentTools';

const SECTION_META: Record<'dfir' | 'threatintel', { label: string; href: string; accent: string }> = {
  dfir: { label: 'DFIR', href: '/dfir', accent: 'text-brand-600 dark:text-brand-400' },
  threatintel: { label: 'Threat Intel', href: '/threatintel', accent: 'text-rose-600 dark:text-rose-400' },
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
  '/dfir/ioc-check': 'IOC & Hash Checker',
  '/dfir/phishing': 'Phishing',
  '/dfir/domain-rep': 'Domain Reputation',
  '/dfir/threat-hunt': 'Threat Hunt',
  '/dfir/full-spectrum': 'Full Spectrum',
  '/dfir/asset-intel': 'Asset Intel',
  '/dfir/cve-prioritizer': 'CVE Prioritizer',
  '/dfir/cve': 'CVE Lookup',
  '/dfir/cloudtrail-triage': 'CloudTrail Triage',
  '/dfir/k8s-rbac': 'K8s RBAC',
  '/dfir/gcp-iam': 'GCP IAM',
  '/dfir/azure-rbac': 'Azure RBAC',
  '/dfir/iam-analyzer': 'IAM Analyzer',
  '/dfir/rule-converter': 'Rule Converter',
  '/dfir/detection-lab': 'Detection Lab',
  '/dfir/atlas': 'MITRE ATLAS',
  '/dfir/mitre': 'MITRE ATT&CK',
  '/dfir/stix-builder': 'STIX Builder',
  '/dfir/stix-viewer': 'STIX Viewer',
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
  '/threatintel/pulse': 'Threat Pulse',
  '/threatintel/live-iocs': 'Live IOCs',
  '/threatintel/certstream': 'Cert Stream',
  '/threatintel/breach': 'Live Breach Disclosures',
  '/threatintel/actor-kb': 'Actor KB',
  '/threatintel/actor-dna': 'Actor DNA',
  '/threatintel/actors': 'All Actors',
  '/threatintel/campaigns': 'Campaigns',
  '/threatintel/attribution': 'Attribution Framework',
  '/threatintel/briefings': 'Briefings',
  '/threatintel/ransomware-activity': 'Ransomware Activity',
  '/threatintel/ransomware-live': 'ransomware.live PRO',
  '/threatintel/ransomware-map': 'Ransomware Geo-heatmap',
  '/threatintel/negotiations': 'Negotiations',
  '/threatintel/re-leaks': 'Victim Re-leaks',
  '/threatintel/onion-watch': 'Onion Watch',
  '/threatintel/darkweb': 'Dark Web Watch',
  '/threatintel/breach-forums': 'Breach Forums',
  '/threatintel/deepdarkcti': 'deepdarkCTI',
  '/threatintel/darkweb-tools': 'Dark Web Tools',
  '/threatintel/infostealer': 'Infostealer Tracker',
  '/threatintel/scam-watch': 'Scam Watch',
  '/threatintel/telegram-leaks': 'Telegram Leaks',
  '/threatintel/telegram-leaks/channels': 'Telegram Channels',
  '/threatintel/telegram-leaks/stats': 'Telegram Stats',
  '/threatintel/cybersec': 'Cybersec Telegram',
  '/threatintel/reddit': 'Cybersec Reddit',
  '/threatintel/x': 'Cybersec Social',
  '/threatintel/x-live': 'X Live',
  '/threatintel/x-watch': 'X Firehose',
  '/threatintel/cyber-crime': 'Cyber Crime',
  '/threatintel/tech-ai-news': 'Tech & AI News',
  '/threatintel/threat-feeds': 'Threat Feeds',
  '/threatintel/aggregated-feeds': 'Aggregated Feeds',
  '/threatintel/threat-map': 'Threat Map',
  '/threatintel/metrics': 'Metrics',
  '/threatintel/status': 'Feed Status',
  '/threatintel/intel-dashboard': 'Intel Dashboard',
  '/threatintel/collection-slo': 'Collection SLO',
  '/threatintel/source-reliability': 'Source Reliability',
  '/threatintel/pir-dashboard': 'Intelligence Requirements',
  '/threatintel/copilot': 'AI Copilot',
  '/threatintel/analyze': 'Analysis Orchestration',
  '/threatintel/campaign-generator': 'Campaign Generator',
  '/threatintel/observable-db': 'Observable DB',
  '/threatintel/search': 'Unified Search',
  '/threatintel/entity-resolution': 'Entity Resolution',
  '/threatintel/relationship-graph': 'Relationship Graph',
  '/threatintel/investigations': 'Investigations',
  '/threatintel/ioc-enrichment': 'IOC Enrichment',
  '/threatintel/mythreatintel': 'MyThreatIntel',
  '/threatintel/misp-browser': 'MISP Browser',
  '/threatintel/settings': 'Settings',
  '/threatintel/telegram-settings': 'Telegram Settings',
  '/threatintel/feed-sources': 'Feed Sources',
  '/threatintel/feed-scheduler': 'Feed Scheduler',
  '/threatintel/watches': 'Alert Engine',
  '/threatintel/detections': 'Detections',
  '/threatintel/writeups': 'Writeups',
  '/threatintel/signal': 'Research Signal',
  '/threatintel/research': 'Research',
  '/threatintel/wiki': 'Knowledge Base',
  '/threatintel/cve-resources': 'CVE Resources',
  '/threatintel/cve-list': 'CVE List',
  '/threatintel/cve-threat-map': 'CVE Threat Map',
  '/threatintel/external-resources': 'External Resources',
  '/threatintel/feed-catalog': 'Feed Catalog',
  '/threatintel/feed-status': 'Feed Status',
  '/threatintel/feed-quality': 'Feed Quality',
  '/threatintel/about': 'About',
  '/threatintel/cybercrime': 'Cyber Crime',
  '/threatintel/malware-iocs': 'Malware IOCs',
  '/threatintel/malpedia': 'Malpedia',
  '/threatintel/maltrail-trails': 'Maltrail Trails',
  '/threatintel/malicious-packages': 'Malicious Packages',
  '/threatintel/malware-vault': 'Malware Vault',
  '/threatintel/negotiations2': 'Negotiations',
  '/threatintel/pir': 'Intelligence Requirements',
  '/threatintel/predictive': 'Predictive Intel',
  '/threatintel/reddit-firehose': 'Reddit Firehose',
  '/threatintel/research-post': 'Research Post',
  '/threatintel/telegram-discovered': 'Telegram Discovered',
  '/threatintel/telegram-leak-stats': 'Telegram Leak Stats',
  '/threatintel/victim-releaks': 'Victim Re-leaks',
  '/threatintel/yarahub': 'YARA Hub',
  '/threatintel/cross-campaign': 'Cross-Campaign Correlation',
  '/threatintel/cross-correlate': 'Cross-Correlate',
  '/threatintel/correlation': 'Correlation',
  '/threatintel/actor-timeline': 'Actor Timeline',
  '/threatintel/campaign-detail': 'Campaign Detail',
  '/threatintel/campaign-lifecycle': 'Campaign Lifecycle',
  '/threatintel/insider-threat-matrix': 'Insider Threat Matrix',
  '/threatintel/ach': 'ACH',
  '/threatintel/assessment-detail': 'Assessment',
  '/threatintel/assessments': 'Assessments',
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
      <TopBar
        sectionLabel={section.label}
        sectionHref={section.href}
        accentClass={section.accent}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        mark={mode}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        mobileNavOpen={mobileNavOpen}
      />
      <div className="flex-1 flex min-h-0 max-w-[1500px] w-full mx-auto px-3 sm:px-6 gap-4">
        {sidebarConfig && <Sidebar config={sidebarConfig} />}
        {sidebarConfig && (
          <MobileSidebarDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} config={sidebarConfig} />
        )}
        {/* tabIndex={-1} so the SkipToContent anchor (href="#main-content") can
            actually move focus here — without it the skip link only scrolls and
            focus stays in the header, breaking it across the whole TI/DFIR app. */}
        <main id="main-content" key={pageKey} tabIndex={-1} className="flex-1 min-w-0 outline-none">
          <div className="animate-fade-in-up">
            <SectionErrorBoundary sectionName={section.label}>{children}</SectionErrorBoundary>
          </div>
        </main>
      </div>
      <AppStatusBar mode={mode} />
      <BackToTop visible={showBackToTop} onClick={scrollToTop} />
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
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 min-h-[44px] sm:h-9 py-2 sm:py-0 flex items-center justify-between gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3 min-w-0">
          {mode === 'dfir' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                edge
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
      to="/threatintel/status"
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
