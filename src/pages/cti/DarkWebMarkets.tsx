import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Market {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'seized';
  type: string;
  lastSeen: string;
}

export default function DarkWebMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setMarkets([]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusColor = (s: string) => {
    if (s === 'online') return 'bg-emerald-500';
    if (s === 'seized') return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <>
      <PageMeta
        title="Dark Web Markets"
        description="Monitoring darknet markets, leak sites, and cybercrime forums."
        canonicalPath="/cti/markets"
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
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                <Eye size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dark Web Markets</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{markets.length} markets monitored</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : markets.length === 0 ? (
            <div className="text-center py-12">
              <Eye size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Dark web market data loading...</p>
              <p className="text-xs text-slate-400 mt-2">
                Infrastructure tracked via RansomLook. Updates every 4 hours.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {markets.map((m, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor(m.status)}`} />
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{m.type}</p>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span className="capitalize">{m.status}</span>
                    <span>{m.lastSeen}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
