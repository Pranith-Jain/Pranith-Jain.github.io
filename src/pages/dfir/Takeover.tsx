import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AlertTriangle, ShieldCheck, Search, Info } from 'lucide-react';
interface TakeoverResult {
  domain: string;
  cname_chain: string[];
  resolves: boolean;
  service?: string;
  vulnerable: boolean;
  evidence?: string;
  recommendation?: string;
  notes: string[];
}

export default function Takeover(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDomain = searchParams.get('domain') ?? searchParams.get('q') ?? '';
  const [domain, setDomain] = useState(initialDomain);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TakeoverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoFetched = useRef(false);

  const runCheck = async (q: string) => {
    const target = q.trim().toLowerCase();
    if (!target) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSearchParams({ domain: target }, { replace: true });
    try {
      const r = await fetch(`/api/v1/takeover/check?domain=${encodeURIComponent(target)}`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as TakeoverResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runCheck(domain);
  };

  useEffect(() => {
    if (autoFetched.current) return;
    if (initialDomain) {
      autoFetched.current = true;
      void runCheck(initialDomain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — Intentional: mount-only effect
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Subdomain Takeover Check</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Resolves a subdomain's CNAME chain and matches it against ~15 known dangling-service patterns (S3, GitHub
          Pages, Heroku, Azure, Shopify, Webflow, Statuspage, and more). If the CNAME points to an unclaimed service,
          the dangling fingerprint is verified by fetching the page.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="subdomain.example.com"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            {loading ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-sm font-mono text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          <section
            className={`rounded-2xl border p-6 ${
              result.vulnerable
                ? 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-900/10'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              {result.vulnerable ? (
                <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400" />
              ) : (
                <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
              )}
              <h2 className="font-display font-bold text-2xl">
                {result.vulnerable ? 'Vulnerable to takeover' : 'No takeover risk detected'}
              </h2>
            </div>
            {result.service && (
              <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
                Service: <span className="text-slate-900 dark:text-slate-100">{result.service}</span>
              </p>
            )}
            {result.evidence && (
              <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
                Evidence: <span className="text-slate-900 dark:text-slate-100">{result.evidence}</span>
              </p>
            )}
            {result.recommendation && (
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 leading-relaxed">{result.recommendation}</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-5">
            <h3 className="font-display font-semibold mb-3">CNAME chain</h3>
            {result.cname_chain.length === 0 ? (
              <p className="text-sm font-mono text-slate-500">No CNAME records.</p>
            ) : (
              <ol className="font-mono text-sm space-y-1 text-slate-700 dark:text-slate-300">
                <li className="text-slate-500">{result.domain}</li>
                {result.cname_chain.map((c, i) => (
                  <li key={i} className="pl-4 border-l border-slate-300 dark:border-slate-700">
                    → {c}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {result.notes.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-5 space-y-2">
              {result.notes.map((n) => (
                <div key={n} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
