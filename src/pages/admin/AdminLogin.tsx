import { useState, type FormEvent } from 'react';

interface Props {
  onLogin: (token: string) => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    localStorage.setItem('adminToken', trimmed);
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
        <button type="submit" className="w-full px-4 py-2 bg-zinc-100 text-zinc-900 rounded font-medium hover:bg-white">
          Sign in
        </button>
      </form>
    </main>
  );
}
