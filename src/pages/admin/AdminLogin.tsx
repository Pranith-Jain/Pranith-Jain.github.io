import { useState, type FormEvent } from 'react';
import { probeAuth } from './adminApi';
import { createAdminSession, clearAdminSession, writeAdminToken, clearAdminToken } from '../../lib/admin-token';

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
    const sessionOk = await createAdminSession(trimmed);
    if (sessionOk) {
      const ok = await probeAuth();
      if (ok) {
        setBusy(false);
        onLogin(trimmed);
        return;
      }
    }
    writeAdminToken(trimmed);
    const ok = await probeAuth();
    if (!ok) {
      clearAdminToken();
      await clearAdminSession();
      setError('Token rejected — check the value and try again.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onLogin(trimmed);
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16 min-h-screen flex flex-col justify-center">
      <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1">Case Study Admin</h1>
      <p className="text-xs font-mono text-slate-500 mb-6">Enter your admin token to continue</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="adminToken"
            className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
          >
            Admin Token
          </label>
          <input
            id="adminToken"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-[#0e0e15] border border-slate-200 dark:border-[#1e2030] rounded text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:border-brand-500 transition-colors"
            placeholder="Paste token..."
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full px-4 py-2.5 bg-brand-600 text-white rounded font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
