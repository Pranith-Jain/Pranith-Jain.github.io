import { useState, useRef, useEffect, useCallback } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bug, ExternalLink, Globe, Hash, Info, Loader2, Mail, Search, Shield, ShieldAlert, Zap } from 'lucide-react';

interface EnrichmentResult {
  provider: string;
  status: 'malicious' | 'suspicious' | 'clean' | 'unknown' | 'error';
  verdict?: string;
  score?: number;
  details?: string;
  link?: string;
  tags?: string[];
}

interface CopilotResponse {
  query: string;
  ioc_type: string;
  confidence: number;
  narrative: string;
  results: EnrichmentResult[];
  consensus: { verdict: string; confidence: number; sources_agreeing: number; total_sources: number };
  recommendations: string[];
  mitre_techniques?: string[];
  processed_at: string;
}

const IOC_PATTERNS = {
  ip: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
  domain: /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/,
  hash_md5: /^[a-fA-F0-9]{32}$/,
  hash_sha1: /^[a-fA-F0-9]{40}$/,
  hash_sha256: /^[a-fA-F0-9]{64}$/,
  hash_sha512: /^[a-fA-F0-9]{128}$/,
  url: /^https?:\/\//,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  cve: /^CVE-\d{4}-\d{4,}$/,
};

function detectIOCType(q: string): string {
  const trimmed = q.trim();
  if (IOC_PATTERNS.cve.test(trimmed)) return 'cve';
  if (IOC_PATTERNS.hash_sha256.test(trimmed)) return 'sha256';
  if (IOC_PATTERNS.hash_sha512.test(trimmed)) return 'sha512';
  if (IOC_PATTERNS.hash_sha1.test(trimmed)) return 'sha1';
  if (IOC_PATTERNS.hash_md5.test(trimmed)) return 'md5';
  if (IOC_PATTERNS.email.test(trimmed)) return 'email';
  if (IOC_PATTERNS.url.test(trimmed)) return 'url';
  if (IOC_PATTERNS.ip.test(trimmed)) return 'ip';
  if (IOC_PATTERNS.domain.test(trimmed)) return 'domain';
  return 'unknown';
}

const IOC_ICONS: Record<string, typeof Shield> = {
  ip: Globe,
  domain: Globe,
  md5: Hash,
  sha1: Hash,
  sha256: Hash,
  sha512: Hash,
  url: ExternalLink,
  email: Mail,
  cve: Bug,
  unknown: Search,
};

const IOC_COLORS: Record<string, string> = {
  ip: 'text-blue-600 dark:text-blue-400',
  domain: 'text-cyan-600 dark:text-cyan-400',
  md5: 'text-violet-600 dark:text-violet-400',
  sha1: 'text-violet-600 dark:text-violet-400',
  sha256: 'text-violet-600 dark:text-violet-400',
  sha512: 'text-violet-600 dark:text-violet-400',
  url: 'text-orange-600 dark:text-orange-400',
  email: 'text-pink-600 dark:text-pink-400',
  cve: 'text-amber-600 dark:text-amber-400',
  unknown: 'text-slate-500',
};

const STATUS_COLORS: Record<string, string> = {
  malicious: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50',
  suspicious:
    'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
  clean:
    'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50',
  unknown: 'text-slate-500 bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-[rgb(var(--border-400))]/50',
  error: 'text-slate-500 bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-[rgb(var(--border-400))]/50',
};

const QUERY_EXAMPLES = [
  { label: '8.8.8.8', type: 'IP address', query: '8.8.8.8' },
  { label: 'google.com', type: 'Domain', query: 'google.com' },
  { label: 'CVE-2024-1709', type: 'CVE', query: 'CVE-2024-1709' },
  { label: 'd41d8cd98f00b204e9800998ecf8427e', type: 'MD5 hash', query: 'd41d8cd98f00b204e9800998ecf8427e' },
];

export default function DfirCopilot(): JSX.Element {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const iocType = detectIOCType(query);
  const Icon = IOC_ICONS[iocType] || Search;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const investigate = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/copilot/investigate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      });
      if (!res.ok) {
        const body = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          msg = (JSON.parse(body) as { error?: string }).error ?? msg;
        } catch {
          /* */
        }
        throw new Error(msg);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Zap size={28} />}
      title="DFIR Copilot"
      maxWidthClass="max-w-5xl"
      description="AI-powered IOC investigation. Paste any IP, domain, hash, URL, email, or CVE — get a multi-source verdict with confidence scoring and actionable recommendations."
    >
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          investigate(query);
        }}
        className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Icon size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${IOC_COLORS[iocType]}`} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste an IOC — IP, domain, hash, URL, email, or CVE…"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-4 py-2.5 rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Investigate
          </button>
        </div>
        {iocType !== 'unknown' && (
          <div className="mt-2 text-[11px] font-mono text-slate-500">
            Detected: <span className={IOC_COLORS[iocType]}>{iocType.toUpperCase()}</span>
          </div>
        )}
      </form>

      {/* Quick examples */}
      {!result && !loading && (
        <div className="mb-6">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Quick examples
          </div>
          <div className="flex flex-wrap gap-2">
            {QUERY_EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setQuery(ex.label);
                  investigate(ex.label);
                }}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                {ex.label} <span className="text-slate-400 ml-1">({ex.type})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <ShieldAlert size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Consensus verdict */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
            <div className="flex items-center gap-3 mb-3">
              <span
                className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border uppercase tracking-wider ${STATUS_COLORS[result.consensus.verdict]}`}
              >
                {result.consensus.verdict}
              </span>
              <span className="text-sm font-mono text-slate-900 dark:text-slate-100 font-semibold">
                {result.consensus.sources_agreeing}/{result.consensus.total_sources} sources agree
              </span>
              <span className="text-xs font-mono text-slate-500">
                {Math.round(result.consensus.confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed">{result.narrative}</p>
          </div>

          {/* Per-source results */}
          <div>
            <h3 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Source Results
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {result.results.map((r) => (
                <div
                  key={r.provider}
                  className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {r.provider}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${STATUS_COLORS[r.status]}`}
                    >
                      {r.status}
                    </span>
                    {r.score != null && <span className="text-[10px] font-mono text-slate-400 ml-auto">{r.score}</span>}
                    {r.link && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-auto"
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  {r.verdict && <p className="text-[11px] text-slate-500 mt-1">{r.verdict}</p>}
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Recommended Actions
              </h3>
              <ul className="space-y-1.5">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted">
                    <span className="text-brand-600 dark:text-brand-400 mt-0.5">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MITRE techniques */}
          {result.mitre_techniques && result.mitre_techniques.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
                MITRE ATT&CK Techniques
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {result.mitre_techniques.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
            <Info size={12} />
            Investigated at {result.processed_at} · IOC type: {result.ioc_type}
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}
