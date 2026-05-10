import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Send,
  Globe2,
  ExternalLink,
  AlertTriangle,
  Newspaper,
  Sparkles,
  FileCode,
  Map,
  ScrollText,
} from 'lucide-react';
import { type AggregatedFeedResponse } from '../../services/rssService';
import { SnapshotCard } from './SnapshotCard';
import { useWatchlist, watchHits } from './useWatchlist';
import { shortRel } from '../../lib/relativeTime';
import { decodeHtml } from '../../lib/htmlDecode';

/**
 * Live "right now" snapshot of dark-web + Telegram + .onion + scam activity.
 *
 * Originally embedded in /threatintel/briefings; extracted here so /dfir landing
 * and per-briefing detail pages can mount it too.
 *
 * Behaviour notes:
 * - Each of the four cards fetches independently. One source failing does
 *   not block the others.
 * - "What's new since last visit" highlights items whose timestamp is newer
 *   than the localStorage `dfir.briefings.last_visit` baseline. The baseline
 *   is captured at mount and overwritten with `now` on unmount, so this
 *   visit becomes the next baseline.
 * - The localStorage key is shared across every place we mount the panel —
 *   on purpose. Visiting /dfir landing should reset the baseline so the
 *   user doesn't see the same "12 new" pill on /threatintel/briefings ten seconds
 *   later. If you mount this on multiple pages and want independent
 *   baselines, parameterise `lastVisitKey` per call.
 *
 * Props:
 * - `compact` — smaller paddings + 3 items per card (vs 4) + no per-item
 *   secondary line. For embedding above tool grids etc.
 * - `headerLabel` — section H2 text. Pass `null` to omit the section
 *   header entirely.
 * - `subtitle` — small grey text rendered next to the section header.
 * - `mbClass` — bottom-margin Tailwind class. Defaults to `mb-12`.
 */

interface Props {
  compact?: boolean;
  headerLabel?: string | null;
  subtitle?: string;
  mbClass?: string;
}

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

interface RulesRecentCommit {
  source_id: string;
  source_label: string;
  type: string;
  title: string;
  author: string;
  link: string;
  pubDate: string;
}

interface RulesResp {
  generated_at: string;
  recent_commits: RulesRecentCommit[];
  sources_count: number;
}

interface BriefingsItem {
  slug: string;
  metadata: {
    type?: string;
    title?: string;
    date?: string;
    range_end?: string;
    date_range?: string;
    stats?: { findings?: number; cves?: number; iocs?: number; critical?: number };
  };
}

interface BriefingsResp {
  items: BriefingsItem[];
}

interface ThreatMapResp {
  total_ips: number;
  countries: { country: string; countryCode: string; count: number }[];
  iocs_by_type?: { type: string; count: number }[];
}

/**
 * Wire shape of /api/v1/snapshot — a thin envelope around the six per-source
 * payloads. Each source is independently `ok: true/false` so a single bad
 * upstream doesn't blank the whole panel.
 */
interface SnapshotEnvelope<T> {
  ok: boolean;
  data: T | null;
  error?: string;
}
interface SnapshotResp {
  generated_at: string;
  ransomware: SnapshotEnvelope<RansomwareResp>;
  telegram: SnapshotEnvelope<TelegramResp>;
  onion: SnapshotEnvelope<OnionResp>;
  scam: SnapshotEnvelope<AggregatedFeedResponse>;
  threat_intel: SnapshotEnvelope<AggregatedFeedResponse>;
  tech_ai: SnapshotEnvelope<AggregatedFeedResponse>;
  rules: SnapshotEnvelope<RulesResp>;
  briefings: SnapshotEnvelope<BriefingsResp>;
  threat_map: SnapshotEnvelope<ThreatMapResp>;
}

function withinWindow(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= hours * 3600_000;
}

// Per-source feed IDs used to live here; they're now baked into the
// server-side /api/v1/snapshot endpoint (api/src/routes/snapshot.ts) so the
// client makes one request instead of six.

const LAST_VISIT_KEY = 'dfir.briefings.last_visit';

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

