import { useEffect, useMemo, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Repeat,
  Heart,
  BarChart3,
  Search,
  Plus,
  X as XIcon,
  Twitter,
  Settings,
  CheckCircle2,
} from 'lucide-react';

interface TweetItem {
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_at_ms: number;
  author: { screen_name: string; name: string; avatar_url?: string; verified?: boolean };
  reply_count?: number;
  retweet_count?: number;
  favorite_count?: number;
  view_count?: number;
  media: Array<{ type: 'photo' | 'video' | 'gif'; url: string }>;
  is_retweet: boolean;
  is_reply: boolean;
  is_quote: boolean;
  is_pinned: boolean;
}

interface FirehoseResponse {
  handle: string;
  display_name: string;
  bio?: string;
  followers_count?: number;
  items: TweetItem[];
  generated_at: string;
  cached: boolean;
  stale?: boolean;
  upstream_error?: string;
}

interface StatusResponse {
  ok: boolean;
  configured: boolean;
  reason?: string;
  setup?: string[];
}

interface HandleSection {
  id: string;
  label: string;
  handles: string[];
}

const SECTIONS: HandleSection[] = [
  {
    id: 'researchers',
    label: 'Independent researchers',
    handles: [
      'vxunderground',
      'malwrhunterteam',
      'JAMESWT_MHT',
      'BushidoToken',
      'cyberknow20',
      '_JohnHammond',
      'MalwareTechBlog',
      'SecureChap',
      'DeepTechTR',
      'ctrlaltintel',
      'co11ateral',
      'phatomcandle',
      'HakaiOffsec',
      'ptdbugs',
      '0x534c',
      'Sox0j',
      'Cypher1984',
      'blueteamsec1',
      'blackorbird',
    ],
  },
  {
    id: 'cti-feeds',
    label: 'CTI / breach feeds',
    handles: [
      'DailyDarkWeb',
      'FalconFeedsio',
      'MonThreat',
      'VivekIntel',
      'DarkForumss',
      'VulnCheckAI',
      'ransomnews',
      'LeakRadario',
      'DarkWebIntelBot',
      'volitant136',
      'etugenio',
    ],
  },
  {
    id: 'vendors',
    label: 'Vendor labs',
    handles: [
      'TalosSecurity',
      'Mandiant',
      'Unit42_Intel',
      'CrowdStrike',
      'SentinelOne',
      'huntresslabs',
      'MsftSecIntel',
      'Netlas_io',
      'fofabot',
      '_CPResearch_',
      'ThreatrayLabs',
      'ReliaQuestTR',
      'SlowMist_Team',
      'Kb4Threatlabs',
      'DFRLab',
      'modat_magnify',
      'stealthmole_int',
      'whiteintel_io',
      'AikidoSecurity',
      'cloudsa',
    ],
  },
  {
    id: 'osint',
    label: 'OSINT',
    handles: [
      'osintspectator',
      'sector035',
      'bellingcat',
      'dutchosintguy',
      'osintdojo',
      'OsintEssential',
      'nixintel',
      'kirbyplessas',
      'Cyber_O51NT',
      'weezerOSINT',
      'OsintJobs',
      'cyb_detective',
      'Cyber_Sudo',
    ],
  },
  {
    id: 'ir-dfir',
    label: 'IR / DFIR',
    handles: ['TheDFIRReport', 'malware_traffic', 'AnyRun_app', 'Hexacorn', 'DFIR_Radar'],
  },
  {
    id: 'news',
    label: 'News',
    handles: ['briankrebs', 'BleepinComputer', 'SecurityWeek', 'TheRegister', 'thehackersnews'],
  },
];

const DEFAULT_HANDLE = SECTIONS[0]!.handles[0]!;
const STORAGE_KEY_CUSTOM = 'x-watch.custom-handles';
const STORAGE_KEY_LAST = 'x-watch.last-handle';
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function loadCustomHandles(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((h): h is string => typeof h === 'string' && HANDLE_RE.test(h));
  } catch {
    return [];
  }
}

