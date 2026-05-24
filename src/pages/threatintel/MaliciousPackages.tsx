import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Package, ExternalLink, RefreshCw, Search, ShieldAlert } from 'lucide-react';

interface PackageEntry {
  name: string;
  ecosystem: string;
  ossf_url: string;
}

interface MaliciousPackagesResponse {
  ecosystem: string;
  total: number;
  packages: PackageEntry[];
  source_url: string;
  generated_at: string;
}

const ECOSYSTEMS: Array<{ id: string; label: string }> = [
  { id: 'npm', label: 'npm (Node.js)' },
  { id: 'pypi', label: 'PyPI (Python)' },
  { id: 'rubygems', label: 'RubyGems' },
  { id: 'maven', label: 'Maven (Java)' },
  { id: 'go', label: 'Go' },
  { id: 'crates.io', label: 'crates.io (Rust)' },
];

const STORAGE_KEY = 'threatintel.malicious-packages.eco';

export default function MaliciousPackages(): JSX.Element {
  const [ecosystem, setEcosystem] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'npm';
    } catch {
      return 'npm';
    }
  });
  const [data, setData] = useState<MaliciousPackagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, ecosystem);
    } catch {
      /* localStorage unavailable */
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/v1/malicious-packages?ecosystem=${encodeURIComponent(ecosystem)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as MaliciousPackagesResponse | { error: string };
        if (cancelled) return;
        if (!r.ok || 'error' in body) {
          setError('error' in body ? body.error : `HTTP ${r.status}`);
        } else {
          setData(body);
        }
      })
      .catch((e) => !cancelled && (e as { name?: string }).name !== 'AbortError' && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ecosystem]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.packages;
    return data.packages.filter((p) => p.name.toLowerCase().includes(q));
  }, [data, query]);

  const registryLink = (pkg: PackageEntry): string => {
    switch (pkg.ecosystem) {
      case 'npm':
        return `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
      case 'pypi':
        return `https://pypi.org/project/${encodeURIComponent(pkg.name)}/`;
      case 'rubygems':
        return `https://rubygems.org/gems/${encodeURIComponent(pkg.name)}`;
      case 'crates.io':
        return `https://crates.io/crates/${encodeURIComponent(pkg.name)}`;
      default:
        return pkg.ossf_url;
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Package size={28} className="text-brand-600 dark:text-brand-400" /> Malicious-package directory
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          Cross-ecosystem malware/typosquat/dependency-confusion IOCs sourced from{' '}
          <a
            href="https://github.com/ossf/malicious-packages"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ossf/malicious-packages
          </a>{' '}
          — the OpenSSF curated mirror of OSV-format reports across npm, PyPI, RubyGems, Maven, Go, and Rust. Each name
          links to its registry detail page; click the OSSF link for the full OSV record (versions + indicators) and
          timeline.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {ECOSYSTEMS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setEcosystem(e.id);
                setQuery('');
              }}
              className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                ecosystem === e.id
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${ecosystem} package names…`}
            className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        {data && (
          <p className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
            <span className="font-bold text-slate-700 dark:text-slate-300">{filtered.length}</span>
            {data.total !== filtered.length && <> of {data.total.toLocaleString()}</>}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 mb-4 inline-flex items-start gap-2">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading && (
        <p className="text-xs font-mono text-slate-500 inline-flex items-center gap-1">
          <RefreshCw size={11} className="animate-spin" /> loading {ecosystem} listing…
        </p>
      )}

      {!loading && filtered.length === 0 && !error && data && (
        <p className="text-xs font-mono text-slate-500">
          {query ? 'No packages match the filter.' : 'Listing is empty.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mt-2">
          {filtered.slice(0, 600).map((p) => (
            <li
              key={`${p.ecosystem}:${p.name}`}
              className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 hover:border-brand-500/40 transition-colors"
            >
              <code
                className="block font-mono text-[13px] text-slate-900 dark:text-slate-100 break-all truncate"
                title={p.name}
              >
                {p.name}
              </code>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono">
                <a
                  href={registryLink(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                  title={`Open ${p.ecosystem} registry`}
                >
                  registry <ExternalLink size={9} />
                </a>
                <a
                  href={p.ossf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-0.5"
                  title="OSSF malicious-packages OSV record"
                >
                  OSSF <ExternalLink size={9} />
                </a>
                <Link
                  to={`/dfir/ioc-check?indicator=${encodeURIComponent(p.name)}`}
                  className="ml-auto text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                  title="Search platform IOC checker"
                >
                  pivot →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 600 && (
        <p className="mt-3 text-[11px] font-mono text-slate-500 text-center">
          Showing first 600 — refine the filter to narrow.
        </p>
      )}

      {data && (
        <p className="mt-6 text-[10px] font-mono text-slate-400 text-center">
          source: {data.source_url} · refreshed {new Date(data.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
