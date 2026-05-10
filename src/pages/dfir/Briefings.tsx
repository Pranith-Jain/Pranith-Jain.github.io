import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Rss, ChevronRight, Bell, Send, Globe2, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchAggregatedFeed, type AggregatedFeedResponse } from '../../services/rssService';

type Filter = 'all' | 'daily' | 'weekly';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

// ─────────────────────────────────────────────────────────────────────────
// Live snapshot — surfaces the three "what happened today" feeds we ship
// elsewhere (ransomware victims, cybersec Telegram firehose, .onion
// reachability) so the Briefings page actually does its job between the
// daily/weekly KV-baked briefings.
// ─────────────────────────────────────────────────────────────────────────

interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  screen_url?: string;
}

interface RansomwareResp {
  generated_at: string;
  count: number;
  victims: RansomwareVictim[];
}

interface TelegramItem {
  channel_name: string;
  channel_topic: string;
  permalink: string;
  datetime: string;
  text: string;
  views?: string;
}

interface TelegramResp {
  items: TelegramItem[];
  channels: { handle: string; ok: boolean; count: number }[];
}

interface OnionResp {
  reachable_count: number;
  total_count: number;
  groups: { group: string; any_reachable: boolean }[];
}

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ageS = Math.max(0, (Date.now() - t) / 1000);
  if (ageS < 60) return 'now';
  if (ageS < 3600) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 86400) return `${Math.round(ageS / 3600)}h ago`;
  return `${Math.round(ageS / 86400)}d ago`;
}

function withinWindow(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= hours * 3600_000;
}

/**
 * Hand-picked subset of ScamWatch's "Official alerts" feed group. Highest
 * signal-density entries — government / regulator advisories on active scam
 * operations. We deliberately skip the noisier Reddit / Google News
 * sub-feeds in this snapshot card; the full firehose is on /dfir/scam-watch.
 */
const SCAM_SNAPSHOT_FEED_IDS = ['ftc-consumer', 'ic3-psas'];

const LAST_VISIT_KEY = 'dfir.briefings.last_visit';

/**
 * Capture the previous-visit timestamp at mount, then write the current
 * time on unmount so this visit becomes the next baseline.
 *
 * Returns the prior timestamp in ms, or 0 on first visit. Stable per mount
 * (won't flip mid-session) so items flagged as "new" stay flagged while
 * the user is on the page.
 */
function useLastVisit(): number {
  const prevRef = useRef<number | null>(null);
  if (prevRef.current === null) {
    if (typeof window === 'undefined') {
      prevRef.current = 0;
    } else {
      try {
        const raw = window.localStorage.getItem(LAST_VISIT_KEY);
        prevRef.current = raw ? Number(raw) || 0 : 0;
      } catch {
        prevRef.current = 0;
      }
    }
  }
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
      } catch {
        /* private mode / quota */
      }
    };
  }, []);
  return prevRef.current;
}

function isNewSince(iso: string | undefined, since: number): boolean {
  if (!since) return false;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t > since;
}

function NewBadge({ count, label = 'new' }: { count: number; label?: string }): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span
      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0"
      title={`${count} new since your last visit`}
    >
      {count} {label}
    </span>
  );
}

