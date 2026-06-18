import { useState, useMemo, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Shield, AlertTriangle, CheckCircle, HelpCircle, Loader2, Upload, X } from 'lucide-react';

type Verdict = 'malicious' | 'suspicious' | 'benign' | 'unknown';

interface SourceVerdict {
  source: string;
  verdict: Verdict;
  score: number;
  detail: string;
}

interface IocResult {
  ioc: string;
  type: string;
  verdict: Verdict;
  consensus: number;
  sources: SourceVerdict[];
}

interface ExplainEvidence {
  source: string;
  finding: string;
  score: number;
}

interface ExplainResponse {
  indicator: string;
  type: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score: number;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
  top_evidence: ExplainEvidence[];
  contributed_providers: number;
  generated_at: string;
}

const VERDICT_MAP: Record<string, Verdict> = {
  malicious: 'malicious',
  suspicious: 'suspicious',
  clean: 'benign',
  unknown: 'unknown',
};

function detectIocType(value: string): string {
  const v = value.trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) return 'IP';
  if (/^[a-fA-F0-9]{32}$/.test(v)) return 'MD5';
  if (/^[a-fA-F0-9]{40}$/.test(v)) return 'SHA1';
  if (/^[a-fA-F0-9]{64}$/.test(v)) return 'SHA256';
  if (/^[a-fA-F0-9]{128}$/.test(v)) return 'SHA512';
  if (/^https?:\/\//.test(v)) return 'URL';
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(v)) return 'Domain';
  return 'Unknown';
}

