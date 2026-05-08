import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Globe,
  Mail,
  Eye,
  EyeOff,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';

// ─── types ────────────────────────────────────────────────────────────────────

type Mode = 'password' | 'email' | 'domain';

const MODES: Array<{ id: Mode; label: string; icon: typeof Key }> = [
  { id: 'password', label: 'Password', icon: Key },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'domain', label: 'Domain', icon: Globe },
];

interface BreachEntry {
  name: string;
  domain?: string;
  breach_date?: string;
  description?: string;
  pwn_count?: number;
  data_classes?: string[];
  logo?: string;
}

interface BreachEmailResponse {
  email: string;
  found: boolean;
  source: 'xposedornot' | 'leakcheck' | 'none';
  breach_count: number;
  breaches: BreachEntry[];
}

interface BreachDomainResponse {
  domain: string;
  found: boolean;
  source: 'xposedornot' | 'leakcheck' | 'none';
  breach_count: number;
  breaches: BreachEntry[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function sha1Upper(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function humanizeCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
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

// ─── BreachCards: shared card renderer for email/domain results ───────────────

function BreachCards({ breaches }: { breaches: BreachEntry[] }): JSX.Element {
  return (
    <div className="space-y-4">
      {breaches.map((b, i) => (
        <div
          key={i}
          className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {b.logo && (
                <img
                  src={b.logo}
                  alt={b.name}
                  className="w-6 h-6 rounded object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{b.name}</h4>
                {b.domain && <p className="text-xs text-slate-500 truncate">{b.domain}</p>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {b.breach_date && <span className="text-xs font-mono text-slate-500">{b.breach_date}</span>}
              {b.pwn_count !== undefined && (
                <span className="text-xs font-mono text-slate-500">{humanizeCount(b.pwn_count)} records</span>
              )}
            </div>
          </div>
          {b.data_classes && b.data_classes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {b.data_classes.slice(0, 8).map((d, j) => (
                <span
                  key={j}
                  className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
          {b.description && <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{b.description}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Password tab ─────────────────────────────────────────────────────────────

function PasswordTab(): JSX.Element {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ found: boolean; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length > 0 && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const pw = password;
    setPassword('');

    try {
      const hash = await sha1Upper(pw);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const r = await fetch(`/api/v1/breach/range?prefix=${prefix}`);
      if (!r.ok) throw new Error(`Upstream error: HTTP ${r.status}`);

      const text = await r.text();
      let found = false;
      let count = 0;
      for (const line of text.split('\n')) {
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
    <div>
      {/* Privacy notice */}
      <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 p-4">
        <div className="flex gap-3">
          <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800 dark:text-emerald-300">
            <strong className="font-semibold">Privacy-preserving:</strong> Your password is hashed in your browser using
            SHA-1. Only the first 5 characters of the hash (k-anonymity) are sent to our backend and then to{' '}
            <a
              href="https://haveibeenpwned.com/Passwords"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              HIBP
            </a>
            . Your password never leaves your device.
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mb-8">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to check..."
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

      {loading && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Checking breach databases...</span>
        </div>
      )}
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

// ─── Email tab ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailTab(): JSX.Element {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreachEmailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValid = EMAIL_RE.test(email.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/breach/email?email=${encodeURIComponent(email.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as BreachEmailResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Privacy notice */}
      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
        <div className="flex gap-3">
          <Shield size={18} className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your email is sent to our backend and forwarded to public breach databases (XposedOrNot, LeakCheck). No
            email data is stored. Results are cached for 1 hour.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mb-8">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!isValid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 whitespace-nowrap"
          >
            Check
          </button>
        </div>
      </form>

      {loading && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Querying breach databases...</span>
        </div>
      )}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Summary */}
          <section
            className={`rounded-2xl border p-6 ${
              result.found
                ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20'
                : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-xl">{result.email}</h2>
                <p className="text-xs text-slate-500 mt-1 font-mono">source: {result.source}</p>
              </div>
              <div
                className={`px-4 py-2 rounded-xl text-center shrink-0 ${
                  result.found ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                }`}
              >
                <span className="text-2xl font-bold">{result.breach_count}</span>
                <p className="text-xs">breach{result.breach_count !== 1 ? 'es' : ''}</p>
              </div>
            </div>
          </section>

          {/* Breach cards */}
          {result.breaches.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-500" />
                Found in {result.breaches.length} breach{result.breaches.length !== 1 ? 'es' : ''}
              </h3>
              <BreachCards breaches={result.breaches} />
            </section>
          )}

          {/* Not found */}
          {!result.found && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
              <ShieldCheck size={32} className="mx-auto mb-3 text-emerald-500" />
              <p className="text-emerald-700 dark:text-emerald-400 font-semibold">No breaches found</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
                {result.email} was not found in the databases we checked.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Domain tab ───────────────────────────────────────────────────────────────

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

function DomainTab(): JSX.Element {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreachDomainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValid = DOMAIN_RE.test(domain.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/breach/domain?domain=${encodeURIComponent(domain.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as BreachDomainResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Notice */}
      <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-4">
        <div className="flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Domain breach data is inherently noisy — many breaches aggregate from many sites. Results show breaches
            where XposedOrNot identified the domain as involved.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!isValid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 whitespace-nowrap"
          >
            Check
          </button>
        </div>
        {domain && !isValid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a valid domain (e.g. example.com)
          </p>
        )}
      </form>

      {loading && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Querying breach databases...</span>
        </div>
      )}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Summary */}
          <section
            className={`rounded-2xl border p-6 ${
              result.found
                ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20'
                : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-xl">{result.domain}</h2>
                <p className="text-xs text-slate-500 mt-1 font-mono">source: {result.source}</p>
              </div>
              <div
                className={`px-4 py-2 rounded-xl text-center shrink-0 ${
                  result.found ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                }`}
              >
                <span className="text-2xl font-bold">{result.breach_count}</span>
                <p className="text-xs">breach{result.breach_count !== 1 ? 'es' : ''}</p>
              </div>
            </div>
          </section>

          {/* Breach cards */}
          {result.breaches.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-500" />
                Found in {result.breaches.length} breach{result.breaches.length !== 1 ? 'es' : ''}
              </h3>
              <BreachCards breaches={result.breaches} />
            </section>
          )}

          {/* Not found */}
          {!result.found && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
              <ShieldCheck size={32} className="mx-auto mb-3 text-emerald-500" />
              <p className="text-emerald-700 dark:text-emerald-400 font-semibold">No breaches found</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
                {result.domain} was not found in the breach databases we checked.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function BreachPage(): JSX.Element {
  const [mode, setMode] = useState<Mode>('password');

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Breach Checker</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Check if a password, email address, or domain has appeared in known data breaches.
        </p>
      </motion.div>

      {/* Tab pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors ${
                mode === m.id
                  ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/40'
              }`}
            >
              <Icon size={12} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {mode === 'password' && <PasswordTab />}
        {mode === 'email' && <EmailTab />}
        {mode === 'domain' && <DomainTab />}
      </motion.div>
    </div>
  );
}
