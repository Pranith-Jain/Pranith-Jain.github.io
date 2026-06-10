import { useState, useEffect, useCallback } from 'react';
import { Shield, Loader2, Plus, X, ChevronRight } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface Asset {
  id: string;
  name: string;
  type: string;
  criticality: string;
}
interface Threat {
  id: string;
  asset_id: string;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  risk_score: number;
}
interface ThreatModel {
  id: string;
  name: string;
  description: string;
  method: string;
  status: string;
  scope: string;
  assets: Asset[];
  threats: Threat[];
  created_at: string;
}

const STRIDE = [
  'spoofing',
  'tampering',
  'repudiation',
  'information-disclosure',
  'denial-of-service',
  'elevation-of-privilege',
];

export default function ThreatModels(): JSX.Element {
  const [models, setModels] = useState<ThreatModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ name: '', description: '', method: 'stride', scope: '' });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/threat-models');
      if (res.ok) setModels(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const createModel = async () => {
    try {
      const res = await fetch('/api/v1/threat-models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...newModel,
          assets: [],
          threats: [],
          mitigations: [],
          coverage: [],
          created_by: 'analyst',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewModel({ name: '', description: '', method: 'stride', scope: '' });
      void fetchModels();
    } catch {
      /* ignore */
    }
  };

  const RISK_COLORS: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  };

  const getRiskLevel = (score: number) =>
    score >= 20 ? 'critical' : score >= 15 ? 'high' : score >= 10 ? 'medium' : 'low';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6"
      >
        ← back to DFIR
      </BackLink>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Shield className="text-brand-600" /> Threat Modeling
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            STRIDE/PASTA threat models with attack surface inventory and MITRE coverage
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <Plus size={16} /> New Model
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-20">
          <Shield size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">No threat models yet. Create your first STRIDE model.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {models.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <button
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-micro font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {m.method}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-micro ${m.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm">{m.name}</h3>
                    {m.description && <p className="text-xs text-slate-500 mt-1">{m.description}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-slate-400">
                      <div>{m.assets.length} assets</div>
                      <div>{m.threats.length} threats</div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-slate-400 transition-transform ${expanded === m.id ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>
              </button>

              {expanded === m.id && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-4">
                  {/* STRIDE Categories */}
                  {m.method === 'stride' && (
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">STRIDE Categories</h4>
                      <div className="flex flex-wrap gap-2">
                        {STRIDE.map((cat) => {
                          const count = m.threats.filter((t) => t.category === cat).length;
                          return (
                            <span
                              key={cat}
                              className={`px-2 py-1 rounded text-xs ${count > 0 ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}
                            >
                              {cat} ({count})
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Assets */}
                  {m.assets.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                        Assets ({m.assets.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {m.assets.map((a) => (
                          <div key={a.id} className="p-2 rounded bg-slate-50 dark:bg-slate-950 text-xs">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-slate-400 ml-2">{a.type}</span>
                            <span
                              className={`ml-2 px-1 py-0.5 rounded text-micro ${RISK_COLORS[a.criticality] ?? 'bg-slate-100 text-slate-500'}`}
                            >
                              {a.criticality}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Threats */}
                  {m.threats.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                        Threats ({m.threats.length})
                      </h4>
                      <div className="space-y-2">
                        {m.threats.map((t) => (
                          <div key={t.id} className="p-2 rounded bg-slate-50 dark:bg-slate-950 text-xs">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-micro mr-2">
                                  {t.category}
                                </span>
                                <span>{t.description}</span>
                              </div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-micro font-bold ${RISK_COLORS[getRiskLevel(t.risk_score)]}`}
                              >
                                {getRiskLevel(t.risk_score)}
                              </span>
                            </div>
                            <div className="mt-1 text-slate-400">
                              L:{t.likelihood} × I:{t.impact} = {t.risk_score}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.assets.length === 0 && m.threats.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No assets or threats added yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Threat Model</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Name</span>
                <input
                  value={newModel.name}
                  onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  placeholder="e.g. Customer Portal STRIDE Model"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Description</span>
                <textarea
                  value={newModel.description}
                  onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-medium text-slate-500 mb-1">Method</span>
                  <select
                    value={newModel.method}
                    onChange={(e) => setNewModel({ ...newModel, method: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    {['stride', 'pasta', 'attack-tree', 'linndun', 'vast'].map((m) => (
                      <option key={m} value={m}>
                        {m.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 mb-1">Scope</span>
                  <input
                    value={newModel.scope}
                    onChange={(e) => setNewModel({ ...newModel, scope: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    placeholder="e.g. Web app + API"
                  />
                </div>
              </div>
              <button
                onClick={createModel}
                disabled={!newModel.name}
                className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Create Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
