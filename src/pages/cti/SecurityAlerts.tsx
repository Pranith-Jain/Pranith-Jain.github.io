import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Alert {
  id: string;
  title: string;
  severity: string;
  type: string;
  timestamp: string;
  source: string;
  description: string;
}

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export default function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/threat-intel/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.alerts?.items) setAlerts(data.alerts.items);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <>
      <PageMeta
        title="Security Alerts"
        description="Real-time security alerts and threat notifications."
        canonicalPath="/cti/alerts"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                <Bell size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Security Alerts</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{alerts.length} alerts</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12">
              <Bell size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No alerts at this time.</p>
              <p className="text-xs text-slate-400 mt-2">Alerts are generated from live threat intelligence feeds.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert size={14} className="text-slate-400" />
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${SEVERITY_PILL[a.severity] || 'bg-slate-100 text-slate-500'}`}
                    >
                      {a.severity}
                    </span>
                    <span className="text-xs text-slate-400">{a.type}</span>
                    <span className="text-[11px] font-mono text-slate-400 ml-auto">
                      {new Date(a.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{a.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{a.description}</p>
                  <p className="text-[10px] text-slate-400 mt-2">Source: {a.source}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
