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
    // Create an HttpOnly session cookie. The server validates the token
    // and sets a Secure/HttpOnly/SameSite=Strict cookie that JS cannot
    // read — the primary auth mechanism. localStorage is a fallback.
    const sessionOk = await createAdminSession(trimmed);
    if (sessionOk) {
      // Cookie set — probe to confirm the session works
      const ok = await probeAuth();
      if (ok) {
        setBusy(false);
        onLogin(trimmed);
        return;
      }
    }
    // Fallback: try direct header-based auth (legacy, or cookie failed)
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
