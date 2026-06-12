import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { relativeAgo as shortRel } from '../../lib/relativeTime';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Github,
  Globe,
  Hash,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { fetchIocFeed, type IocEntry, type IocFeedSummary } from '../../lib/dfir/ioc-feeds-client';
import { CopyToClipboard } from '../../components/CopyToClipboard';

type ListId = 'inbound' | 'outbound';

interface ListMeta {
  id: ListId;
  title: string;
  useCase: string;
  shortLabel: string;
  source: 'bitwire' | 'bitwire-inbound';
  accent: 'rose' | 'amber';
  icon: typeof ShieldAlert;
}

const LISTS: ListMeta[] = [
  {
    id: 'inbound',
    title: 'Inbound blocklist',
    shortLabel: 'inbound',
    useCase:
      'Apply to your firewall WAN IN / INPUT chain — drops scan, brute-force and exploit traffic from these sources.',
    source: 'bitwire-inbound',
    accent: 'rose',
    icon: ShieldAlert,
  },
  {
    id: 'outbound',
    title: 'Outbound blocklist',
    shortLabel: 'outbound',
    useCase:
      'Apply to your firewall LAN OUT / OUTPUT chain — prevents compromised hosts from reaching C2, malware and phishing destinations.',
    source: 'bitwire',
    accent: 'amber',
    icon: ShieldCheck,
  },
];

