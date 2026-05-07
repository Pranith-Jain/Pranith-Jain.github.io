import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import type { DomainLookupResponse } from '../../lib/dfir/types';
import { WhoisCard } from '../../components/dfir/WhoisCard';
import { DnsRecordList } from '../../components/dfir/DnsRecordList';
import { EmailAuthCard } from '../../components/dfir/EmailAuthCard';
import { CertList } from '../../components/dfir/CertList';
import { recordHistory } from '../../lib/dfir/history';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export default function Domain(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('domain') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = DOMAIN_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/domain/lookup?domain=${encodeURIComponent(input.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      const r2 = (await r.json()) as DomainLookupResponse;
      setResult(r2);
      recordHistory({ tool: 'domain', indicator: r2.domain, verdict: r2.verdict, score: r2.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Domain Lookup</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          WHOIS, DNS, SPF / DMARC / DKIM / BIMI / MTA-STS, and Certificate Transparency — one query.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!valid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            Look up
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">Not a valid domain.</p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Looking up…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display font-bold text-2xl">{result.domain}</h2>
              <span className="font-mono text-sm">
                health: <span className="text-slate-900 dark:text-slate-100">{result.score}/100</span>{' '}
                <span
                  className={
                    result.verdict === 'strong'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : result.verdict === 'partial'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  ({result.verdict})
                </span>
              </span>
            </div>
          </section>
          <WhoisCard rdap={result.rdap} />
          <EmailAuthCard auth={result.email_auth} />
          <DnsRecordList dns={result.dns} />
          <CertList certs={result.certificates} />
        </div>
      )}
    </div>
  );
}
