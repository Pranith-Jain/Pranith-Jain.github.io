import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, Search, Bell, Copy, Check } from 'lucide-react';
import { formatRelativeTime } from '../../services/rssService';

/**
 * Dedicated .onion mirror tracker.
 *
 * Consumes /api/v1/onion-watch (Worker proxy to Ransomlook.io's per-group
 * profile API). Surfaces canonical Tor URLs for the most-active leak sites
 * along with reachability flags from Ransomlook's last scrape. We don't
 * fetch .onion sites ourselves — Cloudflare Workers cannot route through
 * Tor — so this is a navigation/inventory aid, not a live prober.
 *
 * Companion summary panel lives on /threatintel/darkweb. This page is the deeper
 * view: search across groups + fqdns, sort options, copy-all-mirrors, and
 * a per-group breakdown of every mirror including chat/file-share endpoints.
 */

interface OnionMirror {
  slug: string;
  fqdn: string;
  title?: string;
  available: boolean;
  updated?: string;
  version?: number;
  is_chat?: boolean;
  is_fs?: boolean;
}

interface OnionGroup {
  group: string;
  last_active?: string;
  any_reachable: boolean;
  mirrors: OnionMirror[];
}

interface OnionWatchResponse {
  generated_at: string;
  source: string;
  source_url: string;
  groups: OnionGroup[];
  reachable_count: number;
  total_count: number;
  warnings: string[];
}

type SortMode = 'last-active' | 'name' | 'mirror-count';

