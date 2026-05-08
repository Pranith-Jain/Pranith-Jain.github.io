import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Network } from 'lucide-react';
import { motion } from 'framer-motion';

const ASN_RE = /^(AS)?\d{1,10}$/i;

interface RirData {
  name?: string;
  description?: string;
}

interface AsnResult {
  asn: number;
  name?: string;
  description?: string;
  type?: string;
  is_announced?: boolean;
  abuse_contacts?: string[];
  rir?: RirData;
  prefixes_v4: number;
  prefixes_v6: number;
  sample_prefixes_v4?: string[];
  sample_prefixes_v6?: string[];
}

export default function AsnLookup(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AsnResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = ASN_RE.test(input.trim());
  const canSubmit = valid && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/asn/lookup?asn=${encodeURIComponent(input.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as AsnResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">ASN Lookup</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Query RIPEstat for Autonomous System details — name, RIR, abuse contacts, and announced IP prefixes.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="AS15169 or 15169"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Network size={16} className="inline mr-2" />
            Lookup
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a valid ASN (e.g. AS15169 or 15169)
          </p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Querying RIPEstat…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <h2 className="font-display font-bold text-2xl font-mono">AS{result.asn}</h2>
              {result.name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-bold font-mono bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-300 dark:border-brand-700">
                  {result.name}
                </span>
              )}
              {result.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                  {result.type}
                </span>
              )}
            </div>
            {result.description && <p className="text-slate-700 dark:text-slate-300 mb-3">{result.description}</p>}
            <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-500">
              {result.is_announced !== undefined && (
                <span>
                  Announced:{' '}
                  <span className={result.is_announced ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                    {result.is_announced ? 'Yes' : 'No'}
                  </span>
                </span>
              )}
            </div>
          </section>

          {/* Contacts */}
          {result.abuse_contacts && result.abuse_contacts.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Abuse Contacts</h3>
              <div className="flex flex-wrap gap-2">
                {result.abuse_contacts.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {email}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* RIR */}
          {result.rir && (result.rir.name || result.rir.description) && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">RIR / Registry</h3>
              <div className="grid sm:grid-cols-2 gap-4 font-mono text-sm">
                {result.rir.name && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Registry</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">{result.rir.name}</div>
                  </div>
                )}
                {result.rir.description && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Description</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.rir.description}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Prefixes */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="font-display font-semibold text-lg mb-4">Announced Prefixes</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-2">
                  IPv4 ({result.prefixes_v4} total)
                </div>
                {result.sample_prefixes_v4 && result.sample_prefixes_v4.length > 0 ? (
                  <ul className="space-y-1">
                    {result.sample_prefixes_v4.map((p) => (
                      <li
                        key={p}
                        className="font-mono text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded"
                      >
                        {p}
                      </li>
                    ))}
                    {result.prefixes_v4 > 5 && (
                      <li className="font-mono text-xs text-slate-500">… and {result.prefixes_v4 - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="font-mono text-sm text-slate-500">None announced</p>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-2">
                  IPv6 ({result.prefixes_v6} total)
                </div>
                {result.sample_prefixes_v6 && result.sample_prefixes_v6.length > 0 ? (
                  <ul className="space-y-1">
                    {result.sample_prefixes_v6.map((p) => (
                      <li
                        key={p}
                        className="font-mono text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded break-all"
                      >
                        {p}
                      </li>
                    ))}
                    {result.prefixes_v6 > 5 && (
                      <li className="font-mono text-xs text-slate-500">… and {result.prefixes_v6 - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="font-mono text-sm text-slate-500">None announced</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
