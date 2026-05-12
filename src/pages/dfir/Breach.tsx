import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Key,
  Globe,
  Mail,
  Eye,
  EyeOff,
  ExternalLink,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

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
        <div className="animate-fade-in-up">
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
                    Good news, this password was not found in the HIBP database. This does not guarantee security;
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
        </div>
      )}
    </div>
  );
}

// ─── Email tab ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailTab({ initialQuery = '' }: { initialQuery?: string }): JSX.Element {
  const [email, setEmail] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreachEmailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoFetched = useRef(false);
  const [, setSearchParams] = useSearchParams();

  const isValid = EMAIL_RE.test(email.trim());

  const runLookup = async (q: string) => {
    if (!EMAIL_RE.test(q.trim()) || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', 'email');
        out.set('q', q.trim());
        return out;
      },
      { replace: true }
    );
    try {
      const r = await fetch(`/api/v1/breach/email?email=${encodeURIComponent(q.trim())}`);
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runLookup(email);
  };

  // Auto-run if the page was opened with ?tab=email&q=<addr>.
  useEffect(() => {
    if (autoFetched.current) return;
    if (initialQuery && EMAIL_RE.test(initialQuery)) {
      autoFetched.current = true;
      void runLookup(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Privacy notice — explicit about upstream forwarding */}
      <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
        <div className="flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Your email is forwarded to third-party breach databases</p>
            <p className="text-[13px]">
              The lookup sends the address to{' '}
              <a href="https://xposedornot.com" target="_blank" rel="noopener noreferrer" className="underline">
                XposedOrNot
              </a>{' '}
              and (on cache miss){' '}
              <a href="https://leakcheck.io" target="_blank" rel="noopener noreferrer" className="underline">
                LeakCheck
              </a>
              . Transit logs may record the request as standard HTTP. The address is not stored in our app database.
              <strong>Don't query addresses you don't own.</strong>
            </p>
          </div>
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
        <div className="animate-fade-in-up space-y-6">
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

          {/* SOCMINT pivot CTA */}
          <Link
            to={`/dfir/socmint?q=${encodeURIComponent(result.email)}`}
            className="block rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5 hover:border-brand-500/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users size={22} className="text-brand-600 dark:text-brand-400 shrink-0" />
              <div className="flex-1">
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                  Pivot this email to SOCMINT sources →
                </h3>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                  Look up <code>{result.email}</code> across XposedOrNot, IntelX, EmailRep, Hunter, Apollo, ZoomInfo,
                  RocketReach, Lusha, GitHub commit-author search, paste-site dorks, social profiles, Gravatar, and
                  more.
                </p>
              </div>
              <ExternalLink size={14} className="text-slate-500 shrink-0" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Domain tab ───────────────────────────────────────────────────────────────

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

function DomainTab({ initialQuery = '' }: { initialQuery?: string }): JSX.Element {
  const [domain, setDomain] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreachDomainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoFetched = useRef(false);
  const [, setSearchParams] = useSearchParams();

  const isValid = DOMAIN_RE.test(domain.trim());

  const runLookup = async (q: string) => {
    if (!DOMAIN_RE.test(q.trim()) || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', 'domain');
        out.set('q', q.trim());
        return out;
      },
      { replace: true }
    );
    try {
      const r = await fetch(`/api/v1/breach/domain?domain=${encodeURIComponent(q.trim())}`);
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runLookup(domain);
  };

  // Auto-run if the page was opened with ?tab=domain&q=<domain>.
  useEffect(() => {
    if (autoFetched.current) return;
    if (initialQuery && DOMAIN_RE.test(initialQuery)) {
      autoFetched.current = true;
      void runLookup(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Notice — explicit about upstream forwarding + data quality */}
      <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
        <div className="flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Domain forwarded to XposedOrNot — and results are noisy</p>
            <p className="text-[13px]">
              The domain is sent to{' '}
              <a href="https://xposedornot.com" target="_blank" rel="noopener noreferrer" className="underline">
                XposedOrNot
              </a>
              . Transit logs may record the request as standard HTTP. Domain breach data aggregates many third-party
              sites, so treat any single hit as a starting point, not a verdict.{' '}
              <strong>Don't query domains you don't have authorization for.</strong>
            </p>
          </div>
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
        <div className="animate-fade-in-up space-y-6">
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

          {/* SOCMINT pivot CTA */}
          <Link
            to={`/dfir/socmint?q=${encodeURIComponent(result.domain)}`}
            className="block rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5 hover:border-brand-500/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users size={22} className="text-brand-600 dark:text-brand-400 shrink-0" />
              <div className="flex-1">
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                  Pivot this domain to SOCMINT sources →
                </h3>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                  Look up <code>{result.domain}</code> across Hunter, Apollo, ZoomInfo, RocketReach, GitHub
                  commit-author search, paste-site dorks, LinkedIn @domain dork, Shodan, Censys, crt.sh, and more.
                </p>
              </div>
              <ExternalLink size={14} className="text-slate-500 shrink-0" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function isMode(v: string | null): v is Mode {
  return v === 'password' || v === 'email' || v === 'domain';
}

export default function BreachPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get('tab');
  const urlQuery = searchParams.get('q') ?? '';
  const [mode, setModeState] = useState<Mode>(isMode(urlMode) ? urlMode : 'password');

  // Sync mode → URL whenever the user changes tabs. Drops ?q= since
  // queries are scoped per tab and don't survive a tab switch.
  const setMode = (next: Mode) => {
    setModeState(next);
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', next);
        out.delete('q');
        return out;
      },
      { replace: false }
    );
  };

  // React to URL changes from outside (back/forward, deep links).
  useEffect(() => {
    if (isMode(urlMode) && urlMode !== mode) setModeState(urlMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMode]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">Breach Checker</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Check if a password, email address, or domain has appeared in known data breaches.
        </p>
      </div>

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
      <div className="animate-fade-in-up" key={mode}>
        {mode === 'password' && <PasswordTab />}
        {mode === 'email' && <EmailTab initialQuery={urlQuery} />}
        {mode === 'domain' && <DomainTab initialQuery={urlQuery} />}
      </div>
      <RelatedWikiArticles />
    </div>
  );
}
