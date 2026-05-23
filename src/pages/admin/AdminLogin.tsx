import { useState, type FormEvent } from 'react';
import { probeAuth } from './adminApi';

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
    localStorage.setItem('adminToken', trimmed);
    const ok = await probeAuth();
    if (!ok) {
      localStorage.removeItem('adminToken');
      setError('Token rejected — check the value and try again.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onLogin(trimmed);
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">Case Study Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="adminToken" className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
            Admin Token
          </label>
          <input
            id="adminToken"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-600"
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
          className="w-full px-4 py-2 bg-zinc-100 text-zinc-900 rounded font-medium hover:bg-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
