import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { FileText, ChevronRight } from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

interface Assessment {
  id: string;
  title: string;
  type: string;
  status: string;
  topic: string;
  body: string;
  confidence_score: number;
  confidence_level: string;
  author?: string;
  sector?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:
    'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border-slate-300 dark:border-[rgb(var(--border-400))]',
  review: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  published:
    'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  archived:
    'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-400 border-slate-300 dark:border-[rgb(var(--border-400))]',
};

export default function Assessments(): JSX.Element {
  const [data, setData] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    fetch(`/api/v1/threat-intel/assessments${params}`, { headers: adminAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 401 || r.status === 403
              ? 'This operator dashboard requires an admin token.'
              : `Couldn't load assessments (HTTP ${r.status}).`
          );
        }
        return r.json() as Promise<{ results: Assessment[] }>;
      })
      .then((d) => {
        if (!cancelled) setData(d.results ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <FileText size={28} className="text-brand-600 dark:text-brand-400" /> Intelligence Assessments
          </h1>
          <p className="text-muted mt-2 max-w-3xl">
            Published analytical assessments with mandatory provenance, confidence scoring, and lifecycle management.
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'draft', 'review', 'published'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s === 'all' ? null : s)}
            className={`text-mini font-mono px-3 py-1.5 rounded-xl border transition-colors ${
              statusFilter === s || (s === 'all' && !statusFilter)
                ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-300'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <DataState loading={loading} error={error} rows={6}>
        {data.length === 0 && !loading && (
          <div className="text-center py-16 text-slate-400">
            <FileText size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              No assessments yet. Use the Copilot to generate an analysis, then save it as an assessment.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {data.map((a) => (
            <Link
              key={a.id}
              to={`/threatintel/assessments/${a.id}`}
              className="block surface-card/40 shadow-e1 p-4 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[a.status] ?? ''}`}>
                  {a.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-mini text-slate-500 mt-0.5">
                    {a.type} · {a.topic.slice(0, 80)}
                    {a.sector && ` · sector: ${a.sector}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-xs font-mono ${a.confidence_score >= 70 ? 'text-emerald-500' : a.confidence_score >= 40 ? 'text-amber-500' : 'text-rose-500'}`}
                  >
                    {a.confidence_score}/100
                  </div>
                  <div className="text-micro text-slate-400">{new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      </DataState>
    </div>
  );
}
