import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  AlertOctagon,
  ArrowLeft,
  Bug,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  Package,
  Search,
  Shield,
  ShieldOff,
} from 'lucide-react';

interface Advisory {
  id: string;
  summary: string;
  modified: string;
  published?: string;
  withdrawn?: boolean;
}

interface VerdictResult {
  ref: string;
  purl: string;
  verdict: 'clean' | 'malicious' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  ids: string[];
  package_ecosystem: string;
  package_name: string;
  registry_url: string;
  advisories: Advisory[];
}

interface VerdictResponse {
  schema_version: string;
  command: string;
  data: VerdictResult;
  timestamp: string;
}

interface OssfPackage {
  name: string;
  ecosystem: string;
  ossf_url: string;
}

interface OssfResponse {
  ecosystem: string;
  total: number;
  packages: OssfPackage[];
  source: string;
  source_url: string;
  generated_at: string;
  stale?: boolean;
}

const ECOSYSTEMS = [
  { id: 'npm', label: 'npm', icon: '📦' },
  { id: 'pypi', label: 'PyPI', icon: '🐍' },
  { id: 'go', label: 'Go', icon: '🔵' },
  { id: 'maven', label: 'Maven', icon: '☕' },
  { id: 'rubygems', label: 'RubyGems', icon: '💎' },
  { id: 'crates.io', label: 'crates.io', icon: '🦀' },
];

const VERDICT_META: Record<string, { icon: typeof Shield; color: string; bg: string; label: string }> = {
  malicious: {
    icon: ShieldOff,
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'border-rose-500/30 bg-rose-500/10',
    label: 'MALICIOUS',
  },
  clean: {
    icon: CheckCircle,
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'border-emerald-500/30 bg-emerald-500/10',
    label: 'CLEAN',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-muted',
    bg: 'border-slate-500/30 bg-slate-500/10',
    label: 'UNKNOWN',
  },
};