function LiveSnapshotPanel(): JSX.Element {
  const lastVisit = useLastVisit();
  const [ransomware, setRansomware] = useState<RansomwareResp | null>(null);
  const [telegram, setTelegram] = useState<TelegramResp | null>(null);
  const [onion, setOnion] = useState<OnionResp | null>(null);
  const [scam, setScam] = useState<AggregatedFeedResponse | null>(null);
  const [errors, setErrors] = useState<{ ransomware?: string; telegram?: string; onion?: string; scam?: string }>({});

  useEffect(() => {
    let cancelled = false;
    const safe = async <T,>(url: string, key: 'ransomware' | 'telegram' | 'onion'): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as T;
      } catch (e) {
        if (!cancelled) setErrors((cur) => ({ ...cur, [key]: (e as Error).message }));
        return null;
      }
    };
    void (async () => {
      const [r, t, o, s] = await Promise.all([
        safe<RansomwareResp>('/api/v1/ransomware-recent', 'ransomware'),
        safe<TelegramResp>('/api/v1/telegram-feed', 'telegram'),
        safe<OnionResp>('/api/v1/onion-watch', 'onion'),
        fetchAggregatedFeed(SCAM_SNAPSHOT_FEED_IDS, { limit: 12, perSource: 6 }).catch((e: Error) => {
          if (!cancelled) setErrors((cur) => ({ ...cur, scam: e.message }));
          return null;
        }),
      ]);
      if (cancelled) return;
      if (r) setRansomware(r);
      if (t) setTelegram(t);
      if (o) setOnion(o);
      if (s) setScam(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentVictims = useMemo(() => {
    if (!ransomware) return [];
    return ransomware.victims.filter((v) => withinWindow(v.discovered, 24)).slice(0, 4);
  }, [ransomware]);

  const recentMessages = useMemo(() => {
    if (!telegram) return [];
    // Top 4 by recency.
    return telegram.items.slice(0, 4);
  }, [telegram]);

  const reachablePct = onion ? Math.round((onion.reachable_count / Math.max(1, onion.groups.length)) * 100) : null;

  const recentScam = useMemo(() => {
    if (!scam) return [];
    return scam.items.slice(0, 4);
  }, [scam]);

  // "New since last visit" counts — counted across the FULL response, not
  // just the visible top-N, so the badge reflects real activity.
  const newRansomwareCount = useMemo(
    () => (ransomware ? ransomware.victims.filter((v) => isNewSince(v.discovered, lastVisit)).length : 0),
    [ransomware, lastVisit]
  );
  const newTelegramCount = useMemo(
    () => (telegram ? telegram.items.filter((m) => isNewSince(m.datetime, lastVisit)).length : 0),
    [telegram, lastVisit]
  );
  // Onion-watch has no per-item timestamp — just a snapshot of current
  // reachability. We can't honestly say "X new" without storing the prior
  // reachable set in localStorage too, which is more state than this view
  // wants. Leaving the onion card without a "new" badge — the other three
  // cards carry the "what's new" story.
  const newScamCount = useMemo(
    () => (scam ? scam.items.filter((it) => isNewSince(it.pubDate, lastVisit)).length : 0),
    [scam, lastVisit]
  );
  const totalNew = newRansomwareCount + newTelegramCount + newScamCount;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl inline-flex items-center gap-2">
          Right now
          {lastVisit > 0 && totalNew > 0 && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
              title={`${totalNew} new items since your last visit`}
            >
              {totalNew} new since last visit
            </span>
          )}
        </h2>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
          live · between KV-baked briefings
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Ransomware activity */}
        <div className="rounded-2xl border border-rose-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <Bell size={14} className="text-rose-600 dark:text-rose-400" /> Ransomware
              {lastVisit > 0 && <NewBadge count={newRansomwareCount} />}
            </h3>
            <Link
              to="/dfir/darkweb"
              className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              feed <ExternalLink size={9} />
            </Link>
          </div>
          {errors.ransomware && <p className="text-[11px] font-mono text-rose-500">load error: {errors.ransomware}</p>}
          {!ransomware && !errors.ransomware && <p className="text-[11px] font-mono text-slate-400">loading…</p>}
          {ransomware && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{recentVictims.length}</span>{' '}
                claims in last 24h · {ransomware.count} total tracked
              </p>
              {recentVictims.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No claims in the last 24 h.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {recentVictims.map((v, i) => {
                    const isNew = isNewSince(v.discovered, lastVisit);
                    return (
                      <li
                        key={`${v.group}-${v.victim}-${i}`}
                        className="flex items-baseline gap-2 text-[11px] font-mono"
                      >
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            isNew ? 'bg-amber-500' : 'bg-transparent'
                          }`}
                          aria-label={isNew ? 'new since last visit' : undefined}
                        />
                        <span className="text-[9px] uppercase tracking-wider px-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 shrink-0">
                          {v.group}
                        </span>
                        <a
                          href={v.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0"
                          title={v.victim}
                        >
                          {v.victim}
                        </a>
                        <span className="text-slate-400 shrink-0">{shortRel(v.discovered)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Telegram firehose */}
        <div className="rounded-2xl border border-sky-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <Send size={14} className="text-sky-600 dark:text-sky-400" /> Telegram firehose
              {lastVisit > 0 && <NewBadge count={newTelegramCount} />}
            </h3>
            <Link
              to="/dfir/telegram-watch"
              className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              catalogue <ExternalLink size={9} />
            </Link>
          </div>
          {errors.telegram && <p className="text-[11px] font-mono text-rose-500">load error: {errors.telegram}</p>}
          {!telegram && !errors.telegram && <p className="text-[11px] font-mono text-slate-400">loading…</p>}
          {telegram && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{telegram.items.length}</span>{' '}
                posts · {telegram.channels.filter((c) => c.ok).length} channels live
              </p>
              {recentMessages.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No recent messages.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {recentMessages.map((m) => {
                    const isNew = isNewSince(m.datetime, lastVisit);
                    return (
                      <li key={m.permalink} className="text-[11px] font-mono">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={isNew ? 'new since last visit' : undefined}
                          />
                          <a
                            href={m.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-display font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 truncate flex-1 min-w-0"
                          >
                            {m.channel_name}
                          </a>
                          <span className="text-slate-400 shrink-0">{shortRel(m.datetime)}</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-500 line-clamp-1 break-all pl-3.5">{m.text}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Onion watch */}
        <div className="rounded-2xl border border-violet-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <Globe2 size={14} className="text-violet-600 dark:text-violet-400" /> .onion reachability
            </h3>
            <Link
              to="/dfir/onion-watch"
              className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full inventory <ExternalLink size={9} />
            </Link>
          </div>
          {errors.onion && <p className="text-[11px] font-mono text-rose-500">load error: {errors.onion}</p>}
          {!onion && !errors.onion && <p className="text-[11px] font-mono text-slate-400">loading…</p>}
          {onion && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{onion.reachable_count}</span>/
                {onion.groups.length} groups reachable{reachablePct !== null && ` (${reachablePct}%)`} ·{' '}
                {onion.total_count} mirrors
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {onion.groups
                  .filter((g) => g.any_reachable)
                  .slice(0, 8)
                  .map((g) => (
                    <Link
                      key={g.group}
                      to="/dfir/onion-watch"
                      className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                    >
                      {g.group}
                    </Link>
                  ))}
                {onion.reachable_count > 8 && (
                  <span className="text-[10px] font-mono text-slate-500">+{onion.reachable_count - 8} more</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Scam intel — FTC + IC3 official alerts */}
        <div className="rounded-2xl border border-amber-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" /> Scam intel
              {lastVisit > 0 && <NewBadge count={newScamCount} />}
            </h3>
            <Link
              to="/dfir/scam-watch"
              className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full feed <ExternalLink size={9} />
            </Link>
          </div>
          {errors.scam && <p className="text-[11px] font-mono text-rose-500">load error: {errors.scam}</p>}
          {!scam && !errors.scam && <p className="text-[11px] font-mono text-slate-400">loading…</p>}
          {scam && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{scam.total_items}</span>{' '}
                official alerts · FTC + IC3
              </p>
              {recentScam.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No recent alerts.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {recentScam.map((it) => {
                    const isNew = isNewSince(it.pubDate, lastVisit);
                    return (
                      <li key={it.guid ?? it.link} className="text-[11px] font-mono">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={isNew ? 'new since last visit' : undefined}
                          />
                          <a
                            href={it.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-display font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 truncate flex-1 min-w-0"
                            title={it.title}
                          >
                            {it.title}
                          </a>
                          <span className="text-slate-400 shrink-0">{shortRel(it.pubDate)}</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-500 truncate pl-3.5">{it.source}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

interface BriefingMeta {
  type: 'daily' | 'weekly';
  title: string;
  date: string;
  range_end?: string;
  date_range: string;
  stats: {
    findings: number;
    sections: number;
    cves: number;
    kevs: number;
    iocs: number;
    critical: number;
    high: number;
  };
  sources: string[];
}

interface ListItem {
  slug: string;
  metadata: BriefingMeta;
}

export default function Briefings(): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/briefings/list?limit=60')
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `${r.status}`);
        }
        return (await r.json()) as { items: ListItem[] };
      })
      .then((d) => setItems(d.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((b) => filter === 'all' || b.metadata.type === filter)
      .slice()
      .sort((a, b) => {
        // Sort by end-of-period so weeklies and dailies interleave correctly.
        const ak = a.metadata.range_end ?? a.metadata.date ?? '';
        const bk = b.metadata.range_end ?? b.metadata.date ?? '';
        return bk.localeCompare(ak);
      });
  }, [items, filter]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-16 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-10 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-12"
      >
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          Intel Briefings
        </span>
        <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4 leading-tight">Threat Intel Briefings</h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Live "right now" snapshot below pulls from the ransomware leak-site feed, the cybersec Telegram firehose, the
          .onion reachability tracker, and the FTC + IC3 scam alerts. Underneath, auto-generated daily and weekly
          briefings drawn from CISA KEV, NVD, and abuse.ch / OpenPhish — daily at 00:05 UTC, weekly at 00:15 UTC Monday.
          Reference only — verify all indicators in your own environment.
        </p>
      </motion.header>

      <LiveSnapshotPanel />

      {/* Briefings list */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-xl">Briefings</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map(({ id, label }) => {
            const isActive = id === filter;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors ${
                  isActive
                    ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {loading && <p className="text-sm font-mono text-slate-400 py-10 text-center">Loading briefings…</p>}
        {error && (
          <p className="text-sm font-mono text-rose-600 dark:text-rose-400 py-10 text-center">error: {error}</p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm font-mono text-slate-400 py-10 text-center">
            No briefings yet. The first daily briefing publishes at 00:05 UTC tomorrow.
          </p>
        )}

        <div className="space-y-4">
          {filtered.map((item) => (
            <Link
              key={item.slug}
              to={`/dfir/briefings/${item.slug}`}
              className="block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg leading-snug">{item.metadata.title}</h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{item.metadata.date_range}</p>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${
                    item.metadata.type === 'daily'
                      ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                      : 'bg-violet-500/15 dark:bg-violet-400/15 text-violet-600 dark:text-violet-400 border-violet-500/40'
                  }`}
                >
                  {item.metadata.type}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500 mt-3">
                <span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">
                    {item.metadata.stats.findings}
                  </span>{' '}
                  findings
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{item.metadata.stats.cves}</span>{' '}
                  CVEs
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="text-brand-600 dark:text-brand-400 font-semibold">
                    {item.metadata.stats.iocs ?? 0}
                  </span>{' '}
                  IOCs
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">{item.metadata.stats.critical}</span>{' '}
                  critical
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="text-orange-600 dark:text-orange-400 font-semibold">{item.metadata.stats.high}</span>{' '}
                  high
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400 truncate">{(item.metadata.sources ?? []).join(', ')}</span>
                <ChevronRight size={14} className="ml-auto text-slate-400 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </motion.section>

      <div className="mt-16 flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <Rss size={16} className="text-slate-400 shrink-0" />
        <p className="text-sm font-mono text-slate-500 flex-1">
          Subscribe in your reader:{' '}
          <a
            href="/api/v1/briefings/rss"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            /api/v1/briefings/rss
          </a>{' '}
          · RSS 2.0 · last 10 briefings, edge-cached 1 h.
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/api/v1/briefings/rss`);
          }}
          className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline shrink-0"
          title="Copy RSS URL"
        >
          copy URL
        </button>
      </div>
    </div>
  );
}
