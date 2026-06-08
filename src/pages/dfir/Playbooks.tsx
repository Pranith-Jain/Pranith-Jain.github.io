import { useState, useEffect, useCallback } from 'react';
import { Play, Loader2, Zap } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface Playbook { id: string; name: string; description: string; category: string; status: string; steps: unknown[]; inputs: unknown[]; tags: string[]; mitre_techniques: string[]; execution_count: number; }


export default function Playbooks(): JSX.Element {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [executing, setExecuting] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await fetch(`/api/v1/playbooks${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { playbooks: Playbook[] };
      setPlaybooks(data.playbooks);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void fetchPlaybooks(); }, [fetchPlaybooks]);

  const seedTemplates = async () => {
    await fetch('/api/v1/playbooks/seed-templates', { method: 'POST' });
    void fetchPlaybooks();
  };

  const execute = async () => {
    if (!selected) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/v1/playbooks/${selected.id}/execute`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputs: inputValues, triggered_by: 'analyst' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(null);
    } catch { /* ignore */ }
    finally { setExecuting(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3"><Zap className="text-brand-600" /> Playbook Engine</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Automated incident response workflows — execute, track, and audit</p>
        </div>
        <div className="flex gap-2">
          <button onClick={seedTemplates} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Seed Templates</button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {['all', 'active', 'draft'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div>
      ) : playbooks.length === 0 ? (
        <div className="text-center py-20"><Zap size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No playbooks. Click "Seed Templates" to load defaults.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playbooks.map((pb) => (
            <button key={pb.id} onClick={() => { setSelected(pb); setInputValues({}); }} className="text-left p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-sm">{pb.name}</h3>
                  <span className="text-[10px] font-mono uppercase text-slate-400">{pb.category}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${pb.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{pb.status}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3 line-clamp-2">{pb.description}</p>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{pb.steps.length} steps</span>
                <span>{pb.execution_count} executions</span>
                {pb.mitre_techniques.length > 0 && <span className="font-mono">{pb.mitre_techniques.slice(0, 2).join(', ')}</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {pb.tags.slice(0, 4).map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500">{t}</span>)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Execute Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-2">{selected.name}</h2>
            <p className="text-sm text-slate-500 mb-4">{selected.description}</p>
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Steps ({selected.steps.length})</h3>
              <div className="space-y-1">
                {(selected.steps as Array<{ name: string; type: string }>).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs"><span className="font-mono text-slate-400">{i + 1}.</span> <span className="font-medium">{s.name}</span> <span className="text-slate-400">({s.type})</span></div>
                ))}
              </div>
            </div>
            {(selected.inputs as Array<{ name: string; label: string; required: boolean; type: string; options?: string[] }>).length > 0 && (
              <div className="space-y-3 mb-4">
                <h3 className="text-xs font-semibold uppercase text-slate-500">Inputs</h3>
                {(selected.inputs as Array<{ name: string; label: string; required: boolean; type: string; options?: string[] }>).map((inp) => (
                  <div key={inp.name}>
                    <span className="block text-xs font-medium text-slate-500 mb-1">{inp.label} {inp.required && <span className="text-rose-500">*</span>}</span>
                    {inp.type === 'select' && inp.options ? (
                      <select value={inputValues[inp.name] ?? ''} onChange={(e) => setInputValues({ ...inputValues, [inp.name]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                        <option value="">Select...</option>
                        {inp.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={inputValues[inp.name] ?? ''} onChange={(e) => setInputValues({ ...inputValues, [inp.name]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" placeholder={inp.label} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={execute} disabled={executing} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Execute
              </button>
              <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
