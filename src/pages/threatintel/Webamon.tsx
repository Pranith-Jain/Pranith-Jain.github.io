import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Globe,
  Fingerprint,
  Tag,
  Shield,
  Send,
  FileImage,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Server,
  FileCode,
  Cookie,
  Link,
  Code,
  Eye,
  Monitor,
  HardDrive,
} from 'lucide-react';

/* ─── Shared types ───────────────────────────────────────────────────── */

interface Fingerprint {
  tech?: string;
  scan_fingerprint?: string;
  dom?: string;
  domains?: string;
  links?: string;
  scripts?: string;
  ssl?: string;
  asn?: string;
  cookies?: string;
}

interface Meta {
  submission_url?: string;
  script_count?: number;
  risk_score?: number;
  report_id?: string;
  domain_count?: number;
  submission?: string;
  submission_utc?: string;
  request_count?: number;
}

interface WebamonResult {
  _index: string;
  'domain.name'?: string;
  page_title?: string;
  resolved_url?: string;
  sub_domain?: string;
  tag?: string;
  meta?: Meta;
  fingerprint?: Fingerprint;
  matched_fields?: string[];
}

interface Pagination {
  from: number;
  size: number;
  returned: number;
  has_more: boolean;
  current_page: number;
  total_pages: number;
  next_from: number | null;
  prev_from: number | null;
}

interface WebamonSearchResponse {
  search_string: string;
  total_hits: number;
  results: WebamonResult[];
  pagination: Pagination;
}

/* ─── Search tab components ──────────────────────────────────────────── */

const FINGERPRINT_FIELDS: Array<{ key: keyof Fingerprint; label: string }> = [
  { key: 'tech', label: 'Tech' },
  { key: 'asn', label: 'ASN' },
  { key: 'ssl', label: 'SSL' },
  { key: 'dom', label: 'DOM' },
  { key: 'scan_fingerprint', label: 'Scan' },
  { key: 'domains', label: 'Domains' },
  { key: 'links', label: 'Links' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'cookies', label: 'Cookies' },
];

function riskColor(score: number | undefined): string {
  if (score === undefined || score === null) return 'text-slate-400';
  if (score >= 10) return 'text-rose-500';
  if (score >= 7) return 'text-orange-500';
  if (score >= 4) return 'text-amber-500';
  return 'text-emerald-500';
}

function FingerprintBadge({ value }: { value: string | undefined }) {
  if (!value || value === '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945') return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-mini font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted">
      <Fingerprint size={10} />
      {value.substring(0, 12)}…
    </span>
  );
}

