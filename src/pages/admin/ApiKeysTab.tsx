import { useEffect, useState, type FormEvent } from 'react';
import { getJson, postJsonWithBody } from './adminApi';
import { adminAuthHeaders } from '../../lib/admin-token';

interface ApiKey {
  id: string;
  prefix: string;
  label: string;
  role: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewKey {
  key: string;
  id: string;
  prefix: string;
  label: string;
  role: string;
}

export default function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<'readonly' | 'admin'>('readonly');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);

  async function loadKeys() {
    try {
      setLoading(true);
      const data = await getJson<{ keys: ApiKey[] }>('/keys');
      setKeys(data.keys);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    setNewKey(null);
    setCopied(false);
    try {
      const result = await postJsonWithBody<NewKey>('/keys', { label: label.trim(), role });
      setNewKey(result);
      setLabel('');
      setRole('readonly');
      void loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? Applications using it will immediately lose access.')) return;
    setRevoking(id);
    try {
      const r = await fetch(`/api/v1/admin/keys/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      void loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to revoke');
    } finally {
      setRevoking(null);
    }
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="space-y-8">
      {/* Create new key */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200)/0.5)] p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Create API Key</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="key-label" className="block text-xs text-slate-600 dark:text-slate-500 mb-1">
              Label
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. ci-pipeline, my-laptop"
              className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label htmlFor="key-role" className="block text-xs text-slate-600 dark:text-slate-500 mb-1">
              Role
            </label>
            <select
              id="key-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'readonly' | 'admin')}
              className="px-3 py-2 bg-white dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
            >
              <option value="readonly">Read-only</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !label.trim()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-500 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>

        {newKey && (
          <div className="mt-4 p-4 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mb-2">
              Copy this key now — it won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white dark:bg-[rgb(var(--input-200))] rounded text-sm font-mono text-emerald-700 dark:text-emerald-300 break-all">
                {newKey.key}
              </code>
              <button
                onClick={copyKey}
                className="px-3 py-2 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-500">
              Label: {newKey.label} · Role: {newKey.role} · Prefix: <code>{newKey.prefix}…</code>
            </p>
          </div>
        )}
      </section>

      {/* Existing keys */}
      <section>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Keys</h2>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-600 dark:text-slate-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-500">No API keys yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-left text-xs text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                  <th scope="col" className="pb-2 pr-4">
                    Prefix
                  </th>
                  <th scope="col" className="pb-2 pr-4">
                    Label
                  </th>
                  <th scope="col" className="pb-2 pr-4">
                    Role
                  </th>
                  <th scope="col" className="pb-2 pr-4">
                    Created
                  </th>
                  <th scope="col" className="pb-2 pr-4">
                    Last Used
                  </th>
                  <th scope="col" className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <td className="py-3 pr-4 font-mono text-slate-700 dark:text-slate-300">{k.prefix}…</td>
                    <td className="py-3 pr-4 text-slate-800 dark:text-slate-200">{k.label}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          k.role === 'admin'
                            ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                            : 'bg-sky-100 dark:bg-sky-500/10 text-sky-400 border border-sky-300 dark:border-sky-500/30'
                        }`}
                      >
                        {k.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 text-xs">{formatDate(k.created_at)}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 text-xs">
                      {formatDate(k.last_used_at)}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleRevoke(k.id)}
                        disabled={revoking === k.id}
                        className="px-2 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        {revoking === k.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
