import { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Loader2 } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface SatAnalysis { id: string; type: string; title: string; question: string; status: string; confidence: number; created_at: string; }

const SAT_TYPES = [
  { id: 'ach', name: 'ACH', desc: 'Analysis of Competing Hypotheses' },
  { id: 'key-assumptions', name: 'Key Assumptions', desc: 'Challenge underlying assumptions' },
  { id: 'indicators-validator', name: 'Indicators Validator', desc: 'Validate indicator significance' },
  { id: 'diagnostic', name: 'Diagnostic Analysis', desc: 'Identify cause of events' },
  { id: 'red-team', name: 'Red Team', desc: 'Adversarial perspective analysis' },
  { id: 'timeline', name: 'Timeline Analysis', desc: 'Chronological event reconstruction' },
  { id: 'outside-in', name: 'Outside-In Thinking', desc: 'External perspective analysis' },
  { id: 'high-impact', name: 'High Impact/Low Prob', desc: 'Assess unlikely but severe events' },
  { id: 'deception-detection', name: 'Deception Detection', desc: 'Identify adversary deception' },
  { id: 'argument-mapping', name: 'Argument Mapping', desc: 'Visualize reasoning chains' },
];

export default function StructuredAnalysis(): JSX.Element {
  const [analyses, setAnalyses] = useState<SatAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newAnalysis, setNewAnalysis] = useState({ type: 'ach', title: '', question: '', description: '' });

  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterType !== 'all' ? `?type=${filterType}` : '';
      const res = await fetch(`/api/v1/sat${params}`);
      if (res.ok) setAnalyses(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterType]);

  useEffect(() => { void fetchAnalyses(); }, [fetchAnalyses]);

  const createAnalysis = async () => {
    try {
      const res = await fetch('/api/v1/sat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...newAnalysis, created_by: 'analyst' }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewAnalysis({ type: 'ach', title: '', question: '', description: '' });
      void fetchAnalyses();
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3"><Brain className="text-brand-600" /> Structured Analytic Techniques</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Standard intelligence analysis methodologies — ACH, Key Assumptions, Red Team, and more</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2"><Plus size={16} /> New Analysis</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-8">
        {SAT_TYPES.map((t) => (
          <button key={t.id} onClick={() => { setNewAnalysis({ ...newAnalysis, type: t.id }); setShowCreate(true); }} className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
            <h3 className="font-semibold text-xs mb-1">{t.name}</h3>
            <p className="text-[10px] text-slate-500">{t.desc}</p>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div>
      ) : analyses.length === 0 ? (
        <div className="text-center py-20"><Brain size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No analyses yet. Create your first structured analysis.</p></div>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => (
            <div key={a.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">{a.type}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{a.status}</span>
                <span className="text-xs text-slate-400">Confidence: {a.confidence}%</span>
              </div>
              <h3 className="font-semibold text-sm">{a.title}</h3>
              {a.question && <p className="text-xs text-slate-500 mt-1 italic">"{a.question}"</p>}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-bold mb-4">New Structured Analysis</h2>
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Technique</label>
                <select value={newAnalysis.type} onChange={(e) => setNewAnalysis({ ...newAnalysis, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  {SAT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Title</label><input value={newAnalysis.title} onChange={(e) => setNewAnalysis({ ...newAnalysis, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Key Question</label><textarea value={newAnalysis.question} onChange={(e) => setNewAnalysis({ ...newAnalysis, question: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" /></div>
              <div className="flex gap-2">
                <button onClick={createAnalysis} disabled={!newAnalysis.title} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">Create</button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