function ResultRow({ result }: { result: WebamonResult }) {
  const [expanded, setExpanded] = useState(false);
  const domain = result['domain.name'] ?? '';
  const risk = result.meta?.risk_score;
  const hasFingerprints =
    result.fingerprint &&
    Object.values(result.fingerprint).some(
      (v) => v && v !== '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
    );

  return (
    <div className="border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.5)] transition-colors"
      >
        <div className="flex-shrink-0 text-slate-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center text-tool">
          <div className="col-span-3 font-mono text-brand-600 dark:text-brand-400 truncate" title={domain}>
            {domain}
          </div>
          <div className="col-span-2 text-slate-700 dark:text-slate-300 truncate text-meta" title={result.page_title}>
            {result.page_title ?? '—'}
          </div>
          <div className="col-span-1 font-mono font-semibold text-center">
            {risk !== undefined ? (
              <span className={riskColor(risk)}>{risk}</span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div className="col-span-2 text-muted text-meta truncate">
            {result.tag ? (
              <span className="inline-flex items-center gap-1">
                <Tag size={10} />
                {result.tag}
              </span>
            ) : (
              '—'
            )}
          </div>
          <div className="col-span-2 text-right">
            {result.resolved_url ? (
              <a
                href={result.resolved_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-mini text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
              >
                <ExternalLink size={10} /> visit
              </a>
            ) : null}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
          <div className="grid grid-cols-2 gap-4 text-tool mt-3">
            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Shield size={13} /> Meta
              </h4>
              <div className="space-y-1.5">
                {result.meta?.report_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Report ID</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 truncate ml-2">
                      {result.meta.report_id}
                    </span>
                  </div>
                )}
                {result.meta?.submission_url && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Submission</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 truncate ml-2">
                      {result.meta.submission_url}
                    </span>
                  </div>
                )}
                {result.meta?.submission_utc && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Submitted</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.submission_utc}
                    </span>
                  </div>
                )}
                {result.meta?.script_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scripts</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.script_count}
                    </span>
                  </div>
                )}
                {result.meta?.domain_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Domains</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.domain_count}
                    </span>
                  </div>
                )}
                {result.meta?.request_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Requests</span>
                    <span className="font-mono text-mini text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.request_count}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Fingerprint size={13} /> Fingerprints
              </h4>
              {hasFingerprints ? (
                <div className="flex flex-wrap gap-1.5">
                  {FINGERPRINT_FIELDS.map(({ key, label }) => (
                    <div key={key} title={label}>
                      <FingerprintBadge value={result.fingerprint?.[key]} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-meta">No unique fingerprints</p>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))] flex items-center gap-3 text-mini text-slate-400 font-mono">
            <span>Index: {result._index}</span>
            {result.sub_domain && <span>Subdomain: {result.sub_domain}</span>}
            {result.matched_fields && result.matched_fields.length > 0 && (
              <span>Matched: {result.matched_fields.join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SEARCH_EXAMPLES = [
  'risk_score:>5',
  'fingerprint.tech:*',
  'tag:nrd_202606*',
  'domain.name:example.com',
  'page_title:login',
];

/* ─── Sandbox tab types ──────────────────────────────────────────────── */

interface ScanResult {
  status?: string;
  report_id?: string;
  message?: string;
  error?: string;
}

interface CertificateEntry {
  domain_name?: string;
  cipher?: string;
  protocol?: string;
  issuer?: string;
  valid_from_utc?: string;
  valid_to_utc?: string;
  sub_domain?: string;
  tld?: string;
  signedCertificateTimestampList?: unknown[];
}

interface ServerEntry {
  ip?: string;
  asn?: string;
  country?: string;
  ports?: number[];
  protocols?: string[];
}

interface CookieEntry {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

interface TechnologyEntry {
  name?: string;
  version?: string;
  category?: string;
  confidence?: number;
}

interface ResourceEntry {
  sha256?: string;
  md5?: string;
  sha1?: string;
  size?: number;
  mime?: string;
  url?: string;
}

interface MonitorEntry {
  url?: string;
  status?: string;
  last_checked?: string;
}

interface DomEntry {
  title?: string;
  description?: string;
  keywords?: string;
  html?: string;
}

interface FingerprintData {
  tech?: string;
  scan_fingerprint?: string;
  dom?: string;
  domains?: string;
  links?: string;
  scripts?: string;
  ssl?: string;
  asn?: string;
  cookies?: string;
}

interface MetaData {
  submission_url?: string;
  script_count?: number;
  risk_score?: number;
  report_id?: string;
  domain_count?: number;
  submission?: string;
  submission_utc?: string;
  request_count?: number;
  completion_utc?: string;
}

interface ReportResult {
  _index?: string;
  'domain.name'?: string;
  domain_name?: string;
  page_title?: string;
  resolved_url?: string;
  sub_domain?: string;
  tag?: string;
  meta?: MetaData;
  certificate?: CertificateEntry[];
  server?: ServerEntry[];
  cookie?: CookieEntry[];
  technology?: TechnologyEntry[];
  resource?: ResourceEntry[];
  page_links?: string[];
  page_scripts?: string[];
  fingerprint?: FingerprintData;
  monitor?: MonitorEntry[];
  dom?: DomEntry;
  scan_status?: string;
  scan_time?: string;
  submission_url?: string;
  submission_utc?: string;
  completion_utc?: string;
  errors?: string[];
  feed?: string;
  engine_id?: string;
  resolved_domain?: string;
  resolved_sub_domain?: string;
  resolved_tld?: string;
  save_resources?: unknown[];
  source?: string;
  tld?: string;
  date?: string;
  matched_fields?: string[];
}

interface WebamonReportResponse {
  search_string: string;
  total_hits: number;
  results: ReportResult[];
  pagination: {
    from: number;
    size: number;
    returned: number;
    has_more: boolean;
    current_page: number;
    total_pages: number;
    next_from: number | null;
    prev_from: number | null;
  };
}

type ReportData = WebamonReportResponse;

/* ─── Infrastructure tab types ───────────────────────────────────────── */

interface EntityResult {
  domain?: Record<string, unknown>;
  server?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  error?: string;
}

function JsonBlock({ data, label }: { data: Record<string, unknown>; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.5)] transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronRight size={14} className="text-slate-400" />
        )}
        <span className="font-mono text-tool font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-mini text-slate-400 font-mono">{Object.keys(data).length} fields</span>
      </button>
      {open && (
        <pre className="text-mini font-mono text-muted bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)] p-4 overflow-x-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ─── Tabs ───────────────────────────────────────────────────────────── */

type Tab = 'search' | 'sandbox' | 'infra';

const TABS: { key: Tab; label: string; icon: typeof Globe }[] = [
  { key: 'search', label: 'Search', icon: Search },
  { key: 'sandbox', label: 'Sandbox', icon: Send },
  { key: 'infra', label: 'Infrastructure', icon: Globe },
];

/* ─── Tab: Search ──────────────────────────────────────────────────── */

function SearchTab() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<WebamonSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => () => abortRef.current?.abort(), []);

  const doSearch = useCallback(async (q: string, from: number) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const myId = ++reqIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    if (from === 0) setData(null);
    try {
      const params = new URLSearchParams({
        search: trimmed,
        size: String(PAGE_SIZE),
        from: String(from),
        results: 'domain.name,page_title,meta.risk_score,fingerprint.tech,fingerprint.asn,resolved_url,tag,sub_domain',
      });
      const res = await fetch(`/api/v1/webamon/search?${params}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as WebamonSearchResponse;
      if (myId !== reqIdRef.current) return;
      setData(json);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (myId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const pagination = data?.pagination;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSearch(query, 0);
        }}
        className="mb-6"
      >
        <div className="relative max-w-3xl">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lucene query — e.g. domain.name:example.com, risk_score:>5, tag:nrd_202606*"
            aria-label="Webamon search query"
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                doSearch(ex, 0);
              }}
              className="px-2.5 py-1 rounded text-mini font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {loading && (
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Querying Webamon index of 750M+ domains…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 font-mono">
          {error}
        </div>
      )}

      {data && (
        <div>
          <div className="flex items-center justify-between mb-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
            <span>
              {data.total_hits.toLocaleString()} result{data.total_hits !== 1 ? 's' : ''}
              {data.search_string ? <span className="text-slate-400"> for &quot;{data.search_string}&quot;</span> : ''}
            </span>
            {pagination && data.total_hits > PAGE_SIZE && (
              <span>
                Page {pagination.current_page} of {pagination.total_pages}
              </span>
            )}
          </div>
          <div className="hidden sm:grid grid-cols-12 gap-3 px-7 py-2 text-mini font-semibold text-slate-400 uppercase tracking-wider font-mono">
            <div className="col-span-3">Domain</div>
            <div className="col-span-2">Page Title</div>
            <div className="col-span-1 text-center">Risk</div>
            <div className="col-span-2">Tag</div>
            <div className="col-span-2 text-right">Link</div>
          </div>
          <div className="space-y-2">
            {data.results.map((r, i) => (
              <ResultRow key={`${r['domain.name'] ?? ''}-${r.meta?.report_id ?? i}`} result={r} />
            ))}
          </div>
          {pagination && data.total_hits > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                disabled={pagination.prev_from === null}
                onClick={() => doSearch(query, pagination.prev_from ?? 0)}
                className="px-4 py-2 rounded-xl text-sm font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted disabled:opacity-30 hover:border-brand-500/40 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-sm font-mono text-slate-500">
                {pagination.current_page} / {pagination.total_pages}
              </span>
              <button
                type="button"
                disabled={pagination.next_from === null}
                onClick={() => doSearch(query, pagination.next_from ?? 0)}
                className="px-4 py-2 rounded-xl text-sm font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted disabled:opacity-30 hover:border-brand-500/40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Search Webamon's Domain Index</p>
          <p className="text-sm max-w-md mx-auto">Enter a Lucene query above to search across 750M+ scanned domains.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Sandbox ──────────────────────────────────────────────────── */

function SandboxTab() {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setReportId(null);
    setReportData(null);
    setScreenshotUrl(null);
    try {
      const res = await fetch('/api/v1/webamon/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submission_url: url.trim() }),
      });
      const data = (await res.json()) as ScanResult;
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      if (data.report_id) {
        setReportId(data.report_id);
        void fetchReport(data.report_id);
      }
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchReport = async (rid: string) => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/v1/webamon/report/${encodeURIComponent(rid)}`);
      if (res.ok) {
        const data = (await res.json()) as ReportData;
        setReportData(data);
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* degraded */
    } finally {
      setLoadingReport(false);
    }
  };

  const loadScreenshot = async (rid: string) => {
    setScreenshotLoading(true);
    try {
      const res = await fetch(`/api/v1/webamon/screenshot/${encodeURIComponent(rid)}`);
      if (res.ok) {
        const blob = await res.blob();
        setScreenshotUrl(URL.createObjectURL(blob));
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* degraded */
    } finally {
      setScreenshotLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-2 max-w-2xl">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com or example.com"
            aria-label="URL or domain to scan"
            className="flex-1 px-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!url.trim() || submitting}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-xl disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'Submitting…' : 'Scan'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 mb-6 text-sm text-rose-700 dark:text-rose-400 font-mono flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" /> Scan Submitted
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm font-mono">
              {result.status && (
                <div>
                  <span className="text-slate-500">Status</span>
                  <p className="text-slate-900 dark:text-slate-100">{result.status}</p>
                </div>
              )}
              {result.report_id && (
                <div>
                  <span className="text-slate-500">Report ID</span>
                  <p className="text-brand-600 dark:text-brand-400 text-meta break-all">{result.report_id}</p>
                </div>
              )}
              {result.message && (
                <div className="col-span-2">
                  <span className="text-slate-500">Message</span>
                  <p className="text-slate-900 dark:text-slate-100">{result.message}</p>
                </div>
              )}
            </div>
          </section>

          {loadingReport && (
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                <Loader2 size={14} className="animate-spin" /> Loading report…
              </div>
            </section>
          )}

          {reportData &&
            reportData.results &&
            reportData.results.length > 0 &&
            (() => {
              const r = reportData.results[0]!;
              return (
                <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6 space-y-6">
                  <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                    <FileImage size={18} className="text-brand-600 dark:text-brand-400" /> Scan Report
                  </h2>

                  {r.scan_status && (
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-3">
                      <span>Status: {r.scan_status}</span>
                      {r.scan_time && <span>Time: {r.scan_time}</span>}
                      {r.submission_utc && <span>Submitted: {r.submission_utc}</span>}
                      {r.completion_utc && <span>Completed: {r.completion_utc}</span>}
                    </div>
                  )}

                  {r.errors && r.errors.length > 0 && (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 font-mono">
                      {r.errors.map((e, i) => (
                        <div key={i}>! {e}</div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Certificates */}
                    {r.certificate && r.certificate.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Shield size={14} /> Certificates ({r.certificate.length})
                        </h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {r.certificate.map((c, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 p-3 text-mini font-mono space-y-1"
                            >
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {c.domain_name ?? r['domain.name'] ?? '—'}
                                {c.sub_domain ? ` (${c.sub_domain})` : ''}
                              </div>
                              {c.issuer && <div className="text-slate-500 dark:text-slate-400">Issuer: {c.issuer}</div>}
                              {c.protocol && (
                                <div className="text-slate-500 dark:text-slate-400">
                                  Protocol: {c.protocol} {c.cipher ? `· ${c.cipher}` : ''}
                                </div>
                              )}
                              {c.valid_from_utc && (
                                <div className="text-slate-500 dark:text-slate-400">
                                  Valid: {c.valid_from_utc} → {c.valid_to_utc ?? '?'}
                                </div>
                              )}
                              {c.tld && <div className="text-slate-500 dark:text-slate-400">TLD: {c.tld}</div>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Servers */}
                    {r.server && r.server.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Server size={14} /> Servers ({r.server.length})
                        </h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {r.server.map((s, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 p-3 text-mini font-mono space-y-1"
                            >
                              {s.ip && <div className="font-semibold text-slate-700 dark:text-slate-300">{s.ip}</div>}
                              {s.asn && <div className="text-slate-500 dark:text-slate-400">ASN: {s.asn}</div>}
                              {s.country && (
                                <div className="text-slate-500 dark:text-slate-400">Country: {s.country}</div>
                              )}
                              {s.ports && s.ports.length > 0 && (
                                <div className="text-slate-500 dark:text-slate-400">Ports: {s.ports.join(', ')}</div>
                              )}
                              {s.protocols && s.protocols.length > 0 && (
                                <div className="text-slate-500 dark:text-slate-400">
                                  Protocols: {s.protocols.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Cookies */}
                    {r.cookie && r.cookie.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Cookie size={14} /> Cookies ({r.cookie.length})
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 overflow-hidden">
                          <table className="w-full text-micro font-mono">
                            <thead>
                              <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                                <th className="py-1 pr-2">Name</th>
                                <th className="py-1 pr-2">Domain</th>
                                <th className="py-1 pr-2">Secure</th>
                                <th className="py-1 pr-2">HttpOnly</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.cookie.map((c, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50"
                                >
                                  <td className="py-1 pr-2 text-slate-700 dark:text-slate-300 break-all">
                                    {c.name ?? '—'}
                                  </td>
                                  <td className="py-1 pr-2 text-muted break-all">{c.domain ?? '—'}</td>
                                  <td className="py-1 pr-2 text-muted">{c.secure ? 'yes' : 'no'}</td>
                                  <td className="py-1 pr-2 text-muted">{c.httpOnly ? 'yes' : 'no'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    {/* Technology */}
                    {r.technology && r.technology.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Code size={14} /> Technologies ({r.technology.length})
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {r.technology.map((t, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-mini font-mono text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]"
                            >
                              <Tag size={10} />
                              {t.name}
                              {t.version && <span className="text-slate-400">v{t.version}</span>}
                              {t.category && <span className="text-slate-400 text-micro">({t.category})</span>}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Resources */}
                    {r.resource && r.resource.length > 0 && (
                      <section className="lg:col-span-2">
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <HardDrive size={14} /> Resources ({r.resource.length})
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
                          <table className="w-full text-micro font-mono">
                            <thead>
                              <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                                <th className="py-1 pr-3">SHA256</th>
                                <th className="py-1 pr-3">MIME</th>
                                <th className="py-1 pr-3">Size</th>
                                <th className="py-1 pr-3">URL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.resource.map((res, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50"
                                >
                                  <td className="py-1 pr-3 text-slate-700 dark:text-slate-300 break-all">
                                    {res.sha256 ? res.sha256.slice(0, 16) + '…' : '—'}
                                  </td>
                                  <td className="py-1 pr-3 text-muted">{res.mime ?? '—'}</td>
                                  <td className="py-1 pr-3 text-muted">
                                    {res.size ? `${(res.size / 1024).toFixed(1)}KB` : '—'}
                                  </td>
                                  <td className="py-1 pr-3 text-muted break-all max-w-[200px] truncate">
                                    {res.url ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    {/* Page Links */}
                    {r.page_links && r.page_links.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Link size={14} /> Links ({r.page_links.length})
                        </h3>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {r.page_links.map((l, i) => (
                            <div key={i} className="text-mini font-mono text-muted break-all">
                              {l}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Page Scripts */}
                    {r.page_scripts && r.page_scripts.length > 0 && (
                      <section>
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <FileCode size={14} /> Scripts ({r.page_scripts.length})
                        </h3>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {r.page_scripts.map((s, i) => (
                            <div key={i} className="text-mini font-mono text-muted break-all">
                              {s}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Monitor */}
                    {r.monitor && r.monitor.length > 0 && (
                      <section className="lg:col-span-2">
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Monitor size={14} /> Monitoring
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 p-3 text-mini font-mono space-y-1">
                          {r.monitor.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-muted">
                              <span className="truncate">{m.url ?? '—'}</span>
                              {m.status && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))]">
                                  {m.status}
                                </span>
                              )}
                              {m.last_checked && <span className="text-slate-400">{m.last_checked}</span>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* DOM */}
                    {r.dom && (
                      <section className="lg:col-span-2">
                        <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Eye size={14} /> DOM
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
                          {r.dom.title && (
                            <div className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                              Title: {r.dom.title}
                            </div>
                          )}
                          {r.dom.description && (
                            <div className="px-3 py-2 text-mini text-muted border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                              Description: {r.dom.description}
                            </div>
                          )}
                          {r.dom.keywords && (
                            <div className="px-3 py-2 text-mini text-muted border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                              Keywords: {r.dom.keywords}
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Fingerprint */}
                    {r.fingerprint &&
                      Object.values(r.fingerprint).some(
                        (v) => v && v !== '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
                      ) && (
                        <section className="lg:col-span-2">
                          <h3 className="font-display font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <Fingerprint size={14} /> Fingerprint Data
                          </h3>
                          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 p-3 text-micro font-mono overflow-x-auto">
                            <pre>{JSON.stringify(r.fingerprint, null, 2)}</pre>
                          </div>
                        </section>
                      )}
                  </div>

                  {!reportData.results[0]?.certificate &&
                    !reportData.results[0]?.server &&
                    !reportData.results[0]?.cookie &&
                    !reportData.results[0]?.technology &&
                    !reportData.results[0]?.resource &&
                    !reportData.results[0]?.page_links &&
                    !reportData.results[0]?.page_scripts &&
                    !reportData.results[0]?.fingerprint &&
                    !reportData.results[0]?.monitor &&
                    !reportData.results[0]?.dom && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 font-mono">
                        No structured data available in this scan report.
                      </div>
                    )}
                </section>
              );
            })()}

          {reportId && !screenshotUrl && !screenshotLoading && (
            <button
              onClick={() => loadScreenshot(reportId)}
              className="px-4 py-2 rounded-xl text-sm font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 transition-colors inline-flex items-center gap-2"
            >
              <FileImage size={14} /> Load Screenshot
            </button>
          )}

          {screenshotLoading && (
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                <Loader2 size={14} className="animate-spin" /> Loading screenshot…
              </div>
            </section>
          )}

          {screenshotUrl && (
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
              <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <FileImage size={18} className="text-brand-600 dark:text-brand-400" /> Screenshot
              </h2>
              <img
                src={screenshotUrl}
                alt="Webamon scan screenshot"
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] w-full max-w-3xl"
              />
            </section>
          )}
        </div>
      )}

      {!result && !error && (
        <div className="text-center py-16 text-slate-400">
          <Send size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Submit a URL for Sandbox Analysis</p>
          <p className="text-sm max-w-md mx-auto">Enter a URL above to scan it through Webamon's sandbox.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Infrastructure ───────────────────────────────────────────── */

function InfraTab() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'domain' | 'server' | 'resource'>('domain');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EntityResult | null>(null);

  const doLookup = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const endpoint =
        mode === 'domain'
          ? `/api/v1/webamon/domain/${encodeURIComponent(q)}`
          : mode === 'server'
            ? `/api/v1/webamon/server/${encodeURIComponent(q)}`
            : `/api/v1/webamon/resource/${encodeURIComponent(q)}`;
      const res = await fetch(endpoint);
      const body = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(body);
      } catch (_catchErr) {
        console.error('InfraTab failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        throw new Error(body.substring(0, 200) || `HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`);
      setData({ [mode]: json });
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const MODES = [
    { key: 'domain' as const, label: 'Domain', icon: Globe, placeholder: 'example.com' },
    { key: 'server' as const, label: 'Server', icon: Server, placeholder: 'IP address' },
    { key: 'resource' as const, label: 'Resource', icon: FileCode, placeholder: 'SHA256 hash' },
  ];
  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <div>
      <form onSubmit={doLookup} className="mb-6">
        <div className="flex gap-2 max-w-3xl">
          <div className="flex rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`px-3 py-2.5 text-meta font-mono flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-brand-600 dark:bg-brand-500 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
                  }`}
                >
                  <Icon size={13} /> {m.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeMode.placeholder}
            aria-label={`Webamon ${activeMode.label} lookup`}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-xl bg-brand-600 dark:bg-brand-500 text-white text-tool font-mono font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Search size={14} /> Lookup
          </button>
        </div>
      </form>

      {loading && (
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Resolving {activeMode.label.toLowerCase()} infrastructure…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 font-mono">
          {error}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Globe size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-mono text-sm">
            Look up infrastructure for a {activeMode.label.toLowerCase()} — resolved hosts, certificates, and related
            entities.
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-3 max-w-3xl">
          {data[mode] ? (
            <JsonBlock data={data[mode] as Record<string, unknown>} label={`${activeMode.label}: ${query}`} />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-3 text-sm text-slate-500 font-mono">
              No infrastructure data returned.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main merged page ──────────────────────────────────────────────── */

export default function Webamon(): JSX.Element {
  const [tab, setTab] = useState<Tab>('search');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Webamon
        </h1>
        <p className="text-muted max-w-3xl">
          Webamon threat intelligence platform — search 750M+ domains, submit URLs for sandbox analysis, and explore
          infrastructure relationships. Data sourced from{' '}
          <a
            href="https://webamon.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Webamon
          </a>
          .
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-tool font-mono font-semibold border-b-2 transition-colors ${
                active
                  ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'search' && <SearchTab />}
      {tab === 'sandbox' && <SandboxTab />}
      {tab === 'infra' && <InfraTab />}
    </div>
  );
}
