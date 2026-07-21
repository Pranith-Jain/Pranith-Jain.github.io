import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Layers, RefreshCw } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Correlation {
  totalLinks: number;
  topActors: number;
  cveLinks: number;
  relationTypes: number;
  recentLinks: Array<{ from: string; to: string; type: string; confidence: number }>;
}

export default function CorrelationGraph() {
  const [data, setData] = useState<Correlation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/threat-intel/stats');
      if (res.ok) {
        const d = await res.json();
        if (d.correlation) setData(d.correlation);
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
        title="Intelligence Correlations"
        description="Cross-source correlation engine linking CVEs, IoCs, actors, and victims."
        canonicalPath="/cti/intelligence"
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
              <div className="w-10 h-10 rounded-lg bg-pink-600 flex items-center justify-center">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Intelligence Correlations</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Entity relationship mapping across all data sources
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
          ) : !data ? (
            <div className="text-center py-12">
              <Layers size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Correlation data loading...</p>
              <p className="text-xs text-slate-400 mt-2">
                Relationships computed from data patterns and co-occurrences.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 text-center">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  {data.totalLinks.toLocaleString()}
                </p>
                <p className="text-[10px] font-mono uppercase text-slate-400">Total Links</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 text-center">
                <p className="text-2xl font-bold text-violet-600">{data.topActors}</p>
                <p className="text-[10px] font-mono uppercase text-slate-400">Top Actors</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 text-center">
                <p className="text-2xl font-bold text-rose-600">{data.cveLinks.toLocaleString()}</p>
                <p className="text-[10px] font-mono uppercase text-slate-400">CVE Links</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 text-center">
                <p className="text-2xl font-bold text-sky-600">{data.relationTypes}</p>
                <p className="text-[10px] font-mono uppercase text-slate-400">Relation Types</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
