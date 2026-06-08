import { useState, useEffect } from 'react';
import { Shield, Plus, Loader2 } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface ThreatModel { id: string; name: string; method: string; status: string; assets: unknown[]; threats: unknown[]; created_at: string; }

export default function ThreatModels(): JSX.Element {
  const [models, setModels] = useState<ThreatModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/threat-models').then((r) => r.ok ? r.json() : []).then(setModels).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <h1 className="text-3xl font-display font-bold flex items-center gap-3 mb-2"><Shield className="text-brand-600" /> Threat Modeling</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">STRIDE/PASTA threat models with attack surface inventory and MITRE coverage</p>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div> :
        models.length === 0 ? <div className="text-center py-20"><Shield size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No threat models yet.</p></div> :
        <div className="space-y-3">{models.map((m) => (
          <div key={m.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">{m.method}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] ${m.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{m.status}</span>
            </div>
            <h3 className="font-semibold text-sm">{m.name}</h3>
            <div className="flex gap-3 mt-2 text-xs text-slate-400"><span>{(m.assets as unknown[]).length} assets</span><span>{(m.threats as unknown[]).length} threats</span></div>
          </div>
        ))}</div>}
    </div>
  );
}
