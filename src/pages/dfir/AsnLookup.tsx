import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Network, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const ASN_RE = /^(AS)?\d{1,10}$/i;

interface RirData {
  name: string;
  country: string;
  date_allocated?: string;
}

interface AsnResult {
  asn: number;
  name?: string;
  description?: string;
  country_code?: string;
  website?: string;
  abuse_contacts?: string[];
  email_contacts?: string[];
  rir?: RirData;
  prefixes_v4: number;
  prefixes_v6: number;
  sample_prefixes_v4?: string[];
  sample_prefixes_v6?: string[];
  date_updated?: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
  CA: '🇨🇦',
  AU: '🇦🇺',
  JP: '🇯🇵',
  CN: '🇨🇳',
  RU: '🇷🇺',
  BR: '🇧🇷',
  IN: '🇮🇳',
  SG: '🇸🇬',
  SE: '🇸🇪',
  NO: '🇳🇴',
  CH: '🇨🇭',
  IE: '🇮🇪',
  IL: '🇮🇱',
  KR: '🇰🇷',
  HK: '🇭🇰',
};

function countryFlag(code?: string): string {
  if (!code) return '';
  return COUNTRY_FLAGS[code.toUpperCase()] ?? '';
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
          Query BGPView for Autonomous System details — name, country, RIR, and announced IP prefixes.
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

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Querying BGPView…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <h2 className="font-display font-bold text-2xl font-mono">AS{result.asn}</h2>
              {result.country_code && (
                <span className="text-2xl" title={result.country_code}>
                  {countryFlag(result.country_code)}
                </span>
              )}
              {result.name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-bold font-mono bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-300 dark:border-brand-700">
                  {result.name}
                </span>
              )}
            </div>
            {result.description && <p className="text-slate-700 dark:text-slate-300 mb-3">{result.description}</p>}
            <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-500">
              {result.country_code && (
                <span>
                  Country: <span className="text-slate-700 dark:text-slate-300">{result.country_code}</span>
                </span>
              )}
              {result.date_updated && (
                <span>
                  Updated:{' '}
                  <span className="text-slate-700 dark:text-slate-300">{result.date_updated.slice(0, 10)}</span>
                </span>
              )}
            </div>
          </section>

          {/* Website */}
          {result.website && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Website</h3>
              <a
                href={result.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline font-mono text-sm flex items-center gap-1"
              >
                {result.website}
                <ExternalLink size={12} />
              </a>
            </section>
          )}

          {/* Contacts */}
          {((result.abuse_contacts && result.abuse_contacts.length > 0) ||
            (result.email_contacts && result.email_contacts.length > 0)) && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Contacts</h3>
              {result.abuse_contacts && result.abuse_contacts.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">Abuse</div>
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
                </div>
              )}
              {result.email_contacts && result.email_contacts.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">General</div>
                  <div className="flex flex-wrap gap-2">
                    {result.email_contacts.map((email) => (
                      <a
                        key={email}
                        href={`mailto:${email}`}
                        className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {email}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* RIR */}
          {result.rir && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">RIR Allocation</h3>
              <div className="grid sm:grid-cols-3 gap-4 font-mono text-sm">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Registry</div>
                  <div className="text-slate-800 dark:text-slate-200 font-semibold">{result.rir.name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Country</div>
                  <div className="text-slate-800 dark:text-slate-200">{result.rir.country}</div>
                </div>
                {result.rir.date_allocated && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Allocated</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.rir.date_allocated}</div>
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
