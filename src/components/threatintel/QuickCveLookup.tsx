import { useState } from 'react';
import { BookText, ExternalLink, Loader2 } from 'lucide-react';
import { SEVERITY_TONE, type Severity } from '../severity';

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
  known_ransomware?: boolean;
}

interface EpssData {
  score: number;
  percentile: number;
  date: string;
}

interface CveLookupResult {
  cve_id: string;
  published?: string;
  description?: string;
  cvss?: CvssData;
  epss?: EpssData;
  kev: KevData;
}

const toSeverity = (s: string): Severity => {
  const k = s.toLowerCase();
  return k === 'critical' || k === 'high' || k === 'medium' || k === 'low' ? k : 'low';
};

export default function QuickCveLookup() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CveLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = CVE_RE.test(input.trim());
  const canSubmit = valid && !loading;

  const runLookup = async () => {
    const id = input.trim().toUpperCase();
    if (!CVE_RE.test(id)) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/cve/search?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult((await r.json()) as CveLookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <BookText size={14} className="text-brand-600 dark:text-brand-400" />
        CVE Lookup
      </h4>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runLookup()}
          placeholder="CVE-2024-12345"
          className="flex-1 px-3 py-3 sm:py-1.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs font-mono focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
        <button
          onClick={() => void runLookup()}
          disabled={!canSubmit}
          className="px-3 py-3 sm:py-1.5 rounded bg-brand-600 dark:bg-brand-500 text-white text-xs font-mono disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <BookText size={12} />}
        </button>
      </div>

      {loading && <p className="mt-2 text-micro font-mono text-slate-500">Querying NVD…</p>}

      {error && <p className="mt-2 text-micro font-mono text-rose-500">error: {error}</p>}

      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="font-mono text-sm font-bold">{result.cve_id}</span>
            {result.kev.in_kev && (
              <span className="text-micro px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                CISA KEV
              </span>
            )}
            {result.kev.known_ransomware && (
              <span className="text-micro px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-400 dark:border-amber-700">
                Ransomware
              </span>
            )}
            {result.cvss && (
              <span
                className={`text-micro px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${SEVERITY_TONE[toSeverity(result.cvss.severity)]}`}
              >
                {result.cvss.severity} {result.cvss.base_score}
              </span>
            )}
          </div>

          {result.description && <p className="text-mini text-muted line-clamp-2">{result.description}</p>}

          {(result.cvss || result.epss) && (
            <div className="flex gap-3 text-micro font-mono text-slate-500">
              {result.cvss && (
                <span>
                  CVSS: <strong className="text-slate-800 dark:text-slate-200">{result.cvss.base_score}</strong>
                </span>
              )}
              {result.epss && (
                <span>
                  EPSS:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {(result.epss.score * 100).toFixed(2)}%
                  </strong>
                </span>
              )}
            </div>
          )}

          <a
            href={`/dfir/cve-lookup?cve=${result.cve_id}`}
            className="inline-flex items-center gap-1 text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            Open in CVE Lookup <ExternalLink size={10} />
          </a>
        </div>
      )}
    </div>
  );
}
