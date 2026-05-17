import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldAlert,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  ScrollText,
  Globe2,
  Filter,
} from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';

interface CertSearchResponse {
  domain: string;
  include_subdomains: boolean;
  total: number;
  unique_names: string[];
  issuers: Array<{ name: string; count: number }>;
  recent: Array<{
    id: string;
    dns_names: string[];
    issuer: string;
    not_before?: string;
    not_after?: string;
    revoked: boolean;
  }>;
  source: string;
  source_url: string;
  generated_at: string;
}

const SAMPLES: { label: string; domain: string }[] = [
  { label: 'anthropic.com', domain: 'anthropic.com' },
  { label: 'cloudflare.com', domain: 'cloudflare.com' },
  { label: 'github.com', domain: 'github.com' },
];

export default function CertSearch(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('domain') ?? searchParams.get('q') ?? '';
  const [domain, setDomain] = useState(initial);
  const [includeSubs, setIncludeSubs] = useState(searchParams.get('include_subdomains') !== '0');
  const [data, setData] = useState<CertSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const autoFetched = useRef(false);

  const lookup = async (override?: string) => {
    const q = (override ?? domain).trim().toLowerCase();
    if (!q) return;
    if (override) setDomain(override);
    setLoading(true);
    setError(null);
    setData(null);
    setSearchParams({ domain: q, ...(includeSubs ? {} : { include_subdomains: '0' }) }, { replace: false });
    try {
      const url = `/api/v1/cert-search?domain=${encodeURIComponent(q)}&include_subdomains=${includeSubs ? '1' : '0'}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as CertSearchResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetched.current) return;
    if (initial) {
      autoFetched.current = true;
      void lookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredNames = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.unique_names;
    return data.unique_names.filter((n) => n.includes(q));
  }, [data, filter]);

  const allNamesBlob = useMemo(() => filteredNames.join('\n'), [filteredNames]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Certificate Search
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Enumerate certificates issued for a domain. Fast subdomain discovery via Certificate Transparency logs. Free,
          no key, powered by{' '}
          <a
            href="https://sslmate.com/certspotter/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            SSLMate Cert Spotter
          </a>
          . Cached 6h at the edge.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/domain" className="text-brand-600 dark:text-brand-400 hover:underline">
            Domain Inspector
          </Link>{' '}
          (zone records) and{' '}
          <Link to="/dfir/exposure" className="text-brand-600 dark:text-brand-400 hover:underline">
            Exposure Scan
          </Link>{' '}
          (open ports). CT logs are append-only; once an issuance is logged it never disappears.
        </p>
      </div>

      {/* Lookup form */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[260px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <label className="self-center text-[12px] font-mono text-slate-600 dark:text-slate-400 cursor-pointer inline-flex items-center gap-1.5">
              <input type="checkbox" checked={includeSubs} onChange={(e) => setIncludeSubs(e.target.checked)} />
              include subdomains
            </label>
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'searching…' : 'search'}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 mr-1">samples:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.domain}
              type="button"
              onClick={() => void lookup(s.domain)}
              className="text-[11px] font-mono px-3 py-2 sm:px-2 sm:py-0.5 min-h-[44px] sm:min-h-0 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {data && (
        <>
          {/* Summary */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
              Summary
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.total}</div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">total issuances</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.unique_names.length}</div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">unique DNS names</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.issuers.length}</div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">distinct issuers</div>
              </div>
            </div>
            {data.issuers.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {data.issuers.slice(0, 8).map((i, ii) => (
                  <span
                    key={`${i.name}-${ii}`}
                    className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  >
                    {i.name} · {i.count}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Unique DNS names */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2">
                <Globe2 size={12} /> Unique DNS names
                {filter && (
                  <span className="text-slate-500">
                    ({filteredNames.length} of {data.unique_names.length})
                  </span>
                )}
              </h2>
              <CopyChip value={allNamesBlob} label={`copy ${filteredNames.length}`} />
            </div>
            <div className="relative mb-3">
              <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter (e.g. api, dev, staging)"
                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              />
            </div>
            <ul className="font-mono text-[12px] text-slate-700 dark:text-slate-300 space-y-1 max-h-80 overflow-auto break-all">
              {filteredNames.map((n, ni) => (
                <li
                  key={`${n}-${ni}`}
                  className="border-b border-slate-200 dark:border-slate-800 pb-1 last:border-0 flex items-baseline gap-2"
                >
                  <span className="flex-1">{n}</span>
                  <Link
                    to={`/dfir/domain?d=${encodeURIComponent(n.replace(/^\*\./, ''))}`}
                    className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                  >
                    inspect
                  </Link>
                  <Link
                    to={`/dfir/takeover?domain=${encodeURIComponent(n.replace(/^\*\./, ''))}`}
                    className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                  >
                    takeover
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Recent issuances */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
              <ScrollText size={12} /> Recent issuances ({data.recent.length})
            </h2>
            <ul className="space-y-2">
              {data.recent.map((it, ri) => (
                <li
                  key={`${it.id ?? 'cert'}-${ri}`}
                  className={`rounded border p-2 ${
                    it.revoked
                      ? 'border-rose-500/40 bg-rose-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11px] font-mono text-violet-700 dark:text-violet-300">{it.issuer}</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                      {it.not_before?.slice(0, 10)} → {it.not_after?.slice(0, 10)}
                      {it.revoked && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40">
                          revoked
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5 break-all">
                    {it.dns_names.map((n, di) => (
                      <span key={`${n}-${di}`}>{n}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
            Source:{' '}
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline inline-flex items-center gap-1"
            >
              {data.source} <ExternalLink size={9} />
            </a>{' '}
            · resolved {new Date(data.generated_at).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}
