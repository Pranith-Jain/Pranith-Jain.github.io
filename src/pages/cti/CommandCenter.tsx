import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bug,
  Calendar,
  Cpu,
  Database,
  Eye,
  FileText,
  Globe,
  Hash,
  Layers,
  Link2,
  Mail,
  Radio,
  RefreshCw,
  Rss,
  Server,
  Shield,
  ShieldAlert,
  Skull,
  Users,
  Wallet,
} from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

const API = '/api/v1';

interface GlobalStats {
  iocs: { total: number; active: number; byType: Record<string, number>; bySource: Record<string, number> };
  cves: { total: number; critical: number; high: number; kev: number; exploitable: number };
  actors: { total: number; apt: number; malware: number; ransomware: number };
  victims: { total: number; thisWeek: number; byCountry: Record<string, number>; byGroup: Record<string, number> };
  campaigns: { active: number; ransomware: number; apt: number };
  feeds: { total: number; ok: number; stale: number; down: number };
}

interface RecentCve {
  id: string;
  cvss: number;
  severity: string;
  description: string;
  kev: boolean;
  exploitStatus: string;
  published: string;
}

interface RecentVictim {
  name: string;
  group: string;
  country: string;
  sector: string;
  date: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-emerald-500',
  INFO: 'bg-sky-500',
};

const IOC_TYPE_ICONS: Record<string, typeof Globe> = {
  ip: Server,
  domain: Globe,
  url: Link2,
  hash_md5: Hash,
  hash_sha256: Hash,
  email: Mail,
  wallet: Wallet,
};

