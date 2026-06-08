import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Plus, ChevronRight, Clock, Loader2, X } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

type CaseStatus = 'open' | 'triaging' | 'investigating' | 'containing' | 'eradicating' | 'recovering' | 'closed';
type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';

interface Case {
  id: string; title: string; description: string; status: CaseStatus; severity: CaseSeverity;
  type: string; assigned_to: string | null; created_at: string; updated_at: string;
  tags: string[]; mitre_techniques: string[];
}

const STATUS_COLORS: Record<CaseStatus, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  triaging: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  investigating: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  containing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  eradicating: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  recovering: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  closed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const SEVERITY_COLORS: Record<CaseSeverity, string> = {
  low: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

export default function CaseManager(): JSX.Element {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<CaseSeverity | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newCase, setNewCase] = useState({ title: '', description: '', severity: 'medium' as CaseSeverity, type: 'other' });

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterSeverity !== 'all') params.set('severity', filterSeverity);
      const res = await fetch(`/api/v1/cases?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { cases: Case[] };
      setCases(data.cases);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [filterStatus, filterSeverity]);

  useEffect(() => { void fetchCases(); }, [fetchCases]);

  const createCase = async () => {
    try {
      const res = await fetch('/api/v1/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(newCase) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewCase({ title: '', description: '', severity: 'medium', type: 'other' });
      void fetchCases();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir" className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6">← back to DFIR</BackLink>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3"><Shield className="text-brand-600" /> Case Manager</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Incident response case tracking with evidence chain-of-custody</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2"><Plus size={16} /> New Case</button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as CaseStatus | 'all')} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <option value="all">All Statuses</option>
          {['open', 'triaging', 'investigating', 'containing', 'eradicating', 'recovering', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as CaseSeverity | 'all')} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <option value="all">All Severities</option>
          {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-600" size={32} /></div>
      ) : cases.length === 0 ? (
        <div className="text-center py-20"><Shield size={48} className="mx-auto mb-4 text-slate-300" /><p className="text-slate-500">No cases found. Create your first incident case.</p></div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <Link key={c.id} to={`/dfir/cases/${c.id}`} className="block p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">{c.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${SEVERITY_COLORS[c.severity]}`}>{c.severity}</span>
                  </div>
                  <h3 className="font-semibold text-sm truncate">{c.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(c.updated_at).toLocaleDateString()}</span>
                    {c.assigned_to && <span>Assigned: {c.assigned_to}</span>}
                    {c.mitre_techniques.length > 0 && <span className="font-mono">{c.mitre_techniques.slice(0, 3).join(', ')}</span>}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-400 ml-2 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Case Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Incident Case</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Title</span>
                <input value={newCase.title} onChange={(e) => setNewCase({ ...newCase, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" placeholder="Ransomware incident on SRV-01" />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Description</span>
                <textarea value={newCase.description} onChange={(e) => setNewCase({ ...newCase, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-medium text-slate-500 mb-1">Severity</span>
                  <select value={newCase.severity} onChange={(e) => setNewCase({ ...newCase, severity: e.target.value as CaseSeverity })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 mb-1">Type</span>
                  <select value={newCase.type} onChange={(e) => setNewCase({ ...newCase, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {['ransomware', 'bec', 'data-breach', 'malware', 'phishing', 'insider-threat', 'apt', 'ddos', 'supply-chain', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={createCase} disabled={!newCase.title} className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">Create Case</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