export default function OnionWatch(): JSX.Element {
  const [data, setData] = useState<OnionWatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showOffline, setShowOffline] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('last-active');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/onion-watch', force ? { cache: 'reload' } : {});
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as { error?: string };
          msg = parsed.error ?? msg;
        } catch { /* use default */ }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      const json = (await res.json()) as OnionWatchResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  // When Ransomlook's prober is degraded (reports 0 reachable across 20+
  // tracked mirrors), the "hide offline" filter would hide EVERYTHING and
  // the page would render empty — actively unhelpful. Auto-bypass the
  // filter in that case so users still see the mirror inventory.
  const proberLikelyDegraded = !!data && data.total_count >= 20 && data.reachable_count === 0;
  const effectiveShowOffline = showOffline || proberLikelyDegraded;

  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let groups = data.groups.slice();
    if (!effectiveShowOffline) groups = groups.filter((g) => g.any_reachable);
    if (q) {
      groups = groups
        .map((g) => {
          if (g.group.toLowerCase().includes(q)) return g;
          const matchedMirrors = g.mirrors.filter(
            (m) => m.fqdn.toLowerCase().includes(q) || (m.title ?? '').toLowerCase().includes(q)
          );
          if (matchedMirrors.length === 0) return null;
          return { ...g, mirrors: matchedMirrors };
        })
        .filter((g): g is OnionGroup => g !== null);
    }
    if (sortMode === 'name') {
      groups.sort((a, b) => a.group.localeCompare(b.group));
    } else if (sortMode === 'mirror-count') {
      groups.sort((a, b) => b.mirrors.length - a.mirrors.length);
    } else {
      groups.sort((a, b) => (b.last_active ?? '').localeCompare(a.last_active ?? ''));
    }
    return groups;
  }, [data, query, effectiveShowOffline, sortMode]);

  const visibleMirrorCount = useMemo(() => visibleGroups.reduce((n, g) => n + g.mirrors.length, 0), [visibleGroups]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  const copyAllReachable = () => {
    const lines: string[] = [];
    for (const g of visibleGroups) {
      for (const m of g.mirrors) {
        if (!effectiveShowOffline && !m.available) continue;
        lines.push(m.slug);
      }
    }
    void copy(lines.join('\n'), '__all__');
  };

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
          <Bell size={28} className="text-brand-600 dark:text-brand-400" /> Onion Watch
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Live inventory of <code>.onion</code> leak-site mirrors for the most-active ransomware groups, with
          reachability flags from Ransomlook.io&apos;s last scrape. Pivots open in your own Tor Browser. We do not fetch
          any .onion content from this site.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Companion ransomware victim feed:{' '}
          <Link to="/threatintel/darkweb" className="text-brand-600 dark:text-brand-400 hover:underline">
            Dark Web Watch
          </Link>
          . Reachability is upstream-observed and your own Tor client may see different status. Treat any leak-site
          visit as opsec-sensitive.
        </p>
      </div>

      {/* Headline stats */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <Stat label="reachable groups" value={data?.reachable_count} loading={loading} />
          <Stat label="tracked groups" value={data?.groups.length} loading={loading} />
          <Stat label="total mirrors" value={data?.total_count} loading={loading} />
          <Stat
            label="last refresh"
            valueText={data ? formatRelativeTime(data.generated_at) : undefined}
            loading={loading}
          />
        </div>
      </section>

      {/* Prober-health banner. Ransomlook's Tor reachability prober
          occasionally goes offline — when that happens it stops marking
          ANY mirror as available, even though the mirrors themselves are
          fine. The page used to read this as "0% reachable, all sites
          down" which is technically accurate-by-data but practically
          misleading. Surface the upstream state honestly: many mirrors
          and zero reachable is the prober-degraded signal. */}
      {data && data.total_count >= 20 && data.reachable_count === 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 mb-6 flex items-start gap-2 font-mono text-sm">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-800 dark:text-amber-300">
            <strong>Upstream prober looks degraded.</strong> Ransomlook is reporting 0 reachable mirrors across{' '}
            {data.total_count} tracked .onion endpoints — this almost always means their Tor reachability prober is
            offline, not that every leak site is down. The mirror addresses below are still accurate (canonical Tor
            URLs); just don't trust the green/red dots until Ransomlook's prober recovers.{' '}
            <a
              href="https://www.ransomlook.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              status.ransomlook.io
            </a>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search group name, .onion fqdn, or page title…"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search onion mirrors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] font-mono">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showOffline} onChange={(e) => setShowOffline(e.target.checked)} />
            <span className="text-slate-600 dark:text-slate-400">show offline groups</span>
          </label>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          <span className="text-slate-500">sort:</span>
          {(['last-active', 'name', 'mirror-count'] as SortMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSortMode(m)}
              className={`px-2 py-1 rounded border ${
                sortMode === m
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
              }`}
            >
              {m}
            </button>
          ))}

          <div className="sm:ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={copyAllReachable}
              disabled={visibleGroups.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copy every visible mirror URL, one per line"
            >
              {copiedKey === '__all__' ? <Check size={11} /> : <Copy size={11} />}
              copy {visibleMirrorCount} URLs
            </button>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/60 disabled:opacity-40"
              title="Force-refresh from origin (skips edge cache)"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> refresh
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4">
          Could not load .onion mirrors: {error}
        </p>
      )}

      {loading && !data && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">Loading from Ransomlook…</p>
      )}

      {data && (
        <>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-4">
            Showing {visibleGroups.length} of {data.groups.length} groups · {visibleMirrorCount} mirror
            {visibleMirrorCount === 1 ? '' : 's'} matched
          </p>

          {visibleGroups.length === 0 ? (
            <p className="text-sm font-mono text-slate-500 dark:text-slate-400">Nothing matches the current filters.</p>
          ) : (
            <ul className="space-y-3">
              {visibleGroups.map((g) => (
                <li
                  key={g.group}
                  className={`rounded-lg border p-3 ${
                    g.any_reachable
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                      {g.group}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {g.mirrors.length} mirror{g.mirrors.length === 1 ? '' : 's'}
                      </span>
                      {g.last_active && (
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          last claim {formatRelativeTime(g.last_active)}
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${
                          g.any_reachable
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-300 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        {g.any_reachable ? 'reachable' : 'all offline'}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-1.5">
                    {g.mirrors.map((m) => (
                      <li
                        key={m.slug}
                        className="flex flex-wrap items-baseline gap-2 text-[11px] font-mono px-2 py-1 rounded bg-white/60 dark:bg-slate-900/60"
                      >
                        <span
                          className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${
                            m.available ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                          }`}
                          aria-label={m.available ? 'reachable' : 'offline'}
                        />
                        <code className="text-slate-700 dark:text-slate-300 break-all flex-1 min-w-0">{m.fqdn}</code>
                        <button
                          type="button"
                          onClick={() => void copy(m.slug, m.slug)}
                          className="inline-flex items-center gap-1 text-[10px] text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                          title="Copy full Tor URL"
                        >
                          {copiedKey === m.slug ? <Check size={10} /> : <Copy size={10} />}
                          {copiedKey === m.slug ? 'copied' : 'copy URL'}
                        </button>
                        {m.is_chat && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded border border-amber-500/40 text-amber-700 dark:text-amber-300"
                            title="Chat / negotiation endpoint"
                          >
                            chat
                          </span>
                        )}
                        {m.is_fs && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded border border-cyan-500/40 text-cyan-700 dark:text-cyan-300"
                            title="File-share endpoint"
                          >
                            fs
                          </span>
                        )}
                        {typeof m.version === 'number' && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500"
                            title="Tor onion-service address version"
                          >
                            v{m.version}
                          </span>
                        )}
                        {m.title && (
                          <span
                            className="text-[10px] text-slate-500 dark:text-slate-400 italic sm:ml-auto truncate max-w-[40vw] sm:max-w-xs hidden sm:inline"
                            title={m.title}
                          >
                            “{m.title.slice(0, 60)}
                            {m.title.length > 60 ? '…' : ''}”
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {g.mirrors.length > 1 && (
                    <div className="mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      Multiple mirrors are normal — leak sites mirror across .onion v3 addresses to survive takedowns
                      and DDoS. Try the next mirror if one fails.
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.warnings.length > 0 && (
            <details className="mt-6 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                {data.warnings.length} warning{data.warnings.length === 1 ? '' : 's'} from upstream
              </summary>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="mt-6 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            Source:{' '}
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline inline-flex items-center gap-1"
            >
              Ransomlook.io <ExternalLink size={9} />
            </a>{' '}
            · generated {formatRelativeTime(data.generated_at)}.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueText,
  loading,
}: {
  label: string;
  value?: number;
  valueText?: string;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-2">
      <div className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {loading ? '…' : (valueText ?? value ?? 0)}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
