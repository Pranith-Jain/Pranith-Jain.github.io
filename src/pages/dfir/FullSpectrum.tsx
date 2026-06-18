import { useReducer, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { SEVERITY_BAR, type Severity } from '../../components/severity';
import {
  ArrowLeft,
  Search,
  Shield,
  Globe,
  AlertTriangle,
  FileSearch,
  Scan,
  Siren,
  ExternalLink,
  Loader2,
  Monitor,
} from 'lucide-react';

type ToolKey = 'domain_lookup' | 'exposure' | 'web_scan' | 'takeover' | 'cert_search' | 'breach' | 'webamon';

interface ToolResult {
  loading: boolean;
  data: unknown;
  error: string | null;
}

type State = Record<ToolKey, ToolResult> & { domain: string; complete: boolean };

type Action =
  | { type: 'SET_LOADING'; tool: ToolKey }
  | { type: 'SET_RESULT'; tool: ToolKey; data: unknown }
  | { type: 'SET_ERROR'; tool: ToolKey; error: string }
  | { type: 'SET_DOMAIN'; domain: string }
  | { type: 'RESET' };

const INITIAL_TOOL: ToolResult = { loading: false, data: null, error: null };

const INITIAL: State = {
  domain: '',
  complete: false,
  domain_lookup: { ...INITIAL_TOOL },
  exposure: { ...INITIAL_TOOL },
  web_scan: { ...INITIAL_TOOL },
  takeover: { ...INITIAL_TOOL },
  cert_search: { ...INITIAL_TOOL },
  breach: { ...INITIAL_TOOL },
  webamon: { ...INITIAL_TOOL },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DOMAIN':
      return { ...state, domain: action.domain };
    case 'SET_LOADING':
      return { ...state, [action.tool]: { loading: true, data: null, error: null }, complete: false };
    case 'SET_RESULT': {
      const next = { ...state, [action.tool]: { loading: false, data: action.data, error: null } };
      // Only check tool keys — `Object.keys(INITIAL)` includes `domain` (a
      // string) and `complete` (a boolean), both of which return `undefined`
      // for `?.loading`, satisfying `every(!loading)` after the very first
      // tool reports — flipping `complete: true` long before the others
      // finish. Enumerate from TOOL_CONFIG instead.
      const allDone = TOOL_CONFIG.every((t) => !next[t.key]?.loading);
      if (allDone) next.complete = true;
      return next;
    }
    case 'SET_ERROR':
      return { ...state, [action.tool]: { loading: false, data: null, error: action.error } };
    case 'RESET':
      return { ...INITIAL };
    default:
      return state;
  }
}

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