export function LiveSnapshotPanel(props: Props = {}): JSX.Element {
  const { compact = false, headerLabel = 'Right now', subtitle, mbClass = 'mb-12' } = props;

  const lastVisit = useLastVisit();
  const watchlist = useWatchlist();

  const [ransomware, setRansomware] = useState<RansomwareResp | null>(null);
  const [telegram, setTelegram] = useState<TelegramResp | null>(null);
  const [onion, setOnion] = useState<OnionResp | null>(null);
  const [scam, setScam] = useState<AggregatedFeedResponse | null>(null);
  const [threatIntel, setThreatIntel] = useState<AggregatedFeedResponse | null>(null);
  const [techAi, setTechAi] = useState<AggregatedFeedResponse | null>(null);
  const [rules, setRules] = useState<RulesResp | null>(null);
  const [briefings, setBriefings] = useState<BriefingsResp | null>(null);
  const [threatMap, setThreatMap] = useState<ThreatMapResp | null>(null);
  const [errors, setErrors] = useState<{
    ransomware?: string;
    telegram?: string;
    onion?: string;
    scam?: string;
    threatIntel?: string;
    techAi?: string;
    rules?: string;
    briefings?: string;
    threatMap?: string;
  }>({});

  // Single fetch to /api/v1/snapshot — server-side fan-out replaces six
  // parallel client requests. One round-trip, one setState cycle, lower TBT.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/snapshot');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const env = (await r.json()) as SnapshotResp;
        if (cancelled) return;
        if (env.ransomware.ok && env.ransomware.data) setRansomware(env.ransomware.data);
        else if (!env.ransomware.ok) setErrors((cur) => ({ ...cur, ransomware: env.ransomware.error ?? 'unknown' }));
        if (env.telegram.ok && env.telegram.data) setTelegram(env.telegram.data);
        else if (!env.telegram.ok) setErrors((cur) => ({ ...cur, telegram: env.telegram.error ?? 'unknown' }));
        if (env.onion.ok && env.onion.data) setOnion(env.onion.data);
        else if (!env.onion.ok) setErrors((cur) => ({ ...cur, onion: env.onion.error ?? 'unknown' }));
        if (env.scam.ok && env.scam.data) setScam(env.scam.data);
        else if (!env.scam.ok) setErrors((cur) => ({ ...cur, scam: env.scam.error ?? 'unknown' }));
        if (env.threat_intel.ok && env.threat_intel.data) setThreatIntel(env.threat_intel.data);
        else if (!env.threat_intel.ok)
          setErrors((cur) => ({ ...cur, threatIntel: env.threat_intel.error ?? 'unknown' }));
        if (env.tech_ai.ok && env.tech_ai.data) setTechAi(env.tech_ai.data);
        else if (!env.tech_ai.ok) setErrors((cur) => ({ ...cur, techAi: env.tech_ai.error ?? 'unknown' }));
        if (env.rules?.ok && env.rules.data) setRules(env.rules.data);
        else if (env.rules && !env.rules.ok) setErrors((cur) => ({ ...cur, rules: env.rules.error ?? 'unknown' }));
        if (env.briefings?.ok && env.briefings.data) setBriefings(env.briefings.data);
        else if (env.briefings && !env.briefings.ok)
          setErrors((cur) => ({ ...cur, briefings: env.briefings.error ?? 'unknown' }));
        if (env.threat_map?.ok && env.threat_map.data) setThreatMap(env.threat_map.data);
        else if (env.threat_map && !env.threat_map.ok)
          setErrors((cur) => ({ ...cur, threatMap: env.threat_map.error ?? 'unknown' }));
      } catch (e) {
        if (cancelled) return;
        // Single network failure blanks every card with the same error so
        // users know the issue is transport-level, not per-source.
        const msg = (e as Error).message;
        setErrors({
          ransomware: msg,
          telegram: msg,
          onion: msg,
          scam: msg,
          threatIntel: msg,
          techAi: msg,
          rules: msg,
          briefings: msg,
          threatMap: msg,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const itemLimit = compact ? 3 : 4;

  const recentVictims = useMemo(() => {
    if (!ransomware) return [];
    return ransomware.victims.filter((v) => withinWindow(v.discovered, 24)).slice(0, itemLimit);
  }, [ransomware, itemLimit]);

  const recentMessages = useMemo(() => {
    if (!telegram) return [];
    return telegram.items.slice(0, itemLimit);
  }, [telegram, itemLimit]);

  const reachablePct = onion ? Math.round((onion.reachable_count / Math.max(1, onion.groups.length)) * 100) : null;

  const recentScam = useMemo(() => {
    if (!scam) return [];
    return scam.items.slice(0, itemLimit);
  }, [scam, itemLimit]);

  const recentThreatIntel = useMemo(() => {
    if (!threatIntel) return [];
    return threatIntel.items.slice(0, itemLimit);
  }, [threatIntel, itemLimit]);

  const recentTechAi = useMemo(() => {
    if (!techAi) return [];
    return techAi.items.slice(0, itemLimit);
  }, [techAi, itemLimit]);

  const newRansomwareCount = useMemo(
    () => (ransomware ? ransomware.victims.filter((v) => isNewSince(v.discovered, lastVisit)).length : 0),
    [ransomware, lastVisit]
  );
  const newTelegramCount = useMemo(
    () => (telegram ? telegram.items.filter((m) => isNewSince(m.datetime, lastVisit)).length : 0),
    [telegram, lastVisit]
  );
  const newScamCount = useMemo(
    () => (scam ? scam.items.filter((it) => isNewSince(it.pubDate, lastVisit)).length : 0),
    [scam, lastVisit]
  );
  const newThreatIntelCount = useMemo(
    () => (threatIntel ? threatIntel.items.filter((it) => isNewSince(it.pubDate, lastVisit)).length : 0),
    [threatIntel, lastVisit]
  );
  const newTechAiCount = useMemo(
    () => (techAi ? techAi.items.filter((it) => isNewSince(it.pubDate, lastVisit)).length : 0),
    [techAi, lastVisit]
  );
  const totalNew = newRansomwareCount + newTelegramCount + newScamCount + newThreatIntelCount + newTechAiCount;

  // Per-card watchlist match counts — across the FULL response so the badge
  // reflects real matches, not just visible top-N.
  const watchedRansomware = useMemo(
    () =>
      ransomware
        ? ransomware.victims.filter(
            (v) => watchHits(`${v.victim} ${v.group} ${v.description ?? ''}`, watchlist).length > 0
          ).length
        : 0,
    [ransomware, watchlist]
  );
  const watchedTelegram = useMemo(
    () =>
      telegram
        ? telegram.items.filter((m) => watchHits(`${m.channel_name} ${m.text}`, watchlist).length > 0).length
        : 0,
    [telegram, watchlist]
  );
  const watchedOnion = useMemo(
    () => (onion ? onion.groups.filter((g) => watchHits(g.group, watchlist).length > 0).length : 0),
    [onion, watchlist]
  );
  const watchedScam = useMemo(
    () => (scam ? scam.items.filter((it) => watchHits(`${it.title} ${it.source}`, watchlist).length > 0).length : 0),
    [scam, watchlist]
  );
  const watchedThreatIntel = useMemo(
    () =>
      threatIntel
        ? threatIntel.items.filter((it) => watchHits(`${it.title} ${it.source}`, watchlist).length > 0).length
        : 0,
    [threatIntel, watchlist]
  );
  const watchedTechAi = useMemo(
    () =>
      techAi ? techAi.items.filter((it) => watchHits(`${it.title} ${it.source}`, watchlist).length > 0).length : 0,
    [techAi, watchlist]
  );
  const totalWatched =
    watchedRansomware + watchedTelegram + watchedOnion + watchedScam + watchedThreatIntel + watchedTechAi;

  return (
    <section className={mbClass}>
      {headerLabel !== null && (
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display font-bold text-xl inline-flex items-center gap-2 flex-wrap">
            {headerLabel}
            {lastVisit > 0 && totalNew > 0 && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                title={`${totalNew} new items since your last visit`}
              >
                {totalNew} new since last visit
              </span>
            )}
            {watchlist.length > 0 && totalWatched > 0 && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                title={`${totalWatched} items match your watchlist (${watchlist.join(', ')})`}
              >
                {totalWatched} watchlist hits
              </span>
            )}
          </h2>
          {subtitle && <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">{subtitle}</span>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Ransomware activity */}
        <SnapshotCard
          accent="rose"
          icon={Bell}
          title="Ransomware"
          newCount={newRansomwareCount}
          watchCount={watchedRansomware}
          watchTerms={watchlist}
          showNewBadge={lastVisit > 0}
          rightAction={
            <Link
              to="/threatintel/darkweb#ransomware"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              feed <ExternalLink size={9} />
            </Link>
          }
          loading={!ransomware}
          error={errors.ransomware}
          compact={compact}
        >
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
                    const matched = watchHits(`${v.victim} ${v.group} ${v.description ?? ''}`, watchlist);
                    return (
                      <li
                        key={`${v.group}-${v.victim}-${i}`}
                        className="flex items-baseline gap-2 text-[11px] font-mono py-0.5"
                      >
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            matched.length > 0 ? 'bg-violet-500' : isNew ? 'bg-amber-500' : 'bg-transparent'
                          }`}
                          aria-label={
                            matched.length > 0
                              ? `watchlist match: ${matched.join(', ')}`
                              : isNew
                                ? 'new since last visit'
                                : undefined
                          }
                          title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
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
                        <span className="text-slate-500 shrink-0">{shortRel(v.discovered)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Cybersec Telegram firehose — links to the DarkWeb panel which has the
            full filterable view; the Telegram catalog (/threatintel/telegram-watch) is
            the channel-discovery surface, not the message stream. */}
        <SnapshotCard
          accent="sky"
          icon={Send}
          title="Cybersec Telegram firehose"
          newCount={newTelegramCount}
          watchCount={watchedTelegram}
          watchTerms={watchlist}
          showNewBadge={lastVisit > 0}
          rightAction={
            <Link
              to="/threatintel/darkweb#telegram"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full feed <ExternalLink size={9} />
            </Link>
          }
          loading={!telegram}
          error={errors.telegram}
          compact={compact}
        >
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
                    const matched = watchHits(`${m.channel_name} ${m.text}`, watchlist);
                    return (
                      <li key={m.permalink} className="text-[11px] font-mono py-0.5">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              matched.length > 0 ? 'bg-violet-500' : isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={
                              matched.length > 0
                                ? `watchlist match: ${matched.join(', ')}`
                                : isNew
                                  ? 'new since last visit'
                                  : undefined
                            }
                            title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
                          />
                          <a
                            href={m.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-display font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 truncate flex-1 min-w-0"
                          >
                            {m.channel_name}
                          </a>
                          <span className="text-slate-500 shrink-0">{shortRel(m.datetime)}</span>
                        </div>
                        {!compact && (
                          <p className="text-slate-500 dark:text-slate-500 line-clamp-1 break-all pl-3.5">{m.text}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Onion watch */}
        <SnapshotCard
          accent="violet"
          icon={Globe2}
          title=".onion reachability"
          watchCount={watchedOnion}
          watchTerms={watchlist}
          showNewBadge={false}
          rightAction={
            <Link
              to="/threatintel/onion-watch"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full inventory <ExternalLink size={9} />
            </Link>
          }
          loading={!onion}
          error={errors.onion}
          compact={compact}
        >
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
                  .slice(0, compact ? 6 : 8)
                  .map((g) => {
                    const isWatched = watchHits(g.group, watchlist).length > 0;
                    return (
                      <Link
                        key={g.group}
                        to="/threatintel/onion-watch"
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          isWatched
                            ? 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                        }`}
                        title={isWatched ? 'watchlist match' : undefined}
                      >
                        {g.group}
                      </Link>
                    );
                  })}
                {onion.reachable_count > (compact ? 6 : 8) && (
                  <span className="text-[10px] font-mono text-slate-500">
                    +{onion.reachable_count - (compact ? 6 : 8)} more
                  </span>
                )}
              </div>
            </>
          )}
        </SnapshotCard>

        {/* Scam intel — FTC + IC3 official alerts */}
        <SnapshotCard
          accent="amber"
          icon={AlertTriangle}
          title="Scam intel"
          newCount={newScamCount}
          watchCount={watchedScam}
          watchTerms={watchlist}
          showNewBadge={lastVisit > 0}
          rightAction={
            <Link
              to="/threatintel/scam-watch"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full feed <ExternalLink size={9} />
            </Link>
          }
          loading={!scam}
          error={errors.scam}
          compact={compact}
        >
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
                    const matched = watchHits(`${it.title} ${it.source}`, watchlist);
                    return (
                      <li key={it.guid ?? it.link} className="text-[11px] font-mono py-0.5">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              matched.length > 0 ? 'bg-violet-500' : isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={
                              matched.length > 0
                                ? `watchlist match: ${matched.join(', ')}`
                                : isNew
                                  ? 'new since last visit'
                                  : undefined
                            }
                            title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
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
                          <span className="text-slate-500 shrink-0">{shortRel(it.pubDate)}</span>
                        </div>
                        {!compact && <p className="text-slate-500 dark:text-slate-500 truncate pl-3.5">{it.source}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Threat-intel firehose — BleepingComputer + Krebs + DFIR Report + SecurityWeek */}
        <SnapshotCard
          accent="emerald"
          icon={Newspaper}
          title="Threat intel"
          newCount={newThreatIntelCount}
          watchCount={watchedThreatIntel}
          watchTerms={watchlist}
          showNewBadge={lastVisit > 0}
          rightAction={
            <Link
              to="/threatintel/threat-feeds"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full feeds <ExternalLink size={9} />
            </Link>
          }
          loading={!threatIntel}
          error={errors.threatIntel}
          compact={compact}
        >
          {threatIntel && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                  {threatIntel.total_items}
                </span>{' '}
                posts · BleepingComputer · Krebs · DFIR Report · SecurityWeek
              </p>
              {recentThreatIntel.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No recent posts.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {recentThreatIntel.map((it) => {
                    const isNew = isNewSince(it.pubDate, lastVisit);
                    const matched = watchHits(`${it.title} ${it.source}`, watchlist);
                    return (
                      <li key={it.guid ?? it.link} className="text-[11px] font-mono py-0.5">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              matched.length > 0 ? 'bg-violet-500' : isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={
                              matched.length > 0
                                ? `watchlist match: ${matched.join(', ')}`
                                : isNew
                                  ? 'new since last visit'
                                  : undefined
                            }
                            title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
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
                          <span className="text-slate-500 shrink-0">{shortRel(it.pubDate)}</span>
                        </div>
                        {!compact && <p className="text-slate-500 dark:text-slate-500 truncate pl-3.5">{it.source}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Tech & AI news — TechCrunch AI / VentureBeat AI / TechCrunch security / cybersec funding */}
        <SnapshotCard
          accent="fuchsia"
          icon={Sparkles}
          title="Tech & AI"
          newCount={newTechAiCount}
          watchCount={watchedTechAi}
          watchTerms={watchlist}
          showNewBadge={lastVisit > 0}
          rightAction={
            <Link
              to="/threatintel/tech-ai-news"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full feeds <ExternalLink size={9} />
            </Link>
          }
          loading={!techAi}
          error={errors.techAi}
          compact={compact}
        >
          {techAi && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{techAi.total_items}</span>{' '}
                posts · TechCrunch · VentureBeat · HN AI · YC blog · cyber funding
              </p>
              {recentTechAi.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No recent posts.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {recentTechAi.map((it) => {
                    const isNew = isNewSince(it.pubDate, lastVisit);
                    const matched = watchHits(`${it.title} ${it.source}`, watchlist);
                    return (
                      <li key={it.guid ?? it.link} className="text-[11px] font-mono py-0.5">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              matched.length > 0 ? 'bg-violet-500' : isNew ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                            aria-label={
                              matched.length > 0
                                ? `watchlist match: ${matched.join(', ')}`
                                : isNew
                                  ? 'new since last visit'
                                  : undefined
                            }
                            title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
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
                          <span className="text-slate-500 shrink-0">{shortRel(it.pubDate)}</span>
                        </div>
                        {/* Tech & AI always shows source — analysts want to see when YC blog / HN surfaces. */}
                        <p className="text-slate-500 dark:text-slate-500 truncate pl-3.5">{it.source}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Detection rules — recent commits across upstream rule repos */}
        <SnapshotCard
          accent="blue"
          icon={FileCode}
          title="Detection rules"
          showNewBadge={false}
          rightAction={
            <Link
              to="/threatintel/rules"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              all rule repos <ExternalLink size={9} />
            </Link>
          }
          loading={!rules}
          error={errors.rules}
          compact={compact}
        >
          {rules && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                  {rules.recent_commits.length}
                </span>{' '}
                recent commits · {rules.sources_count} repos · Sigma · YARA · Suricata · SIEM
              </p>
              {rules.recent_commits.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No recent commits.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {rules.recent_commits.slice(0, itemLimit).map((cm, i) => (
                    <li key={`${cm.source_id}-${i}`} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                      <span className="text-[9px] uppercase tracking-wider px-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 shrink-0">
                        {cm.type}
                      </span>
                      <a
                        href={cm.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0"
                        title={`${decodeHtml(cm.title)} — ${cm.source_label}`}
                      >
                        {decodeHtml(cm.title)}
                      </a>
                      <span className="text-slate-500 shrink-0">{shortRel(cm.pubDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Threat briefings — latest daily/weekly KV-baked briefings */}
        <SnapshotCard
          accent="violet"
          icon={ScrollText}
          title="Threat briefings"
          showNewBadge={false}
          rightAction={
            <Link
              to="/threatintel/briefings"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              archive <ExternalLink size={9} />
            </Link>
          }
          loading={!briefings}
          error={errors.briefings}
          compact={compact}
        >
          {briefings && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{briefings.items.length}</span>{' '}
                most-recent · daily 00:05 · weekly Mon 00:15 UTC
              </p>
              {briefings.items.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No briefings yet.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {briefings.items.slice(0, itemLimit).map((b) => {
                    const m = b.metadata;
                    const stats = m.stats ?? {};
                    const findings = stats.findings ?? 0;
                    const iocs = stats.iocs ?? 0;
                    const critical = stats.critical ?? 0;
                    // Prefer date_range; fall back to slug-derived date.
                    const label = m.date_range ?? m.date ?? b.slug.replace(/^(daily|weekly)-/, '');
                    return (
                      <li key={b.slug} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1 rounded border shrink-0 ${
                            m.type === 'weekly'
                              ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                              : 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                          }`}
                        >
                          {m.type ?? 'daily'}
                        </span>
                        <Link
                          to={`/threatintel/briefings/${b.slug}`}
                          className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0"
                          title={m.title ?? b.slug}
                        >
                          {label}
                        </Link>
                        <span
                          className="text-slate-500 shrink-0 tabular-nums"
                          title={`${findings} findings · ${iocs} IOCs · ${critical} critical`}
                        >
                          {findings}f·{iocs}i{critical > 0 ? `·${critical}!` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Cyber threat map — top countries by malicious-IP count */}
        <SnapshotCard
          accent="orange"
          icon={Map}
          title="Cyber threat map"
          showNewBadge={false}
          rightAction={
            <Link
              to="/threatintel/threat-map"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
            >
              full map <ExternalLink size={9} />
            </Link>
          }
          loading={!threatMap}
          error={errors.threatMap}
          compact={compact}
        >
          {threatMap && (
            <>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{threatMap.total_ips}</span>{' '}
                geolocated IPs · {threatMap.countries.length} countries
              </p>
              {threatMap.countries.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-500">No geolocated indicators.</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {threatMap.countries.slice(0, itemLimit).map((c) => (
                    <li key={c.countryCode} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                      <span className="text-[9px] uppercase tracking-wider px-1 rounded border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 shrink-0">
                        {c.countryCode}
                      </span>
                      <Link
                        to="/threatintel/threat-map"
                        className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0"
                      >
                        {c.country}
                      </Link>
                      <span className="text-slate-500 shrink-0 tabular-nums">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>
      </div>
    </section>
  );
}
