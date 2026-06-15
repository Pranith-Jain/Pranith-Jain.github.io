import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Search,
  ShieldAlert,
ExternalLink } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { SEVERITY_TONE, type Severity } from '../../components/severity';
import { sanitizeUrl } from '../../lib/sanitize-url';

/**
 * ProjectDiscovery intel — three FREE capabilities over the PD platform:
 *   • Credentials — leak/combolist exposure stats for an email or domain
 *   • Subdomains  — Chaos public-domain recon (needs a free PDCP key)
 *   • CVE catalog — CVEs that have a public Nuclei detection template
 * No paid PDCP scan credits are consumed.
 */

type Tab = 'credentials' | 'subdomains' | 'cves';

/** Map an upstream severity string onto the canonical Severity union. */
function toSeverity(raw: string): Severity {
  const s = raw.trim().toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' || s === 'info') return s;
  if (s === 'informational') return 'info';
  return 'low'; // none / unknown / unrated / empty
}

// ─── Credentials ───────────────────────────────────────────────────────────

interface LeaksResponse {
  query: string;
  kind: 'email' | 'domain';
  generated_at: string;
  data: Record<string, unknown>;
}

function firstNum(data: Record<string, unknown>, key: string, field: string): number | null {
  if (!data || typeof data !== 'object') return null;
  const arr = data[key];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const v = (arr[0] as Record<string, unknown>)?.[field];
  return typeof v === 'number' ? v : null;
}