export default function SupplyChainIntelligence(): JSX.Element {
  const [query, setQuery] = useState('');
  const [verdictEco, setVerdictEco] = useState('npm');
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  const [ossfEco, setOssfEco] = useState('npm');
  const [ossfData, setOssfData] = useState<OssfResponse | null>(null);
  const [ossfLoading, setOssfLoading] = useState(true);
  const [ossfError, setOssfError] = useState<string | null>(null);
  const [ossfSearch, setOssfSearch] = useState('');

  // Fetch OSSF packages
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setOssfLoading(true);
    setOssfError(null);
    fetch(`/api/v1/malicious-packages?ecosystem=${ossfEco}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as OssfResponse | { error: string };
        if (cancelled) return;
        if (!r.ok || 'error' in body) {
          setOssfError('error' in body ? body.error : `HTTP ${r.status}`);
        } else {
          setOssfData(body);
        }
      })
      .catch((e) => !cancelled && (e as { name?: string }).name !== 'AbortError' && setOssfError((e as Error).message))
      .finally(() => !cancelled && setOssfLoading(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ossfEco]);

  const filteredOssf = useMemo(() => {
    if (!ossfData) return [];
    if (!ossfSearch.trim()) return ossfData.packages;
    const q = ossfSearch.trim().toLowerCase();
    return ossfData.packages.filter((p) => p.name.toLowerCase().includes(q));
  }, [ossfData, ossfSearch]);

  // Package verdict check
  const checkVerdict = async () => {
    if (!query.trim()) return;
    setVerdictLoading(true);
    setVerdictError(null);
    setVerdict(null);
    try {
      const params = new URLSearchParams({ ecosystem: verdictEco, package: query.trim() });
      const res = await fetch(`/api/v1/package-verdict?${params}`);
      const body = (await res.json()) as VerdictResponse | { error: string };
      if (!res.ok || 'error' in body) {
        setVerdictError('error' in body ? body.error : `HTTP ${res.status}`);
      } else {
        setVerdict(body.data);
      }
    } catch (e) {
      setVerdictError((e as Error).message);
    } finally {
      setVerdictLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!ossfData) return { total: 0, ecosystems: ECOSYSTEMS.length };
    return { total: ossfData.total, ecosystems: ECOSYSTEMS.length };
  }, [ossfData]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex items-center gap-3 mb-1">
        <Shield className="w-7 h-7 text-emerald-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Supply Chain Intelligence</h1>
      </div>
      <p className="text-muted mb-6 text-sm max-w-3xl leading-relaxed">
        Malicious package & supply-chain intelligence — powered by{' '}
        <a
          href="https://github.com/ossf/malicious-packages"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          OpenSSF
        </a>
        ,{' '}
        <a
          href="https://osv.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          OSV
        </a>
        , and{' '}
        <a
          href="https://github.com/projectdiscovery/depx"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          depx
        </a>
        . Check if a package is known-malicious, browse the OSSF directory, or scan GitHub repos.
      </p>

      {/* ── Package Verdict Checker ────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-brand-500" /> Package Verdict Checker
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Check if a specific package is known-malicious. Enter a package name or use{' '}
          <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-mono">ecosystem:package</code>{' '}
          format.
        </p>
        <div className="flex gap-2 mb-4">
          <select
            value={verdictEco}
            onChange={(e) => setVerdictEco(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
          >
            {ECOSYSTEMS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.icon} {e.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="e.g. lodash, colors, ua-parser-js…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkVerdict()}
            className="flex-1 px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 font-mono"
          />
          <button
            onClick={checkVerdict}
            disabled={!query.trim() || verdictLoading}
            className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 text-sm flex items-center gap-2"
          >
            {verdictLoading ? <span className="animate-spin">⏳</span> : <Shield className="w-4 h-4" />}
            Check
          </button>
        </div>

        {verdictError && (
          <div
            role="alert"
            className="font-mono text-rose-600 dark:text-rose-400 text-sm p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20"
          >
            {verdictError}
          </div>
        )}

        {verdict && (
          <div
            className={`rounded-xl border p-4 ${
              verdict.verdict === 'malicious'
                ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/10'
                : verdict.verdict === 'clean'
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-800/30'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              {(() => {
                const meta = VERDICT_META[verdict.verdict];
                const Icon = meta.icon;
                return <Icon className={`w-6 h-6 ${meta.color}`} />;
              })()}
              <div>
                <div className={`text-lg font-bold font-mono ${VERDICT_META[verdict.verdict].color}`}>
                  {VERDICT_META[verdict.verdict].label}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {verdict.ref} · confidence: {verdict.confidence}
                </div>
              </div>
              {verdict.registry_url && (
                <a
                  href={verdict.registry_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  View on registry <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {verdict.ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {verdict.ids.map((id) => (
                  <a
                    key={id}
                    href={`https://github.com/ossf/malicious-packages/blob/main/osv/${verdict.package_ecosystem}/${verdict.package_name}/${id}.json`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 text-micro font-mono rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:underline"
                  >
                    {id}
                  </a>
                ))}
              </div>
            )}
            {verdict.advisories.length > 0 && (
              <div className="mt-3 space-y-1">
                {verdict.advisories.slice(0, 5).map((a) => (
                  <div key={a.id} className="text-xs text-muted flex items-center gap-2">
                    <span className="font-mono text-slate-400">{a.id}</span>
                    <span className="truncate">{a.summary}</span>
                    {a.withdrawn && <span className="text-amber-500">(withdrawn)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── OSSF Malicious Packages Directory ──────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bug className="w-5 h-5 text-rose-500" /> OSSF Malicious Packages
            {ossfData?.stale && <span className="text-xs font-mono text-amber-500">(stale)</span>}
          </h2>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{stats.total} packages</span>
        </div>

        {/* Ecosystem tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ECOSYSTEMS.map((e) => (
            <button
              key={e.id}
              onClick={() => setOssfEco(e.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                ossfEco === e.id
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-400'
              }`}
            >
              {e.icon} {e.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Filter packages…"
            value={ossfSearch}
            onChange={(e) => setOssfSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 font-mono"
          />
        </div>

        {ossfLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 font-mono text-sm">
            <span className="animate-spin mr-2">⏳</span> Loading {ossfEco} packages…
          </div>
        ) : ossfError ? (
          <div
            role="alert"
            className="font-mono text-rose-600 dark:text-rose-400 text-sm p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20"
          >
            {ossfError}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredOssf.slice(0, 100).map((p) => (
              <a
                key={p.name}
                href={p.ossf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-800/30 text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/50 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition truncate"
                title={p.name}
              >
                {p.name}
              </a>
            ))}
            {filteredOssf.length > 100 && (
              <div className="col-span-full text-center py-2 text-xs text-slate-500 font-mono">
                Showing 100 of {filteredOssf.length} — use search to filter
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>
            Source:{' '}
            <a
              href="https://github.com/ossf/malicious-packages"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              ossf/malicious-packages
            </a>
          </span>
          {ossfData && <span>updated {new Date(ossfData.generated_at).toLocaleString()}</span>}
        </div>
      </section>

      {/* ── Quick Links ────────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href="/threatintel/malicious-packages"
          className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-4 hover:shadow-md transition text-center"
        >
          <Package className="w-6 h-6 text-brand-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Malicious Packages</div>
          <div className="text-xs text-slate-500">Full OSSF directory browser</div>
        </a>
        <a
          href="/threatintel/external/supply"
          className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-4 hover:shadow-md transition text-center"
        >
          <AlertOctagon className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Supply Chain Attacks</div>
          <div className="text-xs text-slate-500">Incident catalog from supplychainattack.org</div>
        </a>
        <a
          href="https://osv.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-4 hover:shadow-md transition text-center"
        >
          <Shield className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">OSV.dev</div>
          <div className="text-xs text-slate-500">Open Source Vulnerabilities database</div>
        </a>
      </div>
    </div>
  );
}
