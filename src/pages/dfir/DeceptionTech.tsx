import { useState, useEffect, useCallback } from 'react';
import { Eye, Plus, Loader2, Shield, AlertTriangle, Copy, Check } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface CanaryToken {
  id: string;
  type: string;
  name: string;
  token_value: string;
  planted_in: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered: string | null;
}
interface CanaryAlert {
  id: string;
  token_name: string;
  token_type: string;
  severity: string;
  source_ip: string;
  triggered_at: string;
  acknowledged: boolean;
}

export default function DeceptionTech(): JSX.Element {
  const [tokens, setTokens] = useState<CanaryToken[]>([]);
  const [alerts, setAlerts] = useState<CanaryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState({ type: 'dns', name: '', description: '', planted_in: '' });
  const [copied, setCopied] = useState('');
  const [tab, setTab] = useState<'tokens' | 'alerts'>('tokens');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tokRes, alertRes] = await Promise.all([fetch('/api/v1/canary-tokens'), fetch('/api/v1/canary-alerts')]);
      if (tokRes.ok) setTokens(await tokRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const createToken = async () => {
    try {
      const rand = Math.random().toString(36).slice(2, 10);
      const tokenValue =
        newToken.type === 'dns'
          ? `${rand}.canary.example.com`
          : newToken.type === 'web'
            ? `https://canary.example.com/${rand}`
            : newToken.type === 'aws-key'
              ? `AKIA${rand.toUpperCase()}${rand.toUpperCase()}`
              : rand;
      const res = await fetch('/api/v1/canary-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...newToken,
          token_value: tokenValue,
          planted_by: 'analyst',
          is_active: true,
          callback_url: '',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewToken({ type: 'dns', name: '', description: '', planted_in: '' });
      void fetchData();
    } catch {
      /* ignore */
    }
  };

  const copyToken = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const SEV_COLORS: Record<string, string> = {
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };

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
            <Eye className="text-brand-600" /> Deception Technology
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Canary tokens and honeypot management — detect intruders early
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <Plus size={16} /> New Token
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {(['tokens', 'alerts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
          >
            {t}{' '}
            {t === 'alerts' && alerts.filter((a) => !a.acknowledged).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-micro bg-rose-500 text-white">
                {alerts.filter((a) => !a.acknowledged).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
      ) : tab === 'tokens' ? (
        tokens.length === 0 ? (
          <div className="text-center py-20">
            <Eye size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">No canary tokens. Create one to detect intruders.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-micro font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {t.type}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-micro ${t.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-400'}`}
                      >
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono text-slate-500 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded">
                        {t.token_value}
                      </code>
                      <button
                        onClick={() => copyToken(t.token_value, t.id)}
                        className="text-slate-400 hover:text-brand-600"
                      >
                        {copied === t.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                    {t.planted_in && <p className="text-xs text-slate-400 mt-1">Planted in: {t.planted_in}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold">{t.trigger_count}</div>
                    <div className="text-xs text-slate-400">triggers</div>
                    {t.last_triggered && (
                      <div className="text-micro text-slate-400 mt-1">
                        Last: {new Date(t.last_triggered).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : alerts.length === 0 ? (
        <div className="text-center py-20">
          <Shield size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">No canary alerts. This is good — no tokens have been triggered.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`p-4 rounded-lg border ${a.acknowledged ? 'border-slate-200 dark:border-slate-800 opacity-60' : 'border-rose-200 dark:border-rose-800'} bg-white dark:bg-slate-900`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className={a.acknowledged ? 'text-slate-400' : 'text-rose-500'} />
                  <span
                    className={`px-2 py-0.5 rounded text-micro font-semibold uppercase ${SEV_COLORS[a.severity] ?? 'bg-slate-100 text-slate-500'}`}
                  >
                    {a.severity}
                  </span>
                  <span className="font-semibold text-sm">{a.token_name}</span>
                  <span className="text-xs text-slate-400">({a.token_type})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{new Date(a.triggered_at).toLocaleString()}</span>
                  {!a.acknowledged && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/v1/canary-alerts/${a.id}/acknowledge`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ analyst: 'analyst' }),
                        });
                        void fetchData();
                      }}
                      className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-1">Source: {a.source_ip || 'unknown'}</div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-bold mb-4">New Canary Token</h2>
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Type</span>
                <select
                  value={newToken.type}
                  onChange={(e) => setNewToken({ ...newToken, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  {['dns', 'web', 'document', 'aws-key', 'sql-connection', 'windows-share'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Name</span>
                <input
                  value={newToken.name}
                  onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  placeholder="Finance server DNS canary"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-500 mb-1">Planted In</span>
                <input
                  value={newToken.planted_in}
                  onChange={(e) => setNewToken({ ...newToken, planted_in: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  placeholder="/finance/salary_backup.xlsx"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createToken}
                  disabled={!newToken.name}
                  className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
