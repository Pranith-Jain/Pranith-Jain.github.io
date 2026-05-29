import { useState, type FormEvent } from 'react';
import { probeAuth } from './adminApi';
import { writeAdminToken, clearAdminToken } from '../../lib/admin-token';

interface Props {
  onLogin: (token: string) => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    // Probe the token against /admin/health before committing. The previous
    // flow stored any string in localStorage and dropped the user into the
    // shell, where the first tab's fetch failed with 401 and triggered a
    // reload loop.
    writeAdminToken(trimmed);
    const ok = await probeAuth();
    if (!ok) {
      clearAdminToken();
      setError('Token rejected — check the value and try again.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onLogin(trimmed);
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Case Study Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="adminToken" className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
            Admin Token
          </label>
          <input
            id="adminToken"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-brand-500"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full px-4 py-2 bg-brand-600 text-white rounded font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