function formatTimeAgo(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t) || t === 0) return '';
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function compactNumber(n?: number): string {
  if (!n || n < 1) return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function XWatch(): JSX.Element {
  const [active, setActive] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_LAST) ?? DEFAULT_HANDLE;
    } catch {
      return DEFAULT_HANDLE;
    }
  });
  const [customHandles, setCustomHandles] = useState<string[]>(() => loadCustomHandles());
  const [addInput, setAddInput] = useState('');
  const [filter, setFilter] = useState('');
  const [sinceDays, setSinceDays] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('x-watch.since-days') ?? '7') || 7;
    } catch {
      return 7;
    }
  });
  const [includeReplies, setIncludeReplies] = useState<boolean>(() => {
    try {
      return localStorage.getItem('x-watch.include-replies') === '1';
    } catch {
      return false;
    }
  });
  const [includePinned, setIncludePinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('x-watch.include-pinned') === '1';
    } catch {
      return false;
    }
  });
  const [data, setData] = useState<FirehoseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<StatusResponse | null>(null);
  /** Per-handle "items in current window" count. undefined = not probed
   *  yet; 0 = probed and confirmed inactive (hidden from default lists). */
  const [activity, setActivity] = useState<Record<string, number | undefined>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LAST, active);
    } catch {
      /* localStorage unavailable */
    }
  }, [active]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customHandles));
    } catch {
      /* localStorage unavailable */
    }
  }, [customHandles]);

  useEffect(() => {
    try {
      localStorage.setItem('x-watch.since-days', String(sinceDays));
      localStorage.setItem('x-watch.include-replies', includeReplies ? '1' : '0');
      localStorage.setItem('x-watch.include-pinned', includePinned ? '1' : '0');
    } catch {
      /* localStorage unavailable */
    }
  }, [sinceDays, includeReplies, includePinned]);

  // One-time auth status probe on mount.
  useEffect(() => {
    fetch('/api/v1/x-firehose?status')
      .then((r) => r.json())
      .then((s: StatusResponse) => setAuthStatus(s))
      .catch(() => setAuthStatus({ ok: false, configured: false }));
  }, []);

  const load = (handle: string) => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    const qs = new URLSearchParams({
      handle,
      count: '40',
      since_days: String(sinceDays),
      include_replies: includeReplies ? '1' : '0',
      include_pinned: includePinned ? '1' : '0',
    });
    fetch(`/api/v1/x-firehose?${qs.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as FirehoseResponse | { error: string; hint?: string; status?: number };
        if (cancelled) return;
        if (!r.ok || 'error' in body) {
          // Generic error surface — backend details (auth state, upstream
          // URLs, hints) are not exposed to the user. They get logged in
          // wrangler tail server-side if the operator needs to diagnose.
          if (r.status === 429) setError('rate-limited — try again in a moment');
          else if (r.status === 503 || r.status === 401) setError('service unavailable');
          else setError('could not load tweets');
          // 503/401 → service unavailable — show the soft banner.
          if (r.status === 503 || r.status === 401) {
            setAuthStatus({ ok: false, configured: false });
          }
        } else {
          setData(body);
          // Keep the activity map in sync so the pill counter matches
          // what the user sees in the active panel.
          setActivity((prev) => ({ ...prev, [handle]: body.items.length }));
        }
      })
      .catch((e) => !cancelled && (e as { name?: string }).name !== 'AbortError' && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  };

  useEffect(() => {
    // Only auto-load when service is up. Save the user a wasted request
    // when we already know auth is down.
    if (authStatus && !authStatus.configured) return;
    return load(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sinceDays, includeReplies, includePinned, authStatus?.configured]);

  // Probe every handle on mount + whenever the window/auth changes so
  // inactive handles can be hidden by default. Each probe hits the same
  // /api/v1/x-firehose endpoint that the active-view uses, so the 30-min
  // per-handle edge cache makes click-through instant after first probe.
  useEffect(() => {
    if (authStatus && !authStatus.configured) return;
    const allHandles = Array.from(new Set([...SECTIONS.flatMap((s) => s.handles), ...customHandles]));
    let cancelled = false;
    setProbing(true);
    setActivity((prev) => {
      const next: Record<string, number | undefined> = {};
      for (const h of allHandles) next[h] = h === active ? prev[h] : undefined;
      return next;
    });
    Promise.allSettled(
      allHandles.map(async (h) => {
        const qs = new URLSearchParams({
          handle: h,
          count: '5',
          since_days: String(sinceDays),
          include_replies: includeReplies ? '1' : '0',
          include_pinned: '0',
        });
        const r = await fetch(`/api/v1/x-firehose?${qs.toString()}`);
        if (!r.ok) return { h, count: 0 };
        const body = (await r.json()) as FirehoseResponse;
        return { h, count: body.items?.length ?? 0 };
      })
    ).then((results) => {
      if (cancelled) return;
      setActivity((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === 'fulfilled') next[r.value.h] = r.value.count;
        }
        return next;
      });
      setProbing(false);
    });
    return () => {
      cancelled = true;
    };
    // Re-probe when window/replies/auth changes. customHandles changes
    // intentionally NOT in dep list — adding a custom handle probes that
    // single handle via the load() side-effect, no need to re-fire all
    // 41 probes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays, includeReplies, authStatus?.configured]);

  const isInactive = (h: string): boolean => activity[h] === 0;

  const addHandle = () => {
    const h = addInput.trim().replace(/^@/, '');
    if (!HANDLE_RE.test(h)) {
      setError(`invalid handle: "${h}" (1-15 chars, A-Z 0-9 _)`);
      return;
    }
    setCustomHandles((prev) => (prev.includes(h) ? prev : [...prev, h]));
    setAddInput('');
    setActive(h);
  };

  const removeCustom = (h: string) => {
    setCustomHandles((prev) => prev.filter((x) => x !== h));
    if (active === h) setActive(DEFAULT_HANDLE);
  };

  const filteredTweets = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((t) => t.text.toLowerCase().includes(q));
  }, [data, filter]);

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
          <Twitter size={28} className="text-brand-600 dark:text-brand-400" /> X firehose
          {authStatus?.configured && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              live
            </span>
          )}
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
          Live chronological tweets from cybersec accounts. Filter by handle, time window, replies, and pinned. Inactive
          handles (no posts within the selected window) are hidden by default — click &quot;+N inactive&quot; in each
          section to surface them.
        </p>
      </div>

      {authStatus && !authStatus.configured && (
        <section className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-5 mb-6">
          <div className="flex items-start gap-2">
            <Settings size={16} className="text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display font-bold text-base text-amber-900 dark:text-amber-200">
                Service temporarily unavailable
              </h2>
              <p className="text-xs font-mono text-amber-800 dark:text-amber-300 mt-1">
                The live X feed is offline right now. Try the{' '}
                <Link to="/threatintel/x-live" className="underline">
                  cybersec X firehose
                </Link>{' '}
                or the{' '}
                <Link to="/threatintel/x" className="underline">
                  Bluesky / Mastodon firehose
                </Link>{' '}
                while it recovers.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-4 mb-6">
        {SECTIONS.map((sec) => {
          const inactive = sec.handles.filter((h) => isInactive(h) && active !== h);
          const visible = showInactive ? sec.handles : sec.handles.filter((h) => !isInactive(h) || active === h);
          if (visible.length === 0 && inactive.length === 0) return null;
          return (
            <div key={sec.id}>
              <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                {sec.label}
                <span className="opacity-60 ml-1.5">
                  · {sec.handles.length - inactive.length}/{sec.handles.length} active
                </span>
                {probing && (
                  <Loader2 size={9} className="inline ml-1 animate-spin text-slate-400" aria-label="probing" />
                )}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((h) => {
                  const count = activity[h];
                  const dim = isInactive(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setActive(h)}
                      className={`text-xs font-mono px-2 py-1 rounded border transition-colors inline-flex items-center gap-1 ${
                        active === h
                          ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                          : dim
                            ? 'border-slate-300/40 dark:border-slate-700/40 text-slate-500 opacity-50'
                            : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                      }`}
                      title={
                        count !== undefined
                          ? `${count} fresh tweet${count !== 1 ? 's' : ''} in last ${sinceDays}d`
                          : 'probing…'
                      }
                    >
                      @{h}
                      {count !== undefined && count > 0 && (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400">·{count}</span>
                      )}
                    </button>
                  );
                })}
                {!showInactive && inactive.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowInactive(true)}
                    className="text-[10px] font-mono px-1.5 py-1 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title={`Hidden — no posts in last ${sinceDays}d: ${inactive.map((h) => '@' + h).join(', ')}`}
                  >
                    +{inactive.length} inactive
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {showInactive && (
          <button
            type="button"
            onClick={() => setShowInactive(false)}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            hide inactive again
          </button>
        )}
        {customHandles.length > 0 && (
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">Your watchlist</h3>
            <div className="flex flex-wrap gap-1.5">
              {customHandles.map((h) => (
                <span
                  key={h}
                  className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border transition-colors ${
                    active === h
                      ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                  }`}
                >
                  <button type="button" onClick={() => setActive(h)}>
                    @{h}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustom(h)}
                    className="text-slate-400 hover:text-rose-600"
                    title="remove from watchlist"
                  >
                    <XIcon size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <span className="text-slate-400">@</span>
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHandle()}
              placeholder="add custom handle…"
              className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="button"
            onClick={addHandle}
            disabled={!addInput.trim()}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Plus size={11} /> add
          </button>
          <label className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            window:
            <select
              value={sinceDays}
              onChange={(e) => setSinceDays(Number(e.target.value))}
              className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-mono rounded focus:outline-none focus:border-brand-500"
            >
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d}d
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeReplies}
              onChange={(e) => setIncludeReplies(e.target.checked)}
              className="rounded border-slate-400"
            />
            replies
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includePinned}
              onChange={(e) => setIncludePinned(e.target.checked)}
              className="rounded border-slate-400"
            />
            pinned
          </label>
          <button
            type="button"
            onClick={() => load(active)}
            disabled={loading || (authStatus && !authStatus.configured) === true}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-display font-bold inline-flex items-center gap-2">
              @{active}
              {data?.display_name && data.display_name !== active && (
                <span className="text-sm font-mono text-slate-500">· {data.display_name}</span>
              )}
            </h2>
            {data?.bio && <p className="text-[12px] font-mono text-slate-500 mt-0.5 max-w-2xl">{data.bio}</p>}
            <div className="flex items-center gap-2 text-[10px] font-mono mt-1 flex-wrap">
              {data?.followers_count !== undefined && (
                <span className="text-slate-500">{compactNumber(data.followers_count)} followers</span>
              )}
              {data?.cached && (
                <span className="text-amber-600 dark:text-amber-400">
                  <CheckCircle2 size={9} className="inline" /> cached
                </span>
              )}
              {data?.stale && (
                <span className="text-amber-700 dark:text-amber-300" title={data.upstream_error}>
                  <AlertTriangle size={9} className="inline" /> stale
                </span>
              )}
              <a
                href={`https://x.com/${active}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
              >
                open on x.com <ExternalLink size={9} />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter tweets…"
                className="pl-7 pr-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 mb-3 inline-flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {loading && !data && (
          <p className="text-xs font-mono text-slate-500 inline-flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> fetching authenticated timeline for @{active}…
          </p>
        )}

        {!loading && data && filteredTweets.length === 0 && (
          <div className="text-xs font-mono text-slate-500 rounded border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
            {data.items.length === 0 ? (
              <>
                No tweets within the last <span className="text-slate-700 dark:text-slate-300">{sinceDays}d</span> for{' '}
                <span className="text-slate-700 dark:text-slate-300">@{active}</span>.
                {!includeReplies && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => setIncludeReplies(true)}
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Include replies
                    </button>{' '}
                    or{' '}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSinceDays(30)}
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  widen window
                </button>
                .
              </>
            ) : (
              <>No tweets match the search filter.</>
            )}
          </div>
        )}

        {filteredTweets.length > 0 && (
          <ul className="space-y-2">
            {filteredTweets.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
              >
                <div className="flex items-start gap-3">
                  {t.author.avatar_url && (
                    <img
                      src={t.author.avatar_url}
                      alt={t.author.name}
                      className="w-9 h-9 rounded-full shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {t.author.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">@{t.author.screen_name}</span>
                      {t.is_pinned && (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          pinned
                        </span>
                      )}
                      {t.is_retweet && (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          retweet
                        </span>
                      )}
                      {t.is_quote && (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                          quote
                        </span>
                      )}
                      {t.is_reply && (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500">
                          reply
                        </span>
                      )}
                      <a
                        href={sanitizeUrl(t.url) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-[10px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-0.5"
                        title={t.created_at}
                      >
                        {formatTimeAgo(t.created_at_ms || t.created_at)} <ExternalLink size={9} />
                      </a>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                      {t.text}
                    </p>
                    {t.media.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {t.media.slice(0, 4).map((m, i) => (
                          <a
                            key={`${t.id}-m-${i}`}
                            href={sanitizeUrl(t.url) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded overflow-hidden border border-slate-200 dark:border-slate-800"
                          >
                            <img src={m.url} alt={m.type} loading="lazy" className="w-full h-32 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-slate-500">
                      {t.reply_count !== undefined && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare size={10} /> {compactNumber(t.reply_count) || '0'}
                        </span>
                      )}
                      {t.retweet_count !== undefined && (
                        <span className="inline-flex items-center gap-0.5">
                          <Repeat size={10} /> {compactNumber(t.retweet_count) || '0'}
                        </span>
                      )}
                      {t.favorite_count !== undefined && (
                        <span className="inline-flex items-center gap-0.5">
                          <Heart size={10} /> {compactNumber(t.favorite_count) || '0'}
                        </span>
                      )}
                      {t.view_count !== undefined && t.view_count > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <BarChart3 size={10} /> {compactNumber(t.view_count)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && (
          <p className="mt-4 text-[10px] font-mono text-slate-400 text-center">
            refreshed {formatTimeAgo(data.generated_at)}
          </p>
        )}
      </div>
    </div>
  );
}
