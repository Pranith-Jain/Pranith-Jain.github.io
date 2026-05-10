import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Rss, ChevronRight, Bell, Send, Globe2, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

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

function LiveSnapshotPanel(): JSX.Element {
  const [ransomware, setRansomware] = useState<RansomwareResp | null>(null);
  const [telegram, setTelegram] = useState<TelegramResp | null>(null);
  const [onion, setOnion] = useState<OnionResp | null>(null);
  const [errors, setErrors] = useState<{ ransomware?: string; telegram?: string; onion?: string }>({});

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
      const [r, t, o] = await Promise.all([
        safe<RansomwareResp>('/api/v1/ransomware-recent', 'ransomware'),
        safe<TelegramResp>('/api/v1/telegram-feed', 'telegram'),
        safe<OnionResp>('/api/v1/onion-watch', 'onion'),
      ]);
      if (cancelled) return;
      if (r) setRansomware(r);
      if (t) setTelegram(t);
      if (o) setOnion(o);
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

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display font-bold text-xl">Right now</h2>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
          live · between KV-baked briefings
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Ransomware activity */}
        <div className="rounded-2xl border border-rose-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <Bell size={14} className="text-rose-600 dark:text-rose-400" /> Ransomware
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
                  {recentVictims.map((v, i) => (
                    <li key={`${v.group}-${v.victim}-${i}`} className="flex items-baseline gap-2 text-[11px] font-mono">
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
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Telegram firehose */}
        <div className="rounded-2xl border border-sky-500/30 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
              <Send size={14} className="text-sky-600 dark:text-sky-400" /> Telegram firehose
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
                  {recentMessages.map((m) => (
                    <li key={m.permalink} className="text-[11px] font-mono">
                      <div className="flex items-baseline gap-2">
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
                      <p className="text-slate-500 dark:text-slate-500 line-clamp-1 break-all">{m.text}</p>
                    </li>
                  ))}
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
          Live "right now" snapshot below pulls from the ransomware leak-site feed, the cybersec Telegram firehose, and
          the .onion reachability tracker. Underneath, auto-generated daily and weekly briefings drawn from CISA KEV,
          NVD, and abuse.ch / OpenPhish — daily at 00:05 UTC, weekly at 00:15 UTC Monday. Reference only — verify all
          indicators in your own environment.
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
        <p className="text-sm font-mono text-slate-500">
          RSS feed coming soon. Subscribe to get briefings in your favourite reader.
        </p>
      </div>
    </div>
  );
}
