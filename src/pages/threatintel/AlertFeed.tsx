import { useEffect, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bell, BellOff, RefreshCw, CheckCircle, XCircle, AlertTriangle, Shield, Info, Skull } from 'lucide-react';

interface Alert {
  id: string;
  alert_type: string;
  title: string;
  description: string;
  confidence: number;
  severity: string;
  source: string;
  source_url: string;
  topics: string[];
  matched_assets: string[];
  matched_sector: number;
  read: number;
  dismissed: number;
  tlp: string;
  created_at: string;
}

interface AlertStats {
  total: number;
  unread: number;
  bySeverity: Array<{ severity: string; count: number }>;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: Skull },
  high: {
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: AlertTriangle,
  },
  medium: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', icon: Shield },
  low: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Info },
  info: { color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-white/5', icon: Bell },
};

const TLP_COLORS: Record<string, string> = {
  RED: 'bg-red-600 text-white',
  AMBER: 'bg-amber-500 text-white',
  GREEN: 'bg-green-500 text-white',
  CLEAR: 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
};

const TOPIC_EMOJIS: Record<string, string> = {
  ransomware: '💀',
  phishing: '🎣',
  malware: '🦠',
  cve: '🔓',
  actor: '🕵️',
  data_breach: '📋',
  ddos: '🌊',
  scam: '💰',
  supply_chain: '🔗',
  zero_day: '💥',
};

export default function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats>({ total: 0, unread: 0, bySeverity: [] });
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('severity', filter);
      const [alertRes, statsRes] = await Promise.all([
        fetch(`/api/v1/estate/alerts?${params}`),
        fetch('/api/v1/estate/alerts/stats'),
      ]);
      if (!alertRes.ok || !statsRes.ok) throw new Error('Failed to load alerts');
      const alertData = await alertRes.json();
      const statsData = await statsRes.json();
      setAlerts(alertData.alerts ?? []);
      setStats(statsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [filter]);

  const markRead = async (id: string) => {
    await fetch(`/api/v1/estate/alerts/${id}/read`, { method: 'POST' });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: 1 } : a)));
    setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
  };

  const dismiss = async (id: string) => {
    await fetch(`/api/v1/estate/alerts/${id}/dismiss`, { method: 'POST' });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const severityCount = (sev: string) => stats.bySeverity.find((s) => s.severity === sev)?.count ?? 0;

  return (
    <DataPageLayout
      backTo="/threatintel"
      title="Alert Feed"
      description="Prioritised threat intelligence alerts — noise-filtered, confidence-scored, and matched to your estate."
      icon={<Bell />}
      loading={loading && alerts.length === 0}
      error={error}
      onRetry={loadAlerts}
      empty={!loading && alerts.length === 0 && !error}
      emptyMessage="No alerts to show. Configure your estate to receive personalised threat intelligence."
      emptyIcon={<BellOff size={32} className="text-slate-300" />}
    >
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {SEVERITIES.map((sev) => {
          const cfg = SEVERITY_CONFIG[sev]!;
          const Icon = cfg.icon;
          return (
            <button
              key={sev}
              onClick={() => setFilter(filter === sev ? 'all' : sev)}
              className={`rounded-xl border p-4 text-left transition-all ${
                filter === sev
                  ? 'border-amber-500 dark:border-amber-400 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={cfg.color} />
                <span className="text-xs font-medium uppercase text-slate-500">{sev}</span>
              </div>
              <span className="text-2xl font-bold">{severityCount(sev)}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Bell size={16} />
          <span>
            {stats.total} alerts · <span className="font-semibold text-amber-600">{stats.unread} unread</span>
          </span>
        </div>
        <button
          onClick={loadAlerts}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Alert cards */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info!;
          const Icon = cfg.icon;
          const hoursAgo = Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 3600000);

          return (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 transition-all ${
                !alert.read
                  ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/5'
                  : 'border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${cfg.bg} ${cfg.color}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{alert.title}</h3>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-bold ${TLP_COLORS[alert.tlp] ?? TLP_COLORS.CLEAR}`}
                        >
                          TLP:{alert.tlp}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.color} ${cfg.bg}`}>
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!alert.read && (
                        <button
                          onClick={() => markRead(alert.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-green-500"
                          title="Mark read"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(alert.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500"
                        title="Dismiss"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{alert.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>
                      {hoursAgo < 1
                        ? 'Just now'
                        : hoursAgo < 24
                          ? `${hoursAgo}h ago`
                          : `${Math.floor(hoursAgo / 24)}d ago`}
                    </span>
                    <span className="flex items-center gap-1">
                      Confidence:
                      <span
                        className={`font-medium ${
                          alert.confidence >= 80
                            ? 'text-green-500'
                            : alert.confidence >= 60
                              ? 'text-yellow-500'
                              : 'text-slate-500'
                        }`}
                      >
                        {alert.confidence}%
                      </span>
                    </span>
                    {alert.source && <span>Source: {alert.source}</span>}
                    {alert.matched_sector === 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium">
                        Sector match
                      </span>
                    )}
                  </div>
                  {alert.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {alert.topics.map((t) => (
                        <span
                          key={t}
                          className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500"
                        >
                          {TOPIC_EMOJIS[t] ?? ''} {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {alert.matched_assets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {alert.matched_assets.map((a) => (
                        <span
                          key={a}
                          className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-mono"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
