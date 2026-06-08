import { useState, useEffect } from 'react';
import { Target, Loader2, AlertTriangle } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface Pir { id: string; title: string; question: string; priority: string; status: string; coverage_score: number; }
interface Gap { requirement_id: string; requirement_title: string; gap_type: string; description: string; recommended_action: string; }

export default function IntelRequirementsPage(): JSX.Element {
  const [pirs, setPirs] = useState<Pir[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/intel-requirements').then((r) => r.ok ? r.json() : []),
      fetch('/api/v1/intel-requirements/gaps').then((r) => r.ok ? r.json() : []),
    ]).then(([p, g]) => { setPirs(p); setGaps(g); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const PRI_COLORS: Record<string, string> = { low: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30', medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30', high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30', critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <h1 className="text-3xl font-display font-bold flex items-center gap-3 mb-2"><Target className="text-brand-600" /> Intelligence Requirements</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">Priority Intelligence Requirements (PIRs) with collection coverage and gap analysis</p>

      {gaps.length > 0 && (
        <div className="mb-8 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-3"><AlertTriangle size={14} className="text-amber-600" /> Coverage Gaps ({gaps.length})</h2>
          <div className="space-y-2">{gaps.map((g, i) => (
            <div key={i} className="text-xs"><span className="font-medium">{g.requirement_title}</span>: {g.description} — <span className="text-amber-700 dark:text-amber-300">{g.recommended_action}</span></div>
          ))}</div>
        </div>
      )}

      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div> :
        pirs.length === 0 ? <div className="text-center py-20"><Target size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No intelligence requirements defined yet.</p></div> :
        <div className="space-y-3">{pirs.map((p) => (
          <div key={p.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${PRI_COLORS[p.priority]}`}>{p.priority}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
            </div>
            <h3 className="font-semibold text-sm">{p.title}</h3>
            {p.question && <p className="text-xs text-slate-500 mt-1 italic">"{p.question}"</p>}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${p.coverage_score}%` }} />
              </div>
              <span className="text-xs text-slate-400">{p.coverage_score}%</span>
            </div>
          </div>
        ))}</div>}
    </div>
  );
}
