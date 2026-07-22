import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Wifi } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface HoneypotData {
  totalHits: number;
  topPorts: Array<{ port: number; count: number; protocol: string }>;
  topCountries: Array<{ country: string; count: number }>;
  topAttackers: Array<{ ip: string; hits: number; country: string }>;
  recentActivity: Array<{ timestamp: string; srcIp: string; dstPort: number; type: string }>;
}

export default function HoneypotTelemetry() {
  const [data, setData] = useState<HoneypotData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(null);
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
        title="Honeypot Telemetry"
        description="Live attacker activity from T-Pot honeypot sensors."
        canonicalPath="/cti/honeypot"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center">
                <Wifi size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Honeypot Telemetry</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  First-hand attacker activity from CTIWatch sensors
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : !data ? (
            <div className="text-center py-12">
              <Wifi size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Honeypot data not available yet.</p>
              <p className="text-xs text-slate-400 mt-2">Data will appear after the next collection cycle.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Total Hits
                </h3>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">
                  {data.totalHits.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Top Ports
                </h3>
                <div className="space-y-2">
                  {data.topPorts?.slice(0, 5).map((p) => (
                    <div key={p.port} className="flex justify-between text-sm">
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {p.port}/{p.protocol}
                      </span>
                      <span className="font-mono text-slate-500">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Top Countries
                </h3>
                <div className="space-y-2">
                  {data.topCountries?.slice(0, 5).map((c) => (
                    <div key={c.country} className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{c.country}</span>
                      <span className="font-mono text-slate-500">{c.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