const ACCENT_STYLES = {
  rose: {
    ring: 'border-rose-500/40 bg-rose-500/5',
    pill: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
  },
  amber: {
    ring: 'border-amber-500/40 bg-amber-500/5',
    pill: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
} as const;

const BITWIRE_REPO = 'https://github.com/bitwire-it/ipblocklist';
const BITWIRE_DASH = 'https://bitwire.it/blocklist-stats';
const BITWIRE_INBOUND_RAW = 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/inbound.txt';
const BITWIRE_OUTBOUND_RAW = 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/outbound.txt';

interface ListState {
  data: IocFeedSummary | null;
  error: string | null;
  loading: boolean;
}

function emptyListState(): ListState {
  return { data: null, error: null, loading: true };
}

export default function BitwireBlocklist(): JSX.Element {
  const [active, setActive] = useState<ListId>('inbound');
  const [states, setStates] = useState<Record<ListId, ListState>>(() => ({
    inbound: emptyListState(),
    outbound: emptyListState(),
  }));
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch both feeds on mount + on refresh. Each one calls the shared
  // /api/v1/feeds/ioc-summary endpoint (which is the same path used by
  // the rest of the platform). The cap is 100 rows per list — for full
  // file sizes (1M+ rows), use the raw GitHub link.
  useEffect(() => {
    const ctrl = new AbortController();
    for (const l of LISTS) {
      setStates((s) => ({ ...s, [l.id]: { ...s[l.id], loading: true, error: null } }));
      fetchIocFeed(l.source)
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setStates((s) => ({ ...s, [l.id]: { data: d, error: null, loading: false } }));
        })
        .catch((e: Error) => {
          if (ctrl.signal.aborted) return;
          setStates((s) => ({ ...s, [l.id]: { data: s[l.id].data, error: e.message, loading: false } }));
        });
    }
    return () => ctrl.abort();
  }, [refreshKey]);

  const activeList = LISTS.find((l) => l.id === active)!;
  const activeState = states[active];
  const accent = ACCENT_STYLES[activeList.accent];

  // Overlap stats: how many IPs appear in BOTH the inbound and outbound
  // sample? High overlap means the same actor is both scanning and
  // hosting C2 — useful signal for an analyst.
  const overlap = useMemo(() => {
    const inb = new Set((states.inbound.data?.entries ?? []).map((e) => e.value));
    const outb = new Set((states.outbound.data?.entries ?? []).map((e) => e.value));
    const inter: string[] = [];
    for (const ip of inb) if (outb.has(ip)) inter.push(ip);
    return { count: inter.length, ips: inter };
  }, [states]);

  const filtered = useMemo(() => {
    const entries = activeState.data?.entries ?? [];
    if (!query.trim()) return entries;
    const q = query.trim();
    return entries.filter((e) => e.value.includes(q) || (e.context ?? '').toLowerCase().includes(q.toLowerCase()));
  }, [activeState.data, query]);

  // Substring overlap check against the OTHER list — useful for spotting
  // whether an IP a user is inspecting has already shown up on the
  // opposite side of the firewall.
  const otherList = active === 'inbound' ? 'outbound' : 'inbound';
  const otherSet = useMemo(
    () => new Set((states[otherList].data?.entries ?? []).map((e) => e.value)),
    [states, otherList]
  );

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
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> Bitwire IP Blocklist
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Mirror of{' '}
          <a
            href={sanitizeUrl(BITWIRE_REPO) || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            bitwire-it/ipblocklist
            <Github size={12} aria-hidden="true" />
          </a>{' '}
          (338 stars, updated every 2h). Two complementary lists:{' '}
          <code className="text-xs font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">inbound.txt</code>{' '}
          (attack sources — apply on WAN IN) and{' '}
          <code className="text-xs font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">outbound.txt</code> (C2
          / malware destinations — apply on LAN OUT). Aggregated from AbuseIPDB, FireHOL, ipsum, ThreatFox, Spamhaus
          DROP, SANS, Binary Defense, CINSscore and 20+ other sources.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Data: CC BY-NC-SA 4.0 (commercial use requires per-source agreements — Spamhaus etc.). Pairs with{' '}
          <Link to="/dfir/blocklists" className="text-brand-600 dark:text-brand-400 hover:underline">
            /dfir/blocklists
          </Link>{' '}
          (the consolidated pfSense / iptables / Suricata generator that already includes these lists),{' '}
          <Link to="/threatintel/live-iocs" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel/live-iocs
          </Link>{' '}
          (unified IOC firehose) and{' '}
          <a
            href={sanitizeUrl(BITWIRE_DASH) || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            the upstream stats dashboard
            <ExternalLink size={11} aria-hidden="true" />
          </a>
          .
        </p>
      </div>

      {/* Per-list stat tiles */}
      <section className="grid gap-3 sm:grid-cols-2 mb-6">
        {LISTS.map((l) => {
          const st = states[l.id];
          const ac = ACCENT_STYLES[l.accent];
          const Icon = l.icon;
          const isActive = active === l.id;
          return (
            <button
              key={l.id}
              onClick={() => setActive(l.id)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                isActive
                  ? ac.ring
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={18} className={ac.text} aria-hidden="true" />
                  <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{l.title}</span>
                </div>
                <span
                  className={`text-micro font-mono px-1.5 py-0.5 rounded border ${ac.pill}`}
                  aria-label={`Source ${l.source}`}
                >
                  {l.shortLabel}.txt
                </span>
              </div>
              <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-3">{l.useCase}</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-mono">
                <DataState
                  loading={st.loading}
                  error={st.error}
                  empty={!st.loading && !st.error && (st.data?.count ?? 0) === 0}
                  onRetry={() => setRefreshKey((k) => k + 1)}
                >
                  <span className="text-slate-900 dark:text-slate-100 font-bold">
                    {st.data?.count.toLocaleString() ?? 0}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">sampled IOCs</span>
                  {st.data?.total_in_feed !== undefined && (
                    <span className="text-slate-500 dark:text-slate-400">
                      · feed ≈ {st.data.total_in_feed.toLocaleString()}
                    </span>
                  )}
                </DataState>
              </div>
            </button>
          );
        })}
      </section>

      {/* Overlap panel */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2 inline-flex items-center gap-1.5">
          <ArrowRightLeft size={13} aria-hidden="true" /> Cross-list overlap (sampled)
        </h3>
        {states.inbound.data && states.outbound.data ? (
          <>
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
              <span
                className={`font-bold ${overlap.count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
              >
                {overlap.count}
              </span>{' '}
              of the sampled inbound IPs also appear in the outbound list.
              {overlap.count > 0
                ? ' These are hosts that have been observed both initiating attacks AND hosting C2 / malware — high-confidence threat.'
                : ' No actor in the sample does both — typical for noisy scanner sources.'}
            </p>
            {overlap.count > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {overlap.ips.slice(0, 12).map((ip) => (
                  <span
                    key={ip}
                    className="text-mini font-mono px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1"
                  >
                    <AlertTriangle size={10} aria-hidden="true" /> {ip}
                  </span>
                ))}
                {overlap.count > 12 && (
                  <span className="text-mini font-mono px-2 py-1 text-slate-500 dark:text-slate-400">
                    +{overlap.count - 12} more
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-mono text-slate-500 dark:text-slate-400">Loading both lists…</p>
        )}
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <a
          href={sanitizeUrl(active === 'inbound' ? BITWIRE_INBOUND_RAW : BITWIRE_OUTBOUND_RAW) || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5"
        >
          <Download size={13} /> Raw {activeList.shortLabel}.txt
        </a>
        <a
          href={sanitizeUrl(BITWIRE_DASH) || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5"
        >
          <Globe size={13} /> Upstream stats
        </a>
      </div>

      {/* Active list detail */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <activeList.icon size={20} className={accent.text} aria-hidden="true" />
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{activeList.title}</h2>
          <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${accent.pill}`}>
            {activeList.shortLabel}.txt
          </span>
          {activeState.data && (
            <span className="text-micro font-mono text-slate-500 dark:text-slate-400">
              fetched {shortRel(activeState.data.fetched_at)}
            </span>
          )}
        </div>
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
          {activeList.useCase}
        </p>
        {activeState.data && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Source URL:{' '}
            <a
              href={sanitizeUrl(activeState.data.count > 0 ? BITWIRE_DASH : BITWIRE_REPO) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              bitwire-it/ipblocklist
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </p>
        )}
      </section>

      {/* Search */}
      <section className="mb-4">
        <label className="block">
          <span className="sr-only">Filter IPs in {activeList.shortLabel} sample</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder={`Filter ${filtered.length} IPs — type a substring or context keyword`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </label>
      </section>

      {/* IP list */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-1.5">
          <Hash size={13} aria-hidden="true" /> Sampled IPs ({filtered.length}
          {query && activeState.data ? ` / ${activeState.data.entries.length}` : ''})
        </h3>
        <DataState
          loading={activeState.loading}
          error={activeState.error}
          empty={!activeState.loading && !activeState.error && filtered.length === 0}
          emptyLabel="No IPs match the current filter."
          onRetry={() => setRefreshKey((k) => k + 1)}
        >
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 60).map((e) => (
              <IpRow key={e.value} entry={e} isCrossListed={otherSet.has(e.value)} crossListLabel={otherList} />
            ))}
          </ul>
        </DataState>
        {filtered.length > 60 && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-3">
            Showing the first 60 of {filtered.length} matches. Download the raw{' '}
            <a
              href={sanitizeUrl(active === 'inbound' ? BITWIRE_INBOUND_RAW : BITWIRE_OUTBOUND_RAW) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              {activeList.shortLabel}.txt
            </a>{' '}
            for the full file.
          </p>
        )}
      </section>

      {/* Source attribution */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
          Attribution
        </h3>
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
          The Bitwire list is an aggregation. Underlying sources include AbuseIPDB, FireHOL, ipsum, ThreatFox,
          ShadowWhisperer IPs, romainmarcoux/malicious-ip, CriticalPathSecurity, Binary Defense, Bruteforceblocker,
          Spamhaus DROP, SANS ISC, CINSscore, dataplane.org, AlienVault OTX, Tor exit list, hagezi DNS blocklists, and
          others. Each is governed by its own license — the aggregated file is CC BY-NC-SA 4.0. See the upstream{' '}
          <a
            href={sanitizeUrl(BITWIRE_REPO) || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            README
            <ExternalLink size={11} aria-hidden="true" />
          </a>{' '}
          for the full attribution list.
        </p>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
          This platform consumes the file under fair-use / research terms and surfaces it as a research aid. Do not use
          the aggregated data for commercial products.
        </p>
      </section>
    </div>
  );
}

function IpRow({
  entry,
  isCrossListed,
  crossListLabel,
}: {
  entry: IocEntry;
  isCrossListed: boolean;
  crossListLabel: ListId;
}): JSX.Element {
  return (
    <li
      className={`flex items-center gap-2 rounded border px-2 py-1.5 font-mono text-sm ${
        isCrossListed
          ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
      }`}
    >
      {isCrossListed ? (
        <AlertTriangle size={12} className="text-rose-500 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 size={12} className="text-slate-400 dark:text-slate-600 shrink-0" aria-hidden="true" />
      )}
      <code className="truncate text-slate-900 dark:text-slate-100">{entry.value}</code>
      <span className="ml-auto shrink-0">
        <CopyToClipboard
          text={entry.value}
          className="!px-1.5 !py-1 !text-slate-400 hover:!text-brand-600 dark:hover:!text-brand-400"
        />
      </span>
      {isCrossListed && (
        <span
          className="text-mini font-mono px-1 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 shrink-0"
          title={`Also appears on the ${crossListLabel} list — high-confidence threat actor`}
        >
          ⚠ {crossListLabel}
        </span>
      )}
    </li>
  );
}
