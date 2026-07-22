import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, RefreshCw, TrendingUp } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Report {
  id: string;
  title: string;
  date: string;
  summary: string;
  ransomwareVictims: number;
  kevUpdates: number;
  newIocs: number;
}

export default function WeeklyReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setReports([]);
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
        title="Weekly Reports"
        description="Automated weekly threat intelligence summaries."
        canonicalPath="/cti/reports"
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
              <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Calendar size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Weekly Threat Reports</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Automated summaries from live platform data
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
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No reports generated yet.</p>
              <p className="text-xs text-slate-400 mt-2">Reports are generated weekly from live platform data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-mono text-slate-400">{r.date}</span>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">{r.title}</h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{r.summary}</p>
                  <div className="flex gap-4 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <TrendingUp size={10} /> {r.ransomwareVictims} victims
                    </span>
                    <span>{r.kevUpdates} KEV updates</span>
                    <span>{r.newIocs.toLocaleString()} new IOCs</span>
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
