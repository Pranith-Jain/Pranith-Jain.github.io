import { useReducer, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';

type ToolKey = 'domain_lookup' | 'exposure' | 'web_scan' | 'takeover' | 'cert_search' | 'breach';

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
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DOMAIN':
      return { ...state, domain: action.domain };
    case 'SET_LOADING':
      return { ...state, [action.tool]: { loading: true, data: null, error: null }, complete: false };
    case 'SET_RESULT': {
      const next = { ...state, [action.tool]: { loading: false, data: action.data, error: null } };
      const allDone = (Object.keys(INITIAL) as ToolKey[]).every((k) => !next[k]?.loading);
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
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${r.status}`);
    }
    return r.json();
  });
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-rose-600 dark:text-rose-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-sky-600 dark:text-sky-400',
  info: 'text-slate-500 dark:text-slate-500',
};

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
    buildUrl: (d) => `/api/v1/cert-search?q=${encodeURIComponent(d)}`,
  },
  {
    key: 'breach',
    label: 'Breach Check',
    icon: AlertTriangle,
    buildUrl: (d) => `/api/v1/breach/domain?domain=${encodeURIComponent(d)}`,
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
        const subs = data.subdomains as number | undefined;
        return subs !== undefined ? `${subs} subdomains` : 'done';
      }
      case 'web_scan': {
        const issues = data.issues as Array<{ label: string; severity: string }> | undefined;
        return issues ? `${issues.length} issues` : 'done';
      }
      case 'takeover': {
        const vuln = data.vulnerable as boolean | undefined;
        const svcs = data.services as string[] | undefined;
        return vuln ? `⚠ ${(svcs ?? []).join(', ')}` : 'safe';
      }
      case 'cert_search': {
        const c = data.count as number | undefined;
        return c !== undefined ? `${c} certs` : 'done';
      }
      case 'breach': {
        const f = data.found as boolean | undefined;
        const bc = data.breach_count as number | undefined;
        return f && bc !== undefined ? `${bc} breaches` : 'none found';
      }
      default:
        return 'done';
    }
  })();

  const detail = (() => {
    if (state.loading) return null;
    if (state.error)
      return <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 mt-1">{state.error}</p>;
    if (!data) return null;
    switch (tool.key) {
      case 'domain_lookup': {
        const dmarc = (data.email_auth as { dmarc?: { policy: string } } | undefined)?.dmarc?.policy;
        return (
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-0.5 mt-1">
            <span>
              SPF:{' '}
              <span className="text-slate-900 dark:text-slate-100">
                {(data as Record<string, unknown>).spf_present ? '✅' : '❌'}
              </span>
            </span>
            <br />
            <span>
              DMARC: <span className="text-slate-900 dark:text-slate-100">{dmarc ? dmarc.toUpperCase() : '❌'}</span>
            </span>
          </div>
        );
      }
      case 'exposure': {
        const s = (data.subdomains as number) ?? 0;
        return (
          <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-1">
            {s} subdomain{s !== 1 ? 's' : ''} discovered
          </p>
        );
      }
      case 'web_scan': {
        const issues = data.issues as Array<{ label: string; severity: string }> | undefined;
        if (!issues || issues.length === 0)
          return <p className="text-[11px] font-mono text-emerald-600 mt-1">No issues</p>;
        return (
          <ul className="text-[11px] font-mono mt-1 space-y-0.5">
            {issues.slice(0, 3).map((i, idx) => (
              <li key={idx} className="truncate">
                <span className={SEVERITY_COLORS[i.severity] ?? 'text-slate-600 dark:text-slate-400'}>●</span> {i.label}
              </li>
            ))}
          </ul>
        );
      }
      case 'takeover': {
        const vuln = data.vulnerable as boolean | undefined;
        const svcs = data.services as string[] | undefined;
        return (
          <p className="text-[11px] font-mono mt-1">
            {vuln ? (
              <span className="text-rose-600">Vulnerable{(svcs?.length ?? 0) > 0 ? ` (${svcs?.join(', ')})` : ''}</span>
            ) : (
              <span className="text-emerald-600">No vulnerable services</span>
            )}
          </p>
        );
      }
      case 'cert_search': {
        const names = data.names as string[] | undefined;
        const c = data.count as number | undefined;
        return (
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-1">
            <span>{c ?? names?.length ?? 0} certificates</span>
            {names && names.length > 0 && (
              <p className="truncate text-slate-500 dark:text-slate-500">
                {names.slice(0, 3).join(', ')}
                {names.length > 3 ? '…' : ''}
              </p>
            )}
          </div>
        );
      }
      case 'breach': {
        const f = data.found as boolean | undefined;
        const bc = data.breach_count as number | undefined;
        return (
          <p className="text-[11px] font-mono mt-1">
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
    <div className={`border ${borderCls} bg-white dark:bg-slate-900 p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-900 dark:text-slate-100 font-mono truncate">
            {tool.label}
          </h3>
        </div>
        {state.loading && <Loader2 size={12} className="animate-spin text-slate-500 dark:text-slate-500 shrink-0" />}
        {!state.loading && !!state.data && !state.error && (
          <Link
            to={`/dfir/${tool.key === 'domain_lookup' ? 'domain' : tool.key === 'web_scan' ? 'web-scan' : tool.key === 'cert_search' ? 'cert-search' : tool.key === 'breach' ? 'breach' : tool.key}?domain=${encodeURIComponent(domain)}`}
            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline shrink-0 inline-flex items-center gap-0.5"
          >
            full <ExternalLink size={9} />
          </Link>
        )}
      </div>
      <p
        className={`text-[13px] font-mono font-semibold ${state.error ? 'text-rose-600' : state.data ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500'}`}
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
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div>
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> Full Spectrum Investigation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
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
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
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
