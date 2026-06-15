import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { MaturityPanel } from '../../components/threatintel/MaturityPanel';
import { ArrowLeft, Shield, Bug, Globe2, Activity, AlertTriangle, Radio, Target, TrendingUp } from 'lucide-react';

interface DashboardData {
  generated_at: string;
  telegram_monitor: {
    total_leaks: number;
    leaks_24h: number;
    watched_channels: number;
    unreviewed_channels: number;
  };
  leaks_7d: number;
  feed_health: string;
  feed_count: number;
}

const SOURCES = [
  {
    key: 'ransomware',
    href: '/threatintel/iocs',
    label: 'Ransomware',
    icon: AlertTriangle,
    desc: 'Victim claims, leak-site activity, extortion tracking',
  },
  {
    key: 'cve',
    href: '/threatintel/cve-list',
    label: 'CVE & Vulns',
    icon: Bug,
    desc: 'NVD, CISA KEV, MyThreatIntel, cvefeed.io',
  },
  {
    key: 'phishing',
    href: '/dfir/phishing',
    label: 'Phishing URLs',
    icon: Target,
    desc: 'OpenPhish + PhishTank — 80+ targeted brands',
  },
  {
    key: 'malware',
    href: '/threatintel/malware-vault',
    label: 'Malware Samples',
    icon: Radio,
    desc: 'MalwareBazaar — hashes, signatures, tags',
  },
  {
    key: 'telegram',
    href: '/threatintel/social',
    label: 'Telegram Intel',
    icon: Globe2,
    desc: '22 channels + custom — IOC drops, leak announcements',
  },
  {
    key: 'telegram_leaks',
    href: '/threatintel/telegram-leaks',
    label: 'Leak Monitor',
    icon: Shield,
    desc: 'Credential leaks, file drops, auto-scanned channels',
  },
  {
    key: 'breach',
    href: '/threatintel/iocs',
    label: 'Breach Database',
    icon: Activity,
    desc: '7 breach sources — email + domain search',
  },
  {
    key: 'ioc',
    href: '/threatintel/correlation',
    label: 'IOC Correlation',
    icon: TrendingUp,
    desc: '21 sources cross-referenced — high-signal indicators',
  },
];

export default function IntelDashboard(): JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const opts = { signal: ctrl.signal };
    Promise.all([
      fetch('/api/v1/intel-dashboard', opts).then((r) => {
        if (!r.ok) throw new Error(`Couldn't load the dashboard (HTTP ${r.status}).`);
        return r.json() as Promise<DashboardData>;
      }),
      fetch('/api/v1/snapshot', opts)
        .then((r) => r.json() as Promise<Record<string, unknown>>)
        .catch(() => null),
      fetch('/api/v1/feed-status', opts)
        .then((r) => r.json() as Promise<{ overall?: string }>)
        .catch(() => null),
    ])
      .then(([dash]) => {
        if (!cancelled) setData(dash);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Activity size={28} className="text-brand-600 dark:text-brand-400" /> Intelligence Dashboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-3xl">
          Consolidated view across all threat intelligence sources.
        </p>
      </div>

      <DataState loading={loading} error={error} rows={16}>
        {data && (
          <div className="space-y-8">
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Leaks indexed</p>
                <p className="text-2xl font-bold font-display">{data.telegram_monitor.total_leaks}</p>
                <p className="text-mini text-slate-400 mt-0.5">{data.telegram_monitor.leaks_24h} in 24h</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Watched channels</p>
                <p className="text-2xl font-bold font-display">{data.telegram_monitor.watched_channels}</p>
                <p className="text-mini text-slate-400 mt-0.5">
                  {data.telegram_monitor.unreviewed_channels} unreviewed
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">New leaks (7d)</p>
                <p className="text-2xl font-bold font-display">{data.leaks_7d}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">Feed health</p>
                <p
                  className={`text-2xl font-bold font-display ${data.feed_health === 'ok' ? 'text-emerald-500' : data.feed_health === 'degraded' ? 'text-amber-500' : 'text-rose-500'}`}
                >
                  {data.feed_health}
                </p>
                <p className="text-mini text-slate-400 mt-0.5">{data.feed_count} sources</p>
              </div>
            </div>

            {/* Program health: CTI-CMM maturity + source-reliability histogram */}
            <section id="maturity">
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-4">
                Program Health
              </h2>
              <MaturityPanel />
            </section>

            {/* Source cards */}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-4">
                Threat Intelligence Sources
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOURCES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Link key={s.key} to={s.href} className="surface-card card-hover block p-4 group">
                      <div className="flex items-start gap-3">
                        <Icon size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-display font-semibold text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {s.label}
                          </h3>
                          <p className="text-meta text-muted mt-0.5 leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Quick links */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Quick Actions
              </h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Telegram Leaks', href: '/threatintel/telegram-leaks' },
                  { label: 'Leak Stats', href: '/threatintel/telegram-leaks/stats' },
                  { label: 'Discovered Channels', href: '/threatintel/telegram-leaks/channels' },
                  { label: 'Breach Search', href: '/threatintel/iocs' },
                  { label: 'IOC Correlation', href: '/threatintel/correlation' },
                  { label: 'Threat Map', href: '/threatintel/threat-map' },
                  { label: 'Feed Status', href: '/threatintel/status' },
                  { label: 'Live IOCs', href: '/threatintel/iocs' },
                  { label: 'Ransomware', href: '/threatintel/iocs' },
                  { label: 'CVE List', href: '/threatintel/cve-list' },
                  { label: 'Malware Samples', href: '/threatintel/malware-vault' },
                  { label: 'Phishing Monitor', href: '/dfir/phishing' },
                  { label: 'Threat Hunt', href: '/dfir/threat-hunt' },
                  { label: 'Collection SLO', href: '/threatintel/collection-slo' },
                  { label: 'Source Reliability', href: '/threatintel/source-reliability' },
                  { label: 'Intel Requirements (PIRs)', href: '/threatintel/pir-dashboard' },
                  { label: 'ACH Generator', href: '/threatintel/ach' },
                  { label: 'Cross-Correlate', href: '/threatintel/cross-correlate' },
                  { label: 'Assessments', href: '/threatintel/assessments' },
                  { label: 'Entity Resolution', href: '/threatintel/relationship-graph' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="text-mini font-mono px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </DataState>
    </div>
  );
}
