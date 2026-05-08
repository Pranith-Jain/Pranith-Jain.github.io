import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookText, Copy, Check, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;

interface CvssData {
  version: '3.1' | '3.0' | '2.0';
  base_score: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  vector: string;
}

interface KevData {
  in_kev: boolean;
  date_added?: string;
  vulnerability_name?: string;
  required_action?: string;
  due_date?: string;
}

interface EpssData {
  score: number;
  percentile: number;
  date: string;
}

interface CveLookupResult {
  cve_id: string;
  published?: string;
  last_modified?: string;
  description?: string;
  cvss?: CvssData;
  cwe?: string[];
  references?: Array<{ url: string; tags?: string[] }>;
  affected_products?: string[];
  kev: KevData;
  epss?: EpssData;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  MEDIUM: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function CveLookup(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CveLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = CVE_RE.test(input.trim());
  const canSubmit = valid && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/cve/search?id=${encodeURIComponent(input.trim().toUpperCase())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as CveLookupResult);
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
        <h1 className="text-4xl font-display font-bold mb-2">CVE Lookup</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Query NVD for CVE details — CVSS score, EPSS exploit likelihood, CISA KEV status, and references.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="CVE-2024-XXXXX"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <BookText size={16} className="inline mr-2" />
            Lookup
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a valid CVE ID (e.g. CVE-2024-12345)
          </p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Querying NVD…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <h2 className="font-display font-bold text-2xl font-mono">{result.cve_id}</h2>
              {result.kev.in_kev && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                  CISA KEV
                </span>
              )}
              {result.cvss && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${SEVERITY_STYLES[result.cvss.severity] ?? SEVERITY_STYLES.LOW}`}
                >
                  {result.cvss.severity} {result.cvss.base_score}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-500">
              {result.published && (
                <span>
                  Published: <span className="text-slate-700 dark:text-slate-300">{result.published.slice(0, 10)}</span>
                </span>
              )}
              {result.last_modified && (
                <span>
                  Modified:{' '}
                  <span className="text-slate-700 dark:text-slate-300">{result.last_modified.slice(0, 10)}</span>
                </span>
              )}
            </div>
          </section>

          {/* Description */}
          {result.description && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Description</h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{result.description}</p>
            </section>
          )}

          {/* CVSS */}
          {result.cvss && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">CVSS {result.cvss.version}</h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-4xl font-display font-bold">{result.cvss.base_score}</div>
                  <div className="text-xs font-mono text-slate-500">/ 10</div>
                </div>
                <div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${SEVERITY_STYLES[result.cvss.severity] ?? SEVERITY_STYLES.LOW}`}
                  >
                    {result.cvss.severity}
                  </span>
                  <div className="flex items-center mt-2 font-mono text-xs text-slate-500 break-all">
                    <span>{result.cvss.vector}</span>
                    <CopyButton text={result.cvss.vector} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* EPSS */}
          {result.epss && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">EPSS — Exploit Prediction</h3>
              <div className="flex gap-8 font-mono">
                <div>
                  <div className="text-2xl font-bold">{(result.epss.score * 100).toFixed(2)}%</div>
                  <div className="text-xs text-slate-500">exploit probability</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{(result.epss.percentile * 100).toFixed(1)}th</div>
                  <div className="text-xs text-slate-500">percentile</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{result.epss.date}</div>
                  <div className="text-xs text-slate-500">data date</div>
                </div>
              </div>
            </section>
          )}

          {/* KEV Details */}
          {result.kev.in_kev && (
            <section className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/10 p-6">
              <h3 className="font-display font-semibold text-lg mb-3 text-rose-800 dark:text-rose-300">
                CISA KEV — Known Exploited
              </h3>
              <div className="grid sm:grid-cols-3 gap-4 font-mono text-sm">
                {result.kev.date_added && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Date Added</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.date_added}</div>
                  </div>
                )}
                {result.kev.due_date && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Due Date</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.due_date}</div>
                  </div>
                )}
                {result.kev.required_action && (
                  <div className="sm:col-span-3">
                    <div className="text-xs text-slate-500 mb-1">Required Action</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.required_action}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* CWEs */}
          {result.cwe && result.cwe.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Weaknesses (CWE)</h3>
              <div className="flex flex-wrap gap-2">
                {result.cwe.map((id) => {
                  const num = id.replace('CWE-', '');
                  return (
                    <a
                      key={id}
                      href={`https://cwe.mitre.org/data/definitions/${num}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {id}
                      <ExternalLink size={10} />
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* Affected Products */}
          {result.affected_products && result.affected_products.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Affected Products</h3>
              <ul className="space-y-1">
                {result.affected_products.map((cpe) => (
                  <li key={cpe} className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
                    {cpe}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* References */}
          {result.references && result.references.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">References</h3>
              <ul className="space-y-2">
                {result.references.map(({ url, tags }) => (
                  <li key={url} className="flex items-start gap-2">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-600 dark:text-brand-400 hover:underline break-all font-mono flex items-center gap-1"
                    >
                      {url}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                    {tags && tags.length > 0 && (
                      <span className="text-xs font-mono text-slate-500 shrink-0">[{tags.join(', ')}]</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
