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
  Twitter,
} from 'lucide-react';

interface LiveTweet {
  id: string;
  url: string;
  text: string;
  author: { screen_name: string; name: string; avatar_url?: string };
  created_at: string;
  created_at_ms: number;
  replies: number;
  retweets: number;
  likes: number;
  views: number;
  media: Array<{ type: 'photo' | 'video' | 'gif'; url: string }>;
  tweetfeed_tags: string[];
  ioc_types: string[];
}

interface XLiveResponse {
  generated_at: string;
  source: string;
  since_hours: number;
  total_status_ids_seen: number;
  enriched_count: number;
  enrichment_failures?: number;
  stale?: boolean;
  items: LiveTweet[];
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

const IOC_TYPE_COLOR: Record<string, string> = {
  url: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  domain: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  sha256: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  md5: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  sha1: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export default function XLive(): JSX.Element {
  const [data, setData] = useState<XLiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sinceHours, setSinceHours] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('x-live.since-hours') ?? '24') || 24;
    } catch {
      return 24;
    }
  });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const load = (hours: number) => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/v1/x-live?since_hours=${hours}&limit=30`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as XLiveResponse | { error: string };
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
  };

  useEffect(() => {
    try {
      localStorage.setItem('x-live.since-hours', String(sinceHours));
    } catch {
      /* localStorage unavailable */
    }
    return load(sinceHours);
  }, [sinceHours]);

  const handleCounts = useMemo(() => {
    if (!data) return [] as Array<{ handle: string; count: number }>;
    const m = new Map<string, number>();
    for (const t of data.items) {
      const h = t.author.screen_name.toLowerCase();
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return [...m.entries()].map(([handle, count]) => ({ handle, count })).sort((a, b) => b.count - a.count);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((t) => {
      if (activeHandle && t.author.screen_name.toLowerCase() !== activeHandle) return false;
      if (!q) return true;
      return (
        t.text.toLowerCase().includes(q) ||
        t.author.screen_name.toLowerCase().includes(q) ||
        t.tweetfeed_tags.some((x) => x.toLowerCase().includes(q))
      );
    });
  }, [data, search, activeHandle]);

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
          <Twitter size={28} className="text-brand-600 dark:text-brand-400" /> X live (cybersec)
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            live · free
          </span>
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
          Chronological X tweets from cybersec IOC-posting accounts — assembled by joining{' '}
          <a
            href="https://github.com/0xDanielLopez/TweetFeed"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            TweetFeed
          </a>{' '}
          (chronological permalink stream from ~30 monitored accounts) with{' '}
          <a
            href="https://github.com/FixTweet/FxTwitter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            fxtwitter
          </a>{' '}
          (per-status enrichment for full text, author, media, engagement). This is the only free path that delivers{' '}
          <em>recent</em> X content — X gates anonymous timeline access, but per-tweet embed previews stay open because
          Discord/Slack/Telegram link cards depend on them.
        </p>
        <p className="text-[11px] font-mono text-slate-500 mt-2">
          <strong>Coverage caveat:</strong> only tweets that TweetFeed surfaces (researcher-posted IOCs). Prose-only
          researcher takes won&apos;t appear here. For non-IOC chatter use{' '}
          <Link to="/threatintel/x" className="text-brand-600 dark:text-brand-400 hover:underline">
            Bluesky+Mastodon firehose
          </Link>
          . For static profile reference, see{' '}
          <Link to="/threatintel/x-watch" className="text-brand-600 dark:text-brand-400 hover:underline">
            X profile highlights
          </Link>
          .
        </p>
      </div>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
          window:
          <select
            value={sinceHours}
            onChange={(e) => setSinceHours(Number(e.target.value))}
            className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-mono rounded focus:outline-none focus:border-brand-500"
          >
            {[6, 12, 24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </option>
            ))}
          </select>
        </label>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter text, handle, or tag…"
            className="w-full pl-7 pr-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={() => load(sinceHours)}
          disabled={loading}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
        </button>
      </section>

      {handleCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setActiveHandle(null)}
            className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
              activeHandle === null
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
          >
            all · {data?.items.length ?? 0}
          </button>
          {handleCounts.map(({ handle, count }) => (
            <button
              key={handle}
              type="button"
              onClick={() => setActiveHandle(handle === activeHandle ? null : handle)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                activeHandle === handle
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
              }`}
            >
              @{handle} · {count}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 mb-4 inline-flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading && !data && (
        <p className="text-xs font-mono text-slate-500 inline-flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> joining TweetFeed × fxtwitter…
        </p>
      )}

      {!loading && data && filtered.length === 0 && (
        <p className="text-xs font-mono text-slate-500 rounded border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
          {data.stale ? 'Showing cached data (upstream enrichment temporarily unavailable). ' : ''}
          {data.items.length === 0
            ? data.total_status_ids_seen > 0
              ? `TweetFeed has ${data.total_status_ids_seen} status IDs but enrichment (fxtwitter) couldn't resolve them — upstream may be rate-limited or temporary unavailable.`
              : `No status IDs in the last ${sinceHours}h — TweetFeed may be quiet or upstream rate-limited.`
            : 'No tweets match the current filter.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
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
                    <button
                      type="button"
                      onClick={() => setActiveHandle(t.author.screen_name.toLowerCase())}
                      className="text-[11px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                      title="filter to this handle"
                    >
                      @{t.author.screen_name}
                    </button>
                    {t.ioc_types.map((iocType) => (
                      <span
                        key={iocType}
                        className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
                          IOC_TYPE_COLOR[iocType] ?? 'border-slate-300 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        {iocType}
                      </span>
                    ))}
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
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{t.text}</p>
                  {t.tweetfeed_tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.tweetfeed_tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSearch(tag)}
                          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
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
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare size={10} /> {compactNumber(t.replies) || '0'}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Repeat size={10} /> {compactNumber(t.retweets) || '0'}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Heart size={10} /> {compactNumber(t.likes) || '0'}
                    </span>
                    {t.views > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <BarChart3 size={10} /> {compactNumber(t.views)}
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
        <p className="mt-6 text-[10px] font-mono text-slate-400 text-center">
          {data.stale && <span className="text-amber-500 dark:text-amber-400">stale · </span>}
          source: TweetFeed ({data.total_status_ids_seen} status IDs seen) × fxtwitter ({data.enriched_count} enriched
          {data.enrichment_failures != null && data.enrichment_failures > 0
            ? `, ${data.enrichment_failures} failed`
            : ''}
          ) · last {sinceHours}h · refreshed {formatTimeAgo(data.generated_at)}
        </p>
      )}
    </div>
  );
}
