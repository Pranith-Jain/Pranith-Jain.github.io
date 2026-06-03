import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit3, CheckCircle2, Archive, AlertTriangle } from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

interface Assessment {
  id: string;
  title: string;
  type: string;
  status: string;
  topic: string;
  body: string;
  sources: string[];
  confidence_score: number;
  confidence_level: string;
  author?: string;
  sector?: string;
  related_pirs?: string[];
  created_at: string;
  updated_at: string;
  published_at?: string;
}

const STATUS_ACTIONS: Record<string, { next: string; label: string; color: string }[]> = {
  draft: [{ next: 'review', label: 'Submit for Review', color: 'bg-amber-600 hover:bg-amber-700' }],
  review: [
    { next: 'published', label: 'Publish', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { next: 'draft', label: 'Send Back to Draft', color: 'bg-slate-500 hover:bg-slate-600' },
  ],
  published: [{ next: 'archived', label: 'Archive', color: 'bg-slate-500 hover:bg-slate-600' }],
  archived: [],
};

export default function AssessmentDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/threat-intel/assessments/${id}`, { headers: adminAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json() as Promise<Assessment>;
      })
      .then(setAssessment)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function transitionStatus(nextStatus: string) {
    if (!assessment) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/v1/threat-intel/assessments/${assessment.id}`, {
        method: 'PUT',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error('Transition failed');
      const data = (await res.json()) as { assessment: Assessment };
      setAssessment(data.assessment);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setTransitioning(false);
    }
  }

  if (loading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </div>
    );

  if (error || !assessment)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link
          to="/threatintel/assessments"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 mb-8"
        >
          <ArrowLeft size={14} /> back
        </Link>
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {error ?? 'Assessment not found'}
        </div>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/assessments"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back to assessments
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                assessment.status === 'published'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 border-emerald-300'
                  : assessment.status === 'review'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 border-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-300'
              }`}
            >
              {assessment.status}
            </span>
            <span className="text-[10px] font-mono text-slate-400">{assessment.type}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">{assessment.title}</h1>
          <p className="text-sm text-slate-500 mt-1">Topic: {assessment.topic}</p>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`text-2xl font-bold font-mono ${assessment.confidence_score >= 70 ? 'text-emerald-500' : assessment.confidence_score >= 40 ? 'text-amber-500' : 'text-rose-500'}`}
          >
            {assessment.confidence_score}%
          </div>
          <div className="text-[10px] font-mono text-slate-400">{assessment.confidence_level}</div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 mb-6 text-[11px] font-mono text-slate-400">
        {assessment.author && <span>Author: {assessment.author}</span>}
        {assessment.sector && <span>Sector: {assessment.sector}</span>}
        <span>Created: {new Date(assessment.created_at).toLocaleString()}</span>
        <span>Updated: {new Date(assessment.updated_at).toLocaleString()}</span>
        {assessment.published_at && <span>Published: {new Date(assessment.published_at).toLocaleString()}</span>}
      </div>

      {/* Sources used */}
      {assessment.sources.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Sources</div>
          <div className="flex flex-wrap gap-1">
            {assessment.sources.map((s, i) => (
              <span
                key={i}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 mb-6 text-sm leading-relaxed whitespace-pre-wrap">
        {assessment.body}
      </div>

      {/* Status transition actions */}
      {STATUS_ACTIONS[assessment.status]?.length > 0 && (
        <div className="flex gap-2">
          {STATUS_ACTIONS[assessment.status].map((action) => (
            <button
              key={action.next}
              type="button"
              onClick={() => transitionStatus(action.next)}
              disabled={transitioning}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-4 py-2 rounded-lg text-white ${action.color} disabled:opacity-50 transition-colors`}
            >
              {action.next === 'published' ? (
                <CheckCircle2 size={12} />
              ) : action.next === 'archived' ? (
                <Archive size={12} />
              ) : (
                <Edit3 size={12} />
              )}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