export default function CommandCenter() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [recentCves, setRecentCves] = useState<RecentCve[]>([]);
  const [recentVictims, setRecentVictims] = useState<RecentVictim[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [iocsRes, cvesRes, victimsRes, feedsRes] = await Promise.allSettled([
        fetch(`${API}/live-iocs/summary`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API}/cisa-kev`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API}/threat-intel/stats`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API}/feed-status`).then((r) => (r.ok ? r.json() : null)),
      ]);

      const iocs = iocsRes.status === 'fulfilled' ? iocsRes.value : null;
      const cves = cvesRes.status === 'fulfilled' ? cvesRes.value : null;
      const tiStats = victimsRes.status === 'fulfilled' ? victimsRes.value : null;
      const feeds = feedsRes.status === 'fulfilled' ? feedsRes.value : null;

      setStats({
        iocs: {
          total: iocs?.total || iocs?.count || 0,
          active: iocs?.active || 0,
          byType: iocs?.byType || iocs?.type_breakdown || {},
          bySource: iocs?.bySource || iocs?.source_breakdown || {},
        },
        cves: {
          total: tiStats?.cves?.total || 0,
          critical: tiStats?.cves?.critical || 0,
          high: tiStats?.cves?.high || 0,
          kev: tiStats?.kev?.count || cves?.count || 0,
          exploitable: tiStats?.cves?.exploitable || 0,
        },
        actors: {
          total: tiStats?.actors?.total || 0,
          apt: tiStats?.actors?.apt || 0,
          malware: tiStats?.actors?.malware || 0,
          ransomware: tiStats?.actors?.ransomware || 0,
        },
        victims: {
          total: tiStats?.victims?.total || 0,
          thisWeek: tiStats?.victims?.thisWeek || 0,
          byCountry: tiStats?.victims?.byCountry || {},
          byGroup: tiStats?.victims?.byGroup || {},
        },
        campaigns: {
          active: tiStats?.campaigns?.active || 0,
          ransomware: tiStats?.campaigns?.ransomware || 0,
          apt: tiStats?.campaigns?.apt || 0,
        },
        feeds: {
          total: feeds?.total || feeds?.sources?.length || 0,
          ok: feeds?.ok || feeds?.healthy || 0,
          stale: feeds?.stale || 0,
          down: feeds?.down || feeds?.error || 0,
        },
      });

      if (tiStats?.recentCves) setRecentCves(tiStats.recentCves.slice(0, 5));
      if (tiStats?.recentVictims) setRecentVictims(tiStats.recentVictims.slice(0, 5));

      setLastSync(new Date().toISOString());
    } catch (e) {
      console.error('CommandCenter fetch failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, reloadKey]);

  const statCards = stats
    ? [
        {
          label: 'IoCs Tracked',
          value: stats.iocs.total,
          icon: Database,
          color: 'text-sky-600 dark:text-sky-400',
          bg: 'bg-sky-50 dark:bg-sky-950/30',
          href: '/cti/iocs',
        },
        {
          label: 'CVEs Indexed',
          value: stats.cves.total,
          icon: Bug,
          color: 'text-rose-600 dark:text-rose-400',
          bg: 'bg-rose-50 dark:bg-rose-950/30',
          href: '/cti/vulnerabilities',
        },
        {
          label: 'KEV Catalog',
          value: stats.cves.kev,
          icon: ShieldAlert,
          color: 'text-orange-600 dark:text-orange-400',
          bg: 'bg-orange-50 dark:bg-orange-950/30',
          href: '/cti/vulnerabilities?status=kev',
        },
        {
          label: 'Threat Actors',
          value: stats.actors.total,
          icon: Users,
          color: 'text-violet-600 dark:text-violet-400',
          bg: 'bg-violet-50 dark:bg-violet-950/30',
          href: '/cti/threats',
        },
        {
          label: 'Ransomware Victims',
          value: stats.victims.total,
          icon: Skull,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50 dark:bg-amber-950/30',
          href: '/cti/victims',
        },
        {
          label: 'Active Campaigns',
          value: stats.campaigns.active,
          icon: Radio,
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          href: '/cti/campaigns',
        },
        {
          label: 'Feed Sources',
          value: stats.feeds.total,
          icon: Rss,
          color: 'text-teal-600 dark:text-teal-400',
          bg: 'bg-teal-50 dark:bg-teal-950/30',
          href: '/cti/articles',
        },
        {
          label: 'System Health',
          value: `${stats.feeds.ok}/${stats.feeds.total}`,
          icon: Activity,
          color: 'text-brand-600 dark:text-brand-400',
          bg: 'bg-brand-50 dark:bg-brand-950/30',
          href: '/status',
        },
      ]
    : [];

  const quickLinks = [
    { label: 'IP Reputation Check', icon: Server, href: '/cti/check', desc: 'Look up any IP, domain, or hash' },
    { label: 'IoC Database', icon: Database, href: '/cti/iocs', desc: 'Browse 1.6M+ indicators' },
    { label: 'CVE Database', icon: Bug, href: '/cti/vulnerabilities', desc: '350K+ vulnerabilities with CVSS/EPSS' },
    { label: 'Threat Actors', icon: Users, href: '/cti/threats', desc: 'APT groups, malware families, ransomware' },
    { label: 'Malware Families', icon: Shield, href: '/cti/malware', desc: '3.4K+ catalogued families' },
    { label: 'Active Campaigns', icon: Radio, href: '/cti/campaigns', desc: 'Live ransomware + APT operations' },
    { label: 'Ransomware Victims', icon: Skull, href: '/cti/victims', desc: '31K+ confirmed victims' },
    { label: 'Intel Feed', icon: FileText, href: '/cti/articles', desc: '28+ curated RSS sources' },
    { label: 'Weekly Reports', icon: Calendar, href: '/cti/reports', desc: 'Automated threat summaries' },
    { label: 'Correlation Graph', icon: Layers, href: '/cti/intelligence', desc: 'Entity relationship mapping' },
    { label: 'Dark Web Markets', icon: Eye, href: '/cti/markets', desc: 'Leak site monitoring' },
    { label: 'AI Threat Q&A', icon: Cpu, href: '/cti/ask', desc: 'Ask threat intelligence questions' },
  ];

  return (
    <>
      <PageMeta
        title="Command Center — Threat Intelligence Platform"
        description="Global cyber threat intelligence in real time — IoCs, CVEs, ransomware, APTs, and active campaigns."
        canonicalPath="/cti"
      />

      <div className="min-h-screen bg-[rgb(var(--surface-100))] dark:bg-[rgb(var(--surface-100))]">
        {/* Hero Header */}
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center">
                    <Shield size={20} className="text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Command Center</h1>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Global threat intelligence in real time — IoCs · CVEs · Ransomware · APTs
                </p>
              </div>
              <div className="flex items-center gap-3">
                {lastSync && (
                  <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    SYNC: {new Date(lastSync).toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  disabled={loading}
                  className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw
                    size={16}
                    className={loading ? 'animate-spin text-slate-400' : 'text-slate-600 dark:text-slate-400'}
                  />
                </button>
              </div>
            </div>

            {/* Threat Level Banner */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">THREAT: CRITICAL</span>
              <span className="text-xs text-rose-600/70 dark:text-rose-400/70">
                {stats?.campaigns.active || 0} active campaigns · {stats?.victims.thisWeek || 0} victims this week
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Stat Cards */}
          {loading && !stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map((card) => (
                <Link
                  key={card.label}
                  to={card.href}
                  className={`group ${card.bg} rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 hover:shadow-md transition-all`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon size={16} className={card.color} />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {card.label}
                    </span>
                  </div>
                  <div className={`text-2xl font-bold ${card.color}`}>
                    {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column — Quick Links */}
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Quick Access
                </h2>
                <div className="space-y-1">
                  {quickLinks.map((link) => (
                    <Link
                      key={link.href}
                      to={link.href}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors group"
                    >
                      <link.icon
                        size={16}
                        className="text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {link.label}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{link.desc}</div>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Feed Status */}
              {stats?.feeds && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    Feed Status
                  </h2>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.feeds.ok}</div>
                      <div className="text-[10px] font-mono text-emerald-600/70 dark:text-emerald-400/70">OK</div>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.feeds.stale}</div>
                      <div className="text-[10px] font-mono text-amber-600/70 dark:text-amber-400/70">STALE</div>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20">
                      <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{stats.feeds.down}</div>
                      <div className="text-[10px] font-mono text-rose-600/70 dark:text-rose-400/70">DOWN</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Center Column — Recent Activity */}
            <div className="lg:col-span-2 space-y-4">
              {/* Recent Critical CVEs */}
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Bug size={14} /> Recent Critical CVEs
                  </h2>
                  <Link
                    to="/cti/vulnerabilities"
                    className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    View all <ArrowRight size={10} />
                  </Link>
                </div>
                {recentCves.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono py-4 text-center">
                    Loading CVE data...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentCves.map((cve) => (
                      <div
                        key={cve.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${SEVERITY_COLORS[cve.severity] || 'bg-slate-400'}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {cve.id}
                            </span>
                            {cve.kev && (
                              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded">
                                KEV
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-400">CVSS {cve.cvss}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {cve.description}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">{cve.exploitStatus}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Ransomware Victims */}
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Skull size={14} /> Recent Ransomware Victims
                  </h2>
                  <Link
                    to="/cti/victims"
                    className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    View all <ArrowRight size={10} />
                  </Link>
                </div>
                {recentVictims.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono py-4 text-center">
                    Loading victim data...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentVictims.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[rgb(var(--surface-300))] flex items-center justify-center text-xs font-bold text-slate-500">
                          {v.country || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                            {v.name}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                            <span className="font-mono">{v.group}</span>
                            {v.sector && <span>· {v.sector}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">{v.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IOC Type Distribution */}
              {stats?.iocs.byType && Object.keys(stats.iocs.byType).length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Database size={14} /> IoC Type Distribution
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(stats.iocs.byType)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([type, count]) => {
                        const Icon = IOC_TYPE_ICONS[type] || Hash;
                        return (
                          <div
                            key={type}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300))] text-center"
                          >
                            <Icon size={16} className="mx-auto mb-1 text-slate-400" />
                            <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                              {count.toLocaleString()}
                            </div>
                            <div className="text-[10px] font-mono uppercase text-slate-400">{type}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