const VERDICT_STYLES: Record<Verdict, string> = {
  malicious: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  suspicious:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  benign: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800',
  unknown: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-[#1e2030]',
};

const VERDICT_ICONS: Record<Verdict, typeof Shield> = {
  malicious: AlertTriangle,
  suspicious: HelpCircle,
  benign: CheckCircle,
  unknown: HelpCircle,
};

export default function XVeridikt(): JSX.Element {
  const [iocInput, setIocInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [results, setResults] = useState<IocResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterVerdict, setFilterVerdict] = useState<Verdict | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);

    const inputs =
      mode === 'single'
        ? [iocInput.trim()]
        : bulkInput
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
    if (inputs.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const outcomes = await Promise.all(
        inputs.map(async (indicator) => {
          const res = await fetch('/api/v1/ioc/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indicator }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            let msg = `HTTP ${res.status}`;
            try {
              const p = JSON.parse(body) as { message?: string; error?: string };
              msg = p.message ?? p.error ?? msg;
            } catch {
              /* */
            }
            throw new Error(`${indicator}: ${msg}`);
          }
          const data = (await res.json()) as ExplainResponse;
          return {
            ioc: data.indicator,
            type: data.type.charAt(0).toUpperCase() + data.type.slice(1),
            verdict: VERDICT_MAP[data.verdict] ?? 'unknown',
            consensus: data.score,
            sources: data.top_evidence.map((e) => ({
              source: e.source,
              verdict: VERDICT_MAP[data.verdict] ?? 'unknown',
              score: e.score,
              detail: e.finding,
            })),
          } as IocResult;
        })
      );
      setResults(outcomes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [iocInput, bulkInput, mode]);

  const iocType = useMemo(() => detectIocType(iocInput), [iocInput]);

  const filtered = useMemo(() => {
    let r = results;
    if (filterVerdict !== 'all') r = r.filter((x) => x.verdict === filterVerdict);
    if (filterType !== 'all') r = r.filter((x) => x.type === filterType);
    return r;
  }, [results, filterVerdict, filterType]);

  const uniqueTypes = useMemo(() => [...new Set(results.map((r) => r.type))], [results]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> X-VERDIKT
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Cross-reference an indicator across 10 threat-intel sources in parallel. Single or bulk mode. Get a consensus
          verdict with per-source scores, flags, and detail in one view.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 flex items-start gap-3 mb-6">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Verdict failed</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono break-all">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`px-4 py-2 rounded-xl text-sm font-mono font-medium transition-colors ${
                mode === 'single'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-[#12121a]/40 border border-slate-200 dark:border-[#1e2030] text-slate-700 dark:text-slate-300'
              }`}
            >
              Quick Lookup
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`px-4 py-2 rounded-xl text-sm font-mono font-medium transition-colors ${
                mode === 'bulk'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-[#12121a]/40 border border-slate-200 dark:border-[#1e2030] text-slate-700 dark:text-slate-300'
              }`}
            >
              Bulk IOC Input
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/40 shadow-e1 p-5">
            {mode === 'single' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-slate-400" />
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-400">IOC Type</span>
                  {iocInput && (
                    <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                      {iocType}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={iocInput}
                  onChange={(e) => setIocInput(e.target.value)}
                  placeholder="IP / Domain / URL / Hash…"
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1e2030] bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 font-mono"
                />
                <p className="text-micro font-mono text-slate-400">
                  Auto-detects IPv4, Domains, URLs, MD5/SHA1/SHA256/SHA512
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Upload size={14} className="text-slate-400" />
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Bulk Input</span>
                </div>
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={'One IOC per line\n185.234.72.10\nmalware.example.com\nd41d8cd98f00b204e9800998ecf8427e'}
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1e2030] bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 font-mono"
                />
                <p className="text-micro font-mono text-slate-400">One IOC per line. Auto-detects type.</p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={runAnalysis}
                disabled={loading || (!iocInput && !bulkInput)}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? 'Analyzing…' : 'Analyze'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResults([]);
                  setIocInput('');
                  setBulkInput('');
                  setError(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#12121a]/40 border border-slate-200 dark:border-[#1e2030] text-muted rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <X size={16} /> Clear
              </button>
            </div>
          </div>

          {results.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/40 shadow-e1 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Filter</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterVerdict}
                  onChange={(e) => setFilterVerdict(e.target.value as Verdict | 'all')}
                  className="px-2 py-1 text-xs font-mono bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-slate-700 dark:text-slate-300"
                >
                  <option value="all">All Verdicts</option>
                  <option value="malicious">Malicious</option>
                  <option value="suspicious">Suspicious</option>
                  <option value="benign">Benign</option>
                  <option value="unknown">Unknown</option>
                </select>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-2 py-1 text-xs font-mono bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-slate-700 dark:text-slate-300"
                >
                  <option value="all">All Types</option>
                  {uniqueTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div>
          {loading && (
            <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/40 shadow-e1 p-8 flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-brand-600" />
              <p className="text-sm font-mono text-slate-500">Querying threat-intel sources in parallel…</p>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/20 p-8 flex flex-col items-center justify-center text-center">
              <Shield size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                Enter an IOC above to get multi-source verdict
              </p>
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-2">
                Multi-provider enrichment · AI-powered analysis
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-4">
              {filtered.map((result) => {
                const VIcon = VERDICT_ICONS[result.verdict];
                return (
                  <div
                    key={result.ioc}
                    className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/40 shadow-e1 p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">{result.ioc}</h3>
                        <span className="text-micro font-mono text-slate-400">{result.type}</span>
                      </div>
                      <span
                        className={`flex items-center gap-1 shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${VERDICT_STYLES[result.verdict]}`}
                      >
                        <VIcon size={12} /> {result.verdict}
                      </span>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-micro font-mono text-slate-400">Consensus</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              result.consensus >= 70
                                ? 'bg-red-500'
                                : result.consensus >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${result.consensus}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-500">{result.consensus}%</span>
                      </div>
                    </div>

                    {result.sources.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {result.sources.map((src) => {
                          const SIcon = VERDICT_ICONS[src.verdict];
                          return (
                            <div
                              key={src.source}
                              className={`rounded-lg border px-2.5 py-2 ${VERDICT_STYLES[src.verdict]}`}
                            >
                              <div className="text-micro font-mono font-semibold">{src.source}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <SIcon size={10} />
                                <span className="text-micro font-mono">{src.verdict}</span>
                                <span className="text-micro font-mono ml-auto">{src.score}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">Multi-provider engine · H3AD-X / X-VERDIKT</p>
    </div>
  );
}
