import { useEffect, useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { relativeAgo as shortRel } from '../../lib/relativeTime';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Radar, RefreshCw, Search } from 'lucide-react';
import { DataState } from '../../components/DataState';
import { StatBar } from '../../components/StatBar';

/**
 * MyThreatIntel dashboard — one surface over the official REST API
 * (proxied at /api/v1/mti, Bearer token injected server-side). Source
 * picker fans across all nine intelligence categories; each renders its
 * documented columns plus a distribution bar over the most meaningful
 * categorical field. Matches the portfolio design system (DataState,
 * StatBar, card/pill primitives) — no new chart deps.
 */

// NOTE: the upstream `events` source is permanently empty — MyThreatIntel
// serves CTI victim/event data via `ransomware`, so that tab IS the CTI
// events view. `events` is intentionally omitted to avoid a dead tab.
const SOURCES = ['iocs', 'malware', 'cve', 'ransomware', 'leaks', 'groups', 'markets', 'onions'] as const;
type Source = (typeof SOURCES)[number];

const SOURCE_LABEL: Record<Source, string> = {
  iocs: 'Indicators (IOC)',
  malware: 'Malware samples',
  cve: 'Vulnerabilities',
  ransomware: 'CTI events (victims)',
  leaks: 'Leaks',
  groups: 'Threat groups',
  markets: 'Darknet markets',
  onions: 'Onion services',
};

