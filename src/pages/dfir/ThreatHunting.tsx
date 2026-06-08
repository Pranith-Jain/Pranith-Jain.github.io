import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Loader2, CheckCircle, Clock } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface Hunt { id: string; title: string; hypothesis: string; status: string; priority: string; kill_chain_phase: string; mitre_techniques: string[]; findings_count: number; true_positives: number; created_at: string; }
interface HuntTemplate { id: string; name: string; category: string; hypothesis_template: string; data_sources: string[]; mitre_techniques: string[]; kill_chain_phase: string; }

export default function ThreatHunting(): JSX.Element {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [templates, setTemplates] = useState<HuntTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newHunt, setNewHunt] = useState({ title: '', hypothesis: '', priority: 'medium', kill_chain_phase: '', query: '', query_language: 'kql' });

  const fetchHunts = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const [huntsRes, templatesRes] = await Promise.all([
        fetch(`/api/v1/hunts${params}`),
        fetch('/api/v1/hunts/templates'),
      ]);
      if (huntsRes.ok) { const d = await huntsRes.json() as { hunts: Hunt[] }; setHunts(d.hunts); }
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void fetchHunts(); }, [fetchHunts]);

  const createHunt = async () => {
    try {
      const res = await fetch('/api/v1/hunts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(newHunt) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewHunt({ title: '', hypothesis: '', priority: 'medium', kill_chain_phase: '', query: '', query_language: 'kql' });
      void fetchHunts();
    } catch { /* ignore */ }
  };

  const PRI_COLORS: Record<string, string> = { low: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
  const STATUS_ICONS: Record<string, typeof Target> = { draft: Clock, hunting: Loader2, completed: CheckCircle };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3"><Target className="text-brand-600" /> Threat Hunting</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Hypothesis-driven hunting framework — create, track, and document hunts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2"><Plus size={16} /> New Hunt</button>
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase text-slate-500 mb-3">Hunt Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <button key={t.id} onClick={() => { setNewHunt({ ...newHunt, title: t.name, hypothesis: t.hypothesis_template, kill_chain_phase: t.kill_chain_phase }); setShowCreate(true); }} className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
                <h3 className="font-semibold text-xs mb-1">{t.name}</h3>
                <p className="text-[10px] text-slate-500 line-clamp-2">{t.hypothesis_template}</p>
                <div className="flex flex-wrap gap-1 mt-2">{t.mitre_techniques.slice(0, 3).map((m) => <span key={m} className="font-mono text-[9px] text-slate-400">{m}</span>)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {['all', 'draft', 'hunting', 'completed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div>
      ) : hunts.length === 0 ? (
        <div className="text-center py-20"><Target size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No hunts found. Create your first hypothesis-driven hunt.</p></div>
      ) : (
        <div className="space-y-3">
          {hunts.map((h) => {
            const StatusIcon = STATUS_ICONS[h.status] ?? Target;
            return (
              <div key={h.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon size={14} className={h.status === 'hunting' ? 'animate-spin text-brand-600' : 'text-slate-400'} />
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${PRI_COLORS[h.priority]}`}>{h.priority}</span>
                      <span className="text-[10px] font-mono uppercase text-slate-400">{h.status}</span>
                    </div>
                    <h3 className="font-semibold text-sm">{h.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 italic">"{h.hypothesis}"</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      {h.kill_chain_phase && <span className="capitalize">{h.kill_chain_phase}</span>}
                      <span>{h.findings_count} findings</span>
                      {h.true_positives > 0 && <span className="text-emerald-600">{h.true_positives} TP</span>}
                      {h.mitre_techniques.length > 0 && <span className="font-mono">{h.mitre_techniques.slice(0, 3).join(', ')}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">New Hunt</h2>
            <div className="space-y-4">
              <div><span className="block text-xs font-medium text-slate-500 mb-1">Title</span><input value={newHunt.title} onChange={(e) => setNewHunt({ ...newHunt, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" /></div>
              <div><span className="block text-xs font-medium text-slate-500 mb-1">Hypothesis</span><textarea value={newHunt.hypothesis} onChange={(e) => setNewHunt({ ...newHunt, hypothesis: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" placeholder="An adversary has gained access and is..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><span className="block text-xs font-medium text-slate-500 mb-1">Priority</span><select value={newHunt.priority} onChange={(e) => setNewHunt({ ...newHunt, priority: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">{['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><span className="block text-xs font-medium text-slate-500 mb-1">Kill Chain Phase</span><input value={newHunt.kill_chain_phase} onChange={(e) => setNewHunt({ ...newHunt, kill_chain_phase: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" placeholder="lateral-movement" /></div>
              </div>
              <div><span className="block text-xs font-medium text-slate-500 mb-1">Query</span><textarea value={newHunt.query} onChange={(e) => setNewHunt({ ...newHunt, query: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-xs" placeholder="SecurityEvent | where EventID == 4624..." /></div>
              <div className="flex gap-2">
                <button onClick={createHunt} disabled={!newHunt.title || !newHunt.hypothesis} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">Create Hunt</button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
