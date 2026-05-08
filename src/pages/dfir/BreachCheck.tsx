import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

async function sha1Upper(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function getSeverity(count: number): { label: string; classes: string } {
  if (count >= 1000) {
    return {
      label: 'Critical',
      classes: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    };
  }
  if (count >= 100) {
    return {
      label: 'High',
      classes:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    };
  }
  return {
    label: 'Low',
    classes: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
  };
}

interface BreachResult {
  found: boolean;
  count?: number;
}

export default function BreachCheck(): JSX.Element {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length > 0 && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setResult(null);
    setError(null);

    const pw = password;
    // Clear password from state immediately so it doesn't sit around
    setPassword('');

    try {
      const hash = await sha1Upper(pw);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const r = await fetch(`/api/v1/breach/range?prefix=${prefix}`);
      if (!r.ok) {
        throw new Error(`Upstream error: HTTP ${r.status}`);
      }

      const text = await r.text();
      const lines = text.split('\n');
      let found = false;
      let count = 0;

      for (const line of lines) {
        const [lineSuffix, lineCount] = line.trim().split(':');
        if (lineSuffix && lineSuffix.toUpperCase() === suffix) {
          found = true;
          count = parseInt(lineCount ?? '0', 10);
          break;
        }
      }

      setResult({ found, count: found ? count : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Breach Checker</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-2xl">
          Check if a password has appeared in known data breaches using the{' '}
          <a
            href="https://haveibeenpwned.com/Passwords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            HIBP k-anonymity API
          </a>
          .
        </p>
      </motion.div>

      {/* Privacy notice */}
      <div className="mb-8 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 p-4">
        <div className="flex gap-3">
          <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800 dark:text-emerald-300">
            <strong className="font-semibold">Privacy-preserving:</strong> Your password is hashed in the browser using
            SHA-1. Only the first 5 characters of the hash are sent to our backend (k-anonymity). The full hash and the
            password itself never leave your browser.
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to check…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full px-4 py-3 pr-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 whitespace-nowrap"
          >
            Check
          </button>
        </div>
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Checking breach databases…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {result.found && result.count !== undefined ? (
            <section className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle size={24} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-xl mb-1">
                    Seen in <span className="font-mono">{result.count.toLocaleString()}</span>{' '}
                    {result.count === 1 ? 'breach' : 'breaches'}
                  </h2>
                  <div className="mb-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${getSeverity(result.count).classes}`}
                    >
                      {getSeverity(result.count).label} risk
                    </span>
                  </div>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                    This password has been seen in known data breach datasets. Avoid using it for any accounts.
                  </p>
                  <a
                    href="https://haveibeenpwned.com/Passwords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Learn more at HIBP
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 p-6">
              <div className="flex items-start gap-4">
                <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-xl mb-1">Not seen in any known breach</h2>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 mb-3">
                    Good news — this password was not found in the HIBP database. This does not guarantee security;
                    always use unique, strong passwords with a password manager.
                  </p>
                  <a
                    href="https://haveibeenpwned.com/Passwords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    haveibeenpwned.com/Passwords
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
}