/** Documented columns per source (key → header). */
const COLUMNS: Record<Source, { key: string; label: string }[]> = {
  iocs: [
    { key: 'sha256', label: 'SHA256' },
    { key: 'file_name', label: 'Detection' },
    { key: 'type', label: 'File' },
    { key: 'signature', label: 'Signature' },
    { key: 'tags', label: 'Tags' },
    { key: 'date', label: 'Date' },
  ],
  malware: [
    { key: 'sha256', label: 'SHA256' },
    { key: 'file_name', label: 'File name' },
    { key: 'signature', label: 'Signature' },
    { key: 'tags', label: 'Tags' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Date' },
  ],
  cve: [
    { key: 'cve', label: 'CVE' },
    { key: 'severity', label: 'Severity' },
    { key: 'score', label: 'Score' },
    { key: 'cvss_version', label: 'CVSS' },
    { key: 'published', label: 'Published' },
    { key: 'description', label: 'Description' },
  ],
  ransomware: [
    { key: 'date', label: 'Date' },
    { key: 'victim', label: 'Victim' },
    { key: 'gang', label: 'Gang' },
    { key: 'country', label: 'Country' },
    { key: 'website', label: 'Website' },
    { key: 'description', label: 'Description' },
  ],
  leaks: [
    { key: 'name', label: 'Name' },
    { key: 'size', label: 'Size' },
    { key: 'date', label: 'Date' },
    { key: 'url', label: 'URL' },
  ],
  groups: [
    { key: 'group_id', label: 'Group' },
    { key: 'description', label: 'Profile' },
  ],
  markets: [
    { key: 'market', label: 'Market' },
    { key: 'status', label: 'Status' },
    { key: 'page_title', label: 'Page title' },
    { key: 'last_visit', label: 'Last visit' },
    { key: 'onion', label: 'Onion' },
  ],
  onions: [
    { key: 'onion', label: 'Onion' },
    { key: 'status', label: 'Status' },
    { key: 'page_title', label: 'Page title' },
    { key: 'last_visit', label: 'Last visit' },
  ],
};

/** Field the distribution bar groups by (null = no meaningful categorical). */
const DIST_KEY: Record<Source, string | null> = {
  iocs: 'type',
  malware: 'type',
  cve: 'severity',
  ransomware: 'gang',
  leaks: 'type',
  groups: null,
  markets: 'status',
  onions: 'status',
};

type MtiRow = Record<string, unknown>;

interface MtiResponse {
  source: string;
  generated_at: string;
  total: number;
  count: number;
  items: MtiRow[];
}

function cellText(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.join(', ');
  const s = String(v).trim();
  return s && s !== 'N/D' ? s : '—';
}

function DistBar({ rows, distKey }: { rows: MtiRow[]; distKey: string | null }): JSX.Element | null {
  const buckets = useMemo(() => {
    if (!distKey) return [] as [string, number][];
    const m = new Map<string, number>();
    for (const r of rows) {
      const raw = r[distKey];
      const k = (Array.isArray(raw) ? raw[0] : raw) ? String(Array.isArray(raw) ? raw[0] : raw).trim() : 'unknown';
      m.set(k || 'unknown', (m.get(k || 'unknown') ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows, distKey]);

  if (buckets.length === 0) return null;
  const max = buckets[0]?.[1] ?? 1;

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-3">
        distribution by {distKey}
      </div>
      <div className="space-y-2">
        {buckets.map(([label, n]) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-32 sm:w-44 truncate font-mono text-xs text-slate-600 dark:text-slate-400" title={label}>
              {label}
            </div>
            <div className="flex-1 h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded bg-brand-500/70 dark:bg-brand-400/70"
                style={{ width: `${Math.max(3, Math.round((n / max) * 100))}%` }}
              />
            </div>
            <div className="w-12 text-right font-mono text-xs tabular-nums text-slate-500">{n}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MyThreatIntel(): JSX.Element {
  const [source, setSource] = useState<Source>('iocs');
  const [data, setData] = useState<MtiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Clear the previous source's data so the table doesn't show stale
    // rows from tab N-1 while tab N is loading.
    setData(null);
    setError(null);
    setNotConfigured(false);
    fetch(`/api/v1/mti?source=${source}&limit=300`)
      .then(async (r) => {
        if (r.status === 503) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          if (j.error === 'not_configured') {
            if (!cancelled) setNotConfigured(true);
            return null;
          }
        }
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<MtiResponse>;
      })
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, refreshKey]);

  const cols = COLUMNS[source];
  const filtered = useMemo(() => {
    if (!data) return [] as MtiRow[];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((row) => cols.some((c) => cellText(row[c.key]).toLowerCase().includes(q)));
  }, [data, query, cols]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Radar size={28} className="text-brand-600 dark:text-brand-400" /> MyThreatIntel
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Live view of the MyThreatIntel CTI platform via its authenticated REST API. The bearer token is held as a
          Worker secret and injected server-side — it never reaches the browser.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          9 sources: IOCs, malware, CVEs, ransomware ops, CTI events, leaks, threat groups, darknet markets, onion
          services.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                source === s
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
              }`}
            >
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${SOURCE_LABEL[source].toLowerCase()}…`}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter records"
            />
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </section>

      {notConfigured ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-800 dark:text-amber-200">
          <strong className="font-semibold">Operator dashboard disabled.</strong> Ask the site operator to enable the
          MyThreatIntel integration. The rest of the threat-intel section keeps working off the existing free feeds in
          the meantime.
        </div>
      ) : (
        <>
          {data && (
            <StatBar
              items={[
                { label: 'source', value: SOURCE_LABEL[source] },
                { label: 'total upstream', value: data.total.toLocaleString() },
                { label: 'in view', value: filtered.length.toLocaleString() },
                { label: 'generated', value: shortRel(data.generated_at) || '—' },
              ]}
            />
          )}

          {data && <DistBar rows={data.items} distKey={DIST_KEY[source]} />}

          <DataState
            loading={loading}
            error={error}
            empty={!loading && !error && filtered.length === 0}
            emptyLabel="No records for this source / filter."
            onRetry={() => setRefreshKey((k) => k + 1)}
            rows={10}
          >
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                    {cols.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-slate-100 dark:border-slate-800/70 align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                    >
                      {cols.map((col) => {
                        const text = cellText(row[col.key]);
                        const isHash = col.key === 'sha256';
                        const isUrl = (col.key === 'url' || col.key === 'onion') && text.startsWith('http');
                        const isLong = col.key === 'description' || col.key === 'page_title';
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2 ${
                              isHash
                                ? 'font-mono text-[11px] text-violet-700 dark:text-violet-300'
                                : 'text-slate-700 dark:text-slate-300'
                            } ${isLong ? 'max-w-md' : 'whitespace-nowrap'}`}
                          >
                            {text === '—' ? (
                              <span className="text-slate-400">—</span>
                            ) : isHash ? (
                              <span className="inline-flex items-center">
                                <span className="truncate inline-block max-w-[16rem] align-middle" title={text}>
                                  {text}
                                </span>
                                <CopyButton size={11} className="ml-1 align-middle" value={text} />
                              </span>
                            ) : isUrl ? (
                              <a
                                href={text}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline break-all"
                              >
                                {text.length > 48 ? text.slice(0, 45) + '…' : text} <ExternalLink size={11} />
                              </a>
                            ) : isLong ? (
                              <span className="block max-w-md whitespace-normal leading-snug">{text}</span>
                            ) : (
                              text
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </>
      )}
    </div>
  );
}
