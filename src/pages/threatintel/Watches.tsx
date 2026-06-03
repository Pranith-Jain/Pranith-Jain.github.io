import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, Bell, RefreshCw, AlertTriangle, ExternalLink, Activity, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { adminAuthHeaders } from '../../lib/admin-token';

interface Watch {
  id: string;
  label: string;
  type: 'ransomware-group' | 'cve-keyword' | 'actor' | 'ioc';
  value: string;
  webhook: string;
  created_at: string;
  last_triggered: string | null;
}

interface AlertEvent {
  watch_id: string;
  label: string;
  type: Watch['type'];
  value: string;
  matched_at: string;
  match: string;
  detail?: string;
}

const TYPE_LABELS: Record<Watch['type'], string> = {
  'ransomware-group': 'Ransomware Group',
  'cve-keyword': 'CVE Keyword',
  actor: 'Threat Actor',
  ioc: 'Indicator',
};

const TYPE_COLORS: Record<Watch['type'], string> = {
  'ransomware-group': 'text-red-600 dark:text-red-400',
  'cve-keyword': 'text-amber-600 dark:text-amber-400',
  actor: 'text-violet-600 dark:text-violet-400',
  ioc: 'text-cyan-600 dark:text-cyan-400',
};

export default function Watches(): JSX.Element {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', value: '', webhook: '' });

  const [form, setForm] = useState({ label: '', type: 'ransomware-group' as Watch['type'], value: '', webhook: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, aRes] = await Promise.all([
        fetch('/api/v1/watches', { headers: adminAuthHeaders() }),
        fetch('/api/v1/watches/log', { headers: adminAuthHeaders() }),
      ]);
      if (!wRes.ok) throw new Error('Failed to load watches');
      const wData = await wRes.json();
      const aData = aRes.ok ? await aRes.json() : { alerts: [] };
      setWatches(wData.watches ?? []);
      setAlerts(aData.alerts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!form.label || !form.value || !form.webhook) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/watches', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create watch');
      }
      setShowForm(false);
      setForm({ label: '', type: 'ransomware-group', value: '', webhook: '' });
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (w: Watch) => {
    setEditingId(w.id);
    setEditForm({ label: w.label, value: w.value, webhook: w.webhook });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ label: '', value: '', webhook: '' });
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.label || !editForm.value || !editForm.webhook) return;
    try {
      const res = await fetch(`/api/v1/watches/${id}`, {
        method: 'PUT',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Failed to update');
      const data = await res.json();
      setWatches((prev) => prev.map((w) => (w.id === id ? data.watch : w)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this watch? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/v1/watches/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      setWatches((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
            <Bell className="text-brand-600 dark:text-brand-400" size={28} />
            Watchers &amp; Alerts
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            Get webhook notifications when watched entities appear in fresh intelligence.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <Plus size={14} /> New Watch
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 p-4 flex items-start justify-between gap-3 mb-6"
        >
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
            <AlertTriangle size={14} className="inline mr-1" /> {error}
          </div>
          <button
            onClick={fetchData}
            className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-rose-400/60 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
          >
            retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Watch list — left 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-display font-semibold text-sm flex items-center gap-2">
              <Activity size={14} className="text-slate-400" />
              Active Watches
              <span className="text-xs font-normal text-slate-500">({watches.length})</span>
            </h2>
            <div className="relative ml-auto max-w-48">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filter watches"
                placeholder="Filter..."
                className="w-full pl-7 pr-2 py-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {loading && watches.length === 0 ? (
            <DataState loading={true} rows={4} />
          ) : watches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-10 text-center">
              <Bell size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-500" />
              <p className="text-sm text-slate-500 font-mono">No watches configured yet.</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">Click "New Watch" to get started.</p>
            </div>
          ) : (
            watches
              .filter(
                (w) =>
                  !search ||
                  w.label.toLowerCase().includes(search.toLowerCase()) ||
                  w.value.toLowerCase().includes(search.toLowerCase()) ||
                  w.type.includes(search.toLowerCase())
              )
              .map((watch) => (
                <div
                  key={watch.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3"
                >
                  {editingId === watch.id ? (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="watch-edit-label" className="block text-[11px] font-mono text-slate-500 mb-1">
                          Label
                        </label>
                        <input
                          id="watch-edit-label"
                          type="text"
                          value={editForm.label}
                          onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="watch-edit-value" className="block text-[11px] font-mono text-slate-500 mb-1">
                          Value
                        </label>
                        <input
                          id="watch-edit-value"
                          type="text"
                          value={editForm.value}
                          onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="watch-edit-webhook" className="block text-[11px] font-mono text-slate-500 mb-1">
                          Webhook URL
                        </label>
                        <input
                          id="watch-edit-webhook"
                          type="url"
                          value={editForm.webhook}
                          onChange={(e) => setEditForm({ ...editForm, webhook: e.target.value })}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdate(watch.id)}
                          className="px-3 py-1.5 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded text-xs hover:bg-brand-700 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${TYPE_COLORS[watch.type]}`}>
                            {TYPE_LABELS[watch.type]}
                          </span>
                          {watch.last_triggered && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Bell size={10} /> triggered
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-sm truncate">{watch.label}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {watch.value}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                          <a
                            href={watch.webhook}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400"
                          >
                            <ExternalLink size={10} /> webhook
                          </a>
                          <span>created {new Date(watch.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(watch)}
                          aria-label="Edit watch"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand-500 transition-colors"
                          title="Edit watch"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(watch.id)}
                          aria-label="Delete watch"
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete watch"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>

        {/* Right panel — create form + alert log */}
        <div className="lg:col-span-2 space-y-6">
          {showForm && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="font-display font-semibold text-sm mb-4">Create Watch</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="watch-create-label" className="block text-[11px] font-mono text-slate-500 mb-1">
                    Label
                  </label>
                  <input
                    id="watch-create-label"
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. LockBit activity"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  />
                </div>
                <div>
                  <label htmlFor="watch-create-type" className="block text-[11px] font-mono text-slate-500 mb-1">
                    Type
                  </label>
                  <select
                    id="watch-create-type"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Watch['type'] })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  >
                    <option value="ransomware-group">Ransomware Group</option>
                    <option value="cve-keyword">CVE Keyword</option>
                    <option value="actor">Threat Actor</option>
                    <option value="ioc">Indicator (exact match)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="watch-create-value" className="block text-[11px] font-mono text-slate-500 mb-1">
                    {form.type === 'ransomware-group'
                      ? 'Group name (partial)'
                      : form.type === 'cve-keyword'
                        ? 'CVE ID or keyword'
                        : form.type === 'actor'
                          ? 'Actor name or slug'
                          : 'Indicator value (exact)'}
                  </label>
                  <input
                    id="watch-create-value"
                    type="text"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={
                      form.type === 'ransomware-group'
                        ? 'e.g. lockbit'
                        : form.type === 'cve-keyword'
                          ? 'e.g. CVE-2024- or log4j'
                          : form.type === 'actor'
                            ? 'e.g. Scattered Spider'
                            : 'e.g. 1.2.3.4 or evil.exe'
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  />
                </div>
                <div>
                  <label htmlFor="watch-create-webhook" className="block text-[11px] font-mono text-slate-500 mb-1">
                    Webhook URL
                  </label>
                  <input
                    id="watch-create-webhook"
                    type="url"
                    value={form.webhook}
                    onChange={(e) => setForm({ ...form, webhook: e.target.value })}
                    placeholder="https://hooks.example.com/alert"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  />
                </div>
                <button
                  onClick={() => void handleCreate()}
                  disabled={submitting || !form.label || !form.value || !form.webhook}
                  className="w-full py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  {submitting ? 'Creating...' : 'Create Watch'}
                </button>
              </div>
            </div>
          )}

          {/* Alert log */}
          <div>
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              Recent Alerts
              <button
                onClick={fetchData}
                className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <RefreshCw size={12} />
              </button>
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-400 italic">No alerts yet.</p>
              ) : (
                alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${TYPE_COLORS[alert.type]}`}>
                        {TYPE_LABELS[alert.type]}
                      </span>
                      <span className="text-[10px] text-slate-400">{new Date(alert.matched_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{alert.label}</p>
                    <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
                      {alert.match}
                    </p>
                    {alert.detail && <p className="text-[10px] text-slate-400 truncate mt-0.5">{alert.detail}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