function CredentialsTab(): JSX.Element {
  const [input, setInput] = useState('');
  const [data, setData] = useState<LeaksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim().toLowerCase();
    if (!q) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/v1/pd/leaks?q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `lookup failed (${r.status})`);
      }
      setData((await r.json()) as LeaksResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Guard against a degraded-but-200 upstream returning `data: null`/scalar —
  // accessing data.data.<field> on that would crash the page.
  const dd = (data && typeof data.data === 'object' && data.data ? data.data : {}) as Record<string, unknown>;
  const exposure = data ? firstNum(dd, 'combolist_exposure', 'combolist_exposure') : null;
  const users = data ? firstNum(dd, 'leak_user_count', 'user') : null;
  const devices = data ? firstNum(dd, 'leak_devices_count', 'devices') : null;
  const samples = (dd.user_sample_data as Array<Record<string, unknown>> | undefined) ?? [];
  const topUrls = (dd.top_used_urls_by_user as Array<{ count?: number; url?: string }> | undefined) ?? [];

  return (
    <div>
      <form onSubmit={check} className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="email (user@example.com) or domain (example.com)"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="Email or domain"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />} check exposure
        </button>
      </form>

      <DataState
        loading={loading}
        error={error}
        empty={!!data && exposure === null && users === null && samples.length === 0 && topUrls.length === 0}
        emptyLabel="No leak exposure data for this identifier."
        rows={5}
      >
        {data && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'combolist exposure', value: exposure },
                { label: 'leaked users', value: users },
                { label: 'devices', value: devices },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4"
                >
                  <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">{s.label}</div>
                  <div className="text-2xl font-display font-bold tabular-nums">
                    {s.value != null ? s.value.toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>

            {samples.length > 0 && (
              <div>
                <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">
                  sample credentials (masked by upstream)
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                        {['Username', 'Password', 'URL', 'Country', 'Date'].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-2 font-mono text-mini uppercase tracking-wider text-slate-500 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {samples.slice(0, 50).map((s, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800/70">
                          <td className="px-3 py-2 font-mono text-meta break-all">{String(s.username ?? '—')}</td>
                          <td className="px-3 py-2 font-mono text-meta text-rose-600 dark:text-rose-400">
                            {String(s.password ?? '—')}
                          </td>
                          <td className="px-3 py-2 font-mono text-mini text-slate-500 break-all max-w-xs">
                            {String(s.url ?? '—')}
                          </td>
                          <td className="px-3 py-2 font-mono text-mini text-slate-500">{String(s.country ?? '—')}</td>
                          <td className="px-3 py-2 font-mono text-mini text-slate-500 whitespace-nowrap">
                            {String(s.log_date ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {topUrls.length > 0 && (
              <div>
                <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">
                  most-targeted login URLs
                </div>
                <ul className="space-y-1">
                  {topUrls.slice(0, 10).map((u, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 font-mono text-meta rounded border border-slate-200 dark:border-slate-800 px-3 py-1.5"
                    >
                      <span className="truncate text-slate-700 dark:text-slate-300">{u.url}</span>
                      <span className="text-slate-400 shrink-0">{u.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DataState>
    </div>
  );
}

// ─── Subdomains (Chaos) ──────────────────────────────────────────────────────

interface SubdomainsResponse {
  domain: string;
  generated_at: string;
  count: number;
  truncated: boolean;
  subdomains: string[];
}

function SubdomainsTab(): JSX.Element {
  const [input, setInput] = useState('');
  const [data, setData] = useState<SubdomainsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(200);

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = input.trim().toLowerCase();
    if (!d) return;
    setLoading(true);
    setError(null);
    setData(null);
    setNotConfigured(false);
    setKeyInvalid(false);
    try {
      const r = await fetch(`/api/v1/pd/subdomains?domain=${encodeURIComponent(d)}`);
      if (r.status === 503) {
        setNotConfigured(true);
        return;
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          upstream_status?: number | null;
        };
        // Key is set but Chaos rejected it (expired / invalid / no Chaos access).
        if (j.error === 'upstream_unavailable' && (j.upstream_status === 401 || j.upstream_status === 403)) {
          setKeyInvalid(true);
          return;
        }
        throw new Error(j.detail || j.error || `scan failed (${r.status})`);
      }
      setData((await r.json()) as SubdomainsResponse);
      setVisible(200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return q ? data.subdomains.filter((s) => s.includes(q)) : data.subdomains;
  }, [data, filter]);

  const copyAll = () => {
    void navigator.clipboard.writeText(filtered.join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div>
      <form onSubmit={scan} className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="apex domain — e.g. tesla.com"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="Apex domain"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />} recon
        </button>
      </form>

      {notConfigured || keyInvalid ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <KeyRound size={18} className="shrink-0 mt-0.5" />
          <div>
            {keyInvalid ? (
              <>
                <strong className="font-semibold">Chaos API key rejected.</strong> The configured{' '}
                <code className="font-mono text-xs">PDCP_API_KEY</code> was rejected by ProjectDiscovery (HTTP 401) — it
                may be expired, malformed, or lack Chaos/recon access. The operator should set a valid key from{' '}
                <a
                  href="https://cloud.projectdiscovery.io/settings/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  cloud.projectdiscovery.io
                </a>
                . The Credentials and CVE tabs need no key and work now.
              </>
            ) : (
              <>
                <strong className="font-semibold">Subdomain recon not configured.</strong> This uses
                ProjectDiscovery&apos;s free Chaos dataset, which needs a free API key. The operator sets{' '}
                <code className="font-mono text-xs">PDCP_API_KEY</code> (from{' '}
                <a
                  href="https://cloud.projectdiscovery.io/settings/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  cloud.projectdiscovery.io
                </a>
                ). The Credentials and CVE tabs need no key and work now.
              </>
            )}
          </div>
        </div>
      ) : (
        <DataState
          loading={loading}
          error={error}
          empty={!!data && filtered.length === 0}
          emptyLabel="No subdomains in the Chaos dataset for this domain."
          rows={6}
        >
          {data && (
            <>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <p className="text-mini font-mono text-slate-500 dark:text-slate-400">
                  {data.count.toLocaleString()} subdomains for{' '}
                  <span className="text-slate-700 dark:text-slate-300">{data.domain}</span>
                  {data.truncated && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}
                      · payload capped at {data.subdomains.length.toLocaleString()}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={copyAll}
                  className="inline-flex items-center gap-1.5 text-mini font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'copied' : 'copy'}
                </button>
              </div>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="filter subdomains…"
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-xs focus:outline-none focus:border-brand-500"
                  aria-label="Filter subdomains"
                />
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filtered.slice(0, visible).map((s) => (
                  <li
                    key={s}
                    className="font-mono text-meta rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 truncate"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              {filtered.length > visible && (
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + 200)}
                  className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-800 py-2 font-mono text-meta text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Show more ({(filtered.length - visible).toLocaleString()} remaining)
                </button>
              )}
            </>
          )}
        </DataState>
      )}
    </div>
  );
}

// ─── CVE catalog ─────────────────────────────────────────────────────────────

interface PdCve {
  id: string;
  name: string;
  severity: string;
  cvss: string | null;
  description: string;
  template_url: string;
  nvd_url: string;
}
interface CvesResponse {
  generated_at: string;
  catalog_total: number;
  total_matches: number;
  truncated: boolean;
  count: number;
  items: PdCve[];
}

interface CveDetail {
  cve: string;
  summary: string | null;
  cvss: number | null;
  epss: number | null;
  epss_percentile: number | null;
  kev: boolean;
  propose_action: string | null;
  ransomware_campaign: string | null;
  published: string | null;
  cpes: string[];
  references: string[];
  ssvc: {
    exploitation: string | null;
    automatable: string | null;
    technical_impact: string | null;
    decision: string | null;
  } | null;
}
type DetailState = CveDetail | 'loading' | 'error';

const SEVERITIES = ['', 'critical', 'high', 'medium', 'low'];

function CvesTab(): JSX.Element {
  const [input, setInput] = useState('');
  const [severity, setSeverity] = useState('');
  const [data, setData] = useState<CvesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  const toggleDetail = async (cveId: string) => {
    if (expanded === cveId) {
      setExpanded(null);
      return;
    }
    setExpanded(cveId);
    if (details[cveId] && details[cveId] !== 'error') return;
    setDetails((d) => ({ ...d, [cveId]: 'loading' }));
    try {
      const r = await fetch(`/api/v1/pd/cve-detail?cve=${encodeURIComponent(cveId)}`);
      if (!r.ok) throw new Error(String(r.status));
      const detail = (await r.json()) as CveDetail;
      setDetails((d) => ({ ...d, [cveId]: detail }));
    } catch {
      setDetails((d) => ({ ...d, [cveId]: 'error' }));
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '250' });
      if (input.trim()) params.set('q', input.trim());
      if (severity) params.set('severity', severity);
      const r = await fetch(`/api/v1/pd/cves?${params.toString()}`);
      if (!r.ok) throw new Error(`catalog failed (${r.status})`);
      setData((await r.json()) as CvesResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
        CVEs that have a public Nuclei detection template — i.e. known-detectable / weaponized. Backed by{' '}
        <a
          href="https://github.com/projectdiscovery/nuclei-templates"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          projectdiscovery/nuclei-templates
        </a>
        .
      </p>
      <form onSubmit={search} className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="CVE id, product, or keyword (e.g. CVE-2024-3400, confluence, RCE)"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="CVE search"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-xs"
          aria-label="Severity filter"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s || 'any severity'}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} search
        </button>
      </form>

      {data && (
        <p className="text-mini font-mono text-slate-500 mb-3">
          {data.total_matches.toLocaleString()} matches of {data.catalog_total.toLocaleString()} templated CVEs
          {data.truncated && <span className="text-amber-600 dark:text-amber-400"> · showing {data.count}</span>}
        </p>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.items.length === 0}
        emptyLabel="No templated CVEs match."
        rows={8}
      >
        {data && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                  {['CVE', 'Severity', 'CVSS', 'Name', 'Template'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 font-mono text-mini uppercase tracking-wider text-slate-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((cve) => {
                  const det = details[cve.id];
                  const open = expanded === cve.id;
                  return (
                    <Fragment key={cve.id}>
                      <tr className="border-t border-slate-100 dark:border-slate-800/70 align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <a
                            href={sanitizeUrl(cve.nvd_url) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-meta text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {cve.id}
                          </a>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`text-mini font-mono px-2 py-0.5 rounded border ${SEVERITY_TONE[toSeverity(cve.severity)]}`}
                          >
                            {cve.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-meta tabular-nums text-slate-600 dark:text-slate-400">
                          {cve.cvss ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-md">
                          <span className="block whitespace-normal leading-snug">{cve.name}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <a
                            href={sanitizeUrl(cve.template_url) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-mini font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                          >
                            yaml <ExternalLink size={10} />
                          </a>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void toggleDetail(cve.id)}
                            className="text-mini font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                            aria-expanded={open}
                          >
                            {open ? '▾ hide' : '▸ detail'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-t border-slate-100 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/30">
                          <td colSpan={6} className="px-4 py-3">
                            {det === 'loading' || det === undefined ? (
                              <span className="text-meta font-mono text-slate-500 inline-flex items-center gap-1.5">
                                <Loader2 size={12} className="animate-spin" /> loading Shodan CVEDB…
                              </span>
                            ) : det === 'error' ? (
                              <span className="text-meta font-mono text-slate-500 dark:text-slate-400">No CVEDB record for {cve.id}.</span>
                            ) : (
                              <div className="space-y-2 text-meta">
                                <div className="flex flex-wrap gap-2">
                                  {det.kev && (
                                    <span className="font-mono px-2 py-0.5 rounded border border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300">
                                      CISA KEV — actively exploited
                                    </span>
                                  )}
                                  {det.cvss != null && (
                                    <span className="font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                                      CVSS {det.cvss}
                                    </span>
                                  )}
                                  {det.epss != null && (
                                    <span className="font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                                      EPSS {(det.epss * 100).toFixed(1)}%
                                      {det.epss_percentile != null
                                        ? ` · p${(det.epss_percentile * 100).toFixed(0)}`
                                        : ''}
                                    </span>
                                  )}
                                  {det.ransomware_campaign && det.ransomware_campaign !== 'Unknown' && (
                                    <span className="font-mono px-2 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                                      ransomware: {det.ransomware_campaign}
                                    </span>
                                  )}
                                  {det.ssvc?.decision && (
                                    <span
                                      className={`font-mono px-2 py-0.5 rounded border ${
                                        det.ssvc.decision === 'Act'
                                          ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                          : det.ssvc.decision.startsWith('Attend')
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                            : 'border-slate-300 dark:border-slate-700 text-slate-500'
                                      }`}
                                      title="CISA SSVC decision (derived)"
                                    >
                                      SSVC: {det.ssvc.decision}
                                    </span>
                                  )}
                                </div>
                                {det.ssvc &&
                                  (det.ssvc.exploitation || det.ssvc.automatable || det.ssvc.technical_impact) && (
                                    <p className="font-mono text-mini text-slate-500">
                                      <span className="text-slate-400">CISA SSVC:</span> exploitation=
                                      {det.ssvc.exploitation ?? '—'} · automatable={det.ssvc.automatable ?? '—'} ·
                                      impact={det.ssvc.technical_impact ?? '—'}
                                    </p>
                                  )}
                                {det.summary && (
                                  <p className="text-slate-600 dark:text-slate-400 leading-snug max-w-3xl">
                                    {det.summary}
                                  </p>
                                )}
                                {det.cpes.length > 0 && (
                                  <p className="font-mono text-mini text-slate-500">
                                    <span className="text-slate-400">affected:</span>{' '}
                                    {det.cpes.slice(0, 8).join('  ·  ')}
                                    {det.cpes.length > 8 ? ` … (+${det.cpes.length - 8})` : ''}
                                  </p>
                                )}
                                <span className="text-micro font-mono text-slate-400">source: Shodan CVEDB (free)</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
    </div>
  );
}

// ─── Page shell ──────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'credentials', label: 'Credentials' },
  { id: 'subdomains', label: 'Subdomains' },
  { id: 'cves', label: 'CVE templates' },
];

export default function ProjectDiscovery(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get('tab') as Tab) || 'credentials';
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : 'credentials');

  const selectTab = (t: Tab) => {
    setTab(t);
    setSearchParams({ tab: t }, { replace: true });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Crosshair size={28} className="text-brand-600 dark:text-brand-400" /> ProjectDiscovery
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Free intel over the ProjectDiscovery platform — leaked-credential exposure, Chaos subdomain recon, and the
          Nuclei-template CVE catalog. No paid scan credits consumed.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Credentials &amp; CVE catalog need no key · Subdomains use a free PDCP key.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
              tab === t.id
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'credentials' && <CredentialsTab />}
      {tab === 'subdomains' && <SubdomainsTab />}
      {tab === 'cves' && <CvesTab />}
    </div>
  );
}