function fetchTool(url: string): Promise<unknown> {
  return fetch(url).then(async (r) => {
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      let msg = `HTTP ${r.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: string };
        msg = parsed.error ?? msg;
      } catch {
        /* use default msg */
      }
      throw new Error(msg);
    }
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('json')) {
      const text = await r.text().catch(() => '');
      throw new Error(`Server returned non-JSON: ${text.slice(0, 100)}`);
    }
    return r.json();
  });
}

function normalizeSeverity(raw: string | undefined): Severity {
  switch ((raw ?? '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'info':
    case 'informational':
      return 'info';
    case 'low':
    default:
      return 'low';
  }
}

const TOOL_CONFIG: Array<{ key: ToolKey; label: string; icon: typeof Shield; buildUrl: (d: string) => string }> = [
  {
    key: 'domain_lookup',
    label: 'Domain Lookup',
    icon: Globe,
    buildUrl: (d) => `/api/v1/domain/lookup?domain=${encodeURIComponent(d)}`,
  },
  {
    key: 'exposure',
    label: 'Exposure Scan',
    icon: Scan,
    buildUrl: (d) => `/api/v1/exposure/scan?domain=${encodeURIComponent(d)}`,
  },
  {
    key: 'web_scan',
    label: 'Web Scan',
    icon: Shield,
    buildUrl: (d) => `/api/v1/web-scan?url=${encodeURIComponent(`https://${d}`)}`,
  },
  {
    key: 'takeover',
    label: 'Takeover Check',
    icon: Siren,
    buildUrl: (d) => `/api/v1/takeover/check?domain=${encodeURIComponent(d)}`,
  },
  {
    key: 'cert_search',
    label: 'Cert Search',
    icon: FileSearch,
    buildUrl: (d) => `/api/v1/cert-search?domain=${encodeURIComponent(d)}`,
  },
  {
    key: 'breach',
    label: 'Breach Check',
    icon: AlertTriangle,
    buildUrl: (d) => `/api/v1/breach/domain?domain=${encodeURIComponent(d)}`,
  },
  {
    key: 'webamon',
    label: 'Webamon Intel',
    icon: Monitor,
    buildUrl: (d) => `/api/v1/webamon/search?search=${encodeURIComponent(`domain.name:${d}`)}&size=3`,
  },
];

function ResultCard({
  tool,
  state,
  domain,
}: {
  tool: (typeof TOOL_CONFIG)[number];
  state: ToolResult;
  domain: string;
}) {
  const Icon = tool.icon;
  const data = state.data as Record<string, unknown> | null;

  const summary = ((): string => {
    if (state.loading) return 'scanning…';
    if (state.error) return 'failed';
    if (!data) return 'pending';
    switch (tool.key) {
      case 'domain_lookup': {
        const v = data.verdict as string | undefined;
        const s = data.score as number | undefined;
        return v && s !== undefined ? `${v} · ${s}/100` : 'done';
      }
      case 'exposure': {
        // ExposureScanResponse.subdomains is an array, not a number.
        const subs = data.subdomains as unknown[] | undefined;
        const total = data.total_subdomains_seen as number | undefined;
        if (subs === undefined) return 'done';
        return total !== undefined && total > subs.length
          ? `${subs.length} of ${total} subdomains`
          : `${subs.length} subdomains`;
      }
      case 'web_scan': {
        // Real WebScanResponse fields: http_protocol_findings + exposed_paths.
        // The legacy `issues` field was never populated.
        const headerFindings = (data.http_protocol_findings as unknown[] | undefined) ?? [];
        const exposed = (data.exposed_paths as unknown[] | undefined) ?? [];
        const total = headerFindings.length + exposed.length;
        return total > 0 ? `${total} finding${total === 1 ? '' : 's'}` : 'clean';
      }
      case 'takeover': {
        // TakeoverResponse: `service` is singular optional string.
        const vuln = data.vulnerable as boolean | undefined;
        const svc = data.service as string | undefined;
        return vuln ? `⚠ ${svc ?? 'vulnerable'}` : 'safe';
      }
      case 'cert_search': {
        // CertSearchResponse: `total` + `unique_names`.
        const total = data.total as number | undefined;
        const unique = data.unique_names as unknown[] | undefined;
        if (total !== undefined) return `${total} certs`;
        return unique !== undefined ? `${unique.length} certs` : 'done';
      }
      case 'breach': {
        const f = data.found as boolean | undefined;
        const bc = data.breach_count as number | undefined;
        return f && bc !== undefined ? `${bc} breaches` : 'none found';
      }
      case 'webamon': {
        const d = data as { total_hits?: number } | undefined;
        return d?.total_hits ? `${d.total_hits} scan${d.total_hits !== 1 ? 's' : ''}` : 'no recent scans';
      }
      default:
        return 'done';
    }
  })();

  const detail = (() => {
    if (state.loading) return null;
    if (state.error) return <p className="text-mini font-mono text-rose-600 dark:text-rose-400 mt-1">{state.error}</p>;
    if (!data) return null;
    switch (tool.key) {
      case 'domain_lookup': {
        // SPF / DMARC nest under `email_auth` (singular `present`, not `spf_present`).
        const auth = data.email_auth as
          | { spf?: { present: boolean }; dmarc?: { present: boolean; policy?: string } }
          | undefined;
        const spfPresent = auth?.spf?.present === true;
        const dmarcPolicy = auth?.dmarc?.policy;
        const dmarcPresent = auth?.dmarc?.present === true;
        return (
          <div className="text-mini font-mono text-muted space-y-0.5 mt-1">
            <span>
              SPF: <span className="text-slate-900 dark:text-slate-100">{spfPresent ? '✅' : '❌'}</span>
            </span>
            <br />
            <span>
              DMARC:{' '}
              <span className="text-slate-900 dark:text-slate-100">
                {dmarcPolicy ? dmarcPolicy.toUpperCase() : dmarcPresent ? '✅' : '❌'}
              </span>
            </span>
          </div>
        );
      }
      case 'exposure': {
        const subs = (data.subdomains as unknown[] | undefined) ?? [];
        const total = (data.total_subdomains_seen as number | undefined) ?? subs.length;
        return (
          <p className="text-mini font-mono text-muted mt-1">
            {subs.length} of {total} subdomain{total !== 1 ? 's' : ''} discovered
          </p>
        );
      }
      case 'web_scan': {
        const headerFindings =
          (data.http_protocol_findings as Array<{ label?: string; severity?: string }> | undefined) ?? [];
        const exposed = (data.exposed_paths as Array<{ path?: string; severity?: string }> | undefined) ?? [];
        const findings = [
          ...headerFindings.map((h) => ({ label: h.label ?? 'finding', severity: h.severity ?? 'info' })),
          ...exposed.map((p) => ({ label: p.path ?? 'exposed path', severity: p.severity ?? 'medium' })),
        ];
        if (findings.length === 0) return <p className="text-mini font-mono text-emerald-600 mt-1">No findings</p>;
        return (
          <ul className="text-mini font-mono mt-1 space-y-0.5">
            {findings.slice(0, 3).map((i, idx) => (
              <li key={idx} className="flex items-center gap-1.5 truncate">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${SEVERITY_BAR[normalizeSeverity(i.severity)]}`}
                  aria-hidden="true"
                />
                <span className="truncate">{i.label}</span>
              </li>
            ))}
          </ul>
        );
      }
      case 'takeover': {
        const vuln = data.vulnerable as boolean | undefined;
        const svc = data.service as string | undefined;
        return (
          <p className="text-mini font-mono mt-1">
            {vuln ? (
              <span className="text-rose-600">Vulnerable{svc ? ` (${svc})` : ''}</span>
            ) : (
              <span className="text-emerald-600">No vulnerable services</span>
            )}
          </p>
        );
      }
      case 'cert_search': {
        const total = data.total as number | undefined;
        const unique = data.unique_names as string[] | undefined;
        const count = total ?? unique?.length ?? 0;
        return (
          <div className="text-mini font-mono text-muted mt-1">
            <span>{count} certificates</span>
            {unique && unique.length > 0 && (
              <p className="truncate text-slate-500 dark:text-slate-400">
                {unique.slice(0, 3).join(', ')}
                {unique.length > 3 ? '…' : ''}
              </p>
            )}
          </div>
        );
      }
      case 'breach': {
        const f = data.found as boolean | undefined;
        const bc = data.breach_count as number | undefined;
        return (
          <p className="text-mini font-mono mt-1">
            {f && bc ? (
              <span className="text-rose-600">
                {bc} breach{bc !== 1 ? 'es' : ''} detected
              </span>
            ) : (
              <span className="text-emerald-600">No breaches found</span>
            )}
          </p>
        );
      }
      case 'webamon': {
        const d = data as
          | {
              total_hits?: number;
              results?: Array<{
                'domain.name'?: string;
                page_title?: string;
                meta?: { risk_score?: number };
                date?: string;
              }>;
            }
          | undefined;
        const results = d?.results ?? [];
        const first = results[0];
        return (
          <div className="text-mini font-mono mt-1 text-muted">
            {first ? (
              <span>
                Risk: <span className="text-slate-900 dark:text-slate-100">{first.meta?.risk_score ?? 'N/A'}</span>
                {first.page_title ? <> · {first.page_title}</> : ''}
              </span>
            ) : d?.total_hits ? (
              <span>{d.total_hits} scans found</span>
            ) : (
              <span className="text-slate-500">No scan data</span>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  })();

  const borderCls = state.error
    ? 'border-rose-500/50'
    : state.data
      ? 'border-slate-200 dark:border-slate-800'
      : 'border-slate-200 dark:border-slate-800/50';

  return (
    <div className={`rounded-lg border ${borderCls} bg-white dark:bg-slate-900 p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
          <h3 className="text-mini font-bold uppercase tracking-[0.15em] text-slate-900 dark:text-slate-100 font-mono truncate">
            {tool.label}
          </h3>
        </div>
        {state.loading && <Loader2 size={12} className="animate-spin text-slate-500 dark:text-slate-400 shrink-0" />}
        {!state.loading && !!state.data && !state.error && (
          <Link
            to={`/${tool.key === 'domain_lookup' ? 'dfir/domain' : tool.key === 'web_scan' ? 'dfir/web-scan' : tool.key === 'cert_search' ? 'dfir/cert-search' : tool.key === 'breach' ? 'dfir/breach' : tool.key === 'webamon' ? 'threatintel/webamon' : 'dfir/' + tool.key}?${tool.key === 'webamon' ? 'q' : 'domain'}=${encodeURIComponent(domain)}`}
            className="text-micro text-brand-600 dark:text-brand-400 hover:underline shrink-0 inline-flex items-center gap-0.5"
          >
            full <ExternalLink size={9} />
          </Link>
        )}
      </div>
      <p
        className={`text-tool font-mono font-semibold ${state.error ? 'text-rose-600' : state.data ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {summary}
      </p>
      {detail}
    </div>
  );
}

export default function FullSpectrum(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [input, setInput] = useState('');
  const valid = DOMAIN_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const domain = input.trim();

    dispatch({ type: 'SET_DOMAIN', domain });
    TOOL_CONFIG.forEach((t) => dispatch({ type: 'SET_LOADING', tool: t.key }));

    const results = await Promise.allSettled(
      TOOL_CONFIG.map((t) =>
        fetchTool(t.buildUrl(domain)).then(
          (data) => ({ key: t.key, data }) as const,
          (err: unknown) => {
            dispatch({ type: 'SET_ERROR', tool: t.key, error: (err as Error).message });
            return { key: t.key, error: true } as const;
          }
        )
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && !('error' in r.value)) {
        dispatch({ type: 'SET_RESULT', tool: r.value.key, data: r.value.data });
      }
    }
  };

  const hasResults = TOOL_CONFIG.some((t) => state[t.key].data || state[t.key].error);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> Full Spectrum Investigation
        </h1>
        <p className="text-muted mb-8 max-w-3xl">
          Fire six parallel domain-intelligence tools from one input — domain lookup, exposure scan, web vulnerability
          scan, takeover check, certificate search, and breach database check.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <label htmlFor="full-spectrum-input" className="sr-only">
            Domain to investigate
          </label>
          <input
            id="full-spectrum-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com"
            aria-label="Domain to investigate"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!valid || TOOL_CONFIG.some((t) => state[t.key].loading)}
            className="px-5 py-3 bg-brand-500 text-white font-mono font-semibold disabled:opacity-30 hover:bg-brand-700 inline-flex items-center gap-2"
          >
            {TOOL_CONFIG.some((t) => state[t.key].loading) ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            {TOOL_CONFIG.some((t) => state[t.key].loading) ? 'Scanning…' : 'Investigate'}
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">Not a valid domain.</p>
        )}
      </form>

      {hasResults && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display font-bold text-xl truncate">{state.domain}</h2>
            <div className="flex items-center gap-2 shrink-0">
              {TOOL_CONFIG.map((t) => {
                const s = state[t.key];
                const done = !!s.data;
                const err = !!s.error;
                const loading = s.loading;
                return (
                  <span
                    key={t.key}
                    className={`inline-block w-2 h-2 rounded-full ${
                      loading ? 'bg-ink-3 animate-pulse' : err ? 'bg-rose-500' : done ? 'bg-emerald-500' : 'bg-ink-3'
                    }`}
                    title={`${t.label}: ${loading ? 'loading' : err ? 'error' : done ? 'done' : 'pending'}`}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {TOOL_CONFIG.map((t) => (
          <ResultCard key={t.key} tool={t} state={state[t.key]} domain={state.domain} />
        ))}
      </div>
    </div>
  );
}
