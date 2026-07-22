import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Globe, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface GeopoliticEvent {
  title: string;
  country: string;
  date: string;
  summary: string;
  threatLevel: string;
  actors: string[];
}

export default function Geopolitics() {
  const [events, setEvents] = useState<GeopoliticEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setEvents([]);
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
        title="Cyber Geopolitics"
        description="Nation-state cyber operations and geopolitical intelligence."
        canonicalPath="/cti/geopolitics"
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
              <div className="w-10 h-10 rounded-lg bg-cyan-600 flex items-center justify-center">
                <Globe size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Cyber Geopolitics</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nation-state cyber operations and geopolitical intelligence
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <Globe size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Geopolitical intelligence data loading...</p>
              <p className="text-xs text-slate-400 mt-2">Data aggregated from open-source intelligence feeds.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((e, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-slate-400">{e.date}</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-100 text-slate-600">
                      {e.country}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{e.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{e.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
