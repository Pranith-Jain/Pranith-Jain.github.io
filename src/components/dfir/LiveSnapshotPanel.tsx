import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Send, ExternalLink, AlertTriangle, Newspaper, Sparkles, ScrollText } from 'lucide-react';
import { type AggregatedFeedResponse } from '../../services/rssService';
import { SnapshotCard } from './SnapshotCard';
import { useWatchlist, watchHits } from './useWatchlist';
import { shortRel } from '../../lib/relativeTime';

/**
 * Live "right now" snapshot — 6 cards: Ransomware claims, Cybersec
 * Telegram firehose, Scam intel (FTC + IC3), Threat intel firehose,
 * Tech & AI news, Threat briefings. Mounts on /threatintel landing.
 *
 * Behaviour notes:
 * - ONE fetch to /api/v1/snapshot fans out server-side; each card reads
 *   a slice of the envelope. A single bad upstream marks ONE card as
 *   errored, never blanks the panel.
 * - "What's new since last visit" highlights items whose timestamp is
 *   newer than the localStorage `dfir.briefings.last_visit` baseline.
 *   Baseline captured at mount, overwritten with `now` on unmount.
 * - The localStorage key is shared across every place we mount the
 *   panel — visiting one page resets the baseline so the user doesn't
 *   see the same "12 new" pill on the next page.
 *
 * Card removals 2026-05-11:
 *   - .onion reachability  → moved to /threatintel/onion-watch page
 *   - Detection rules      → moved to /threatintel/rules page
 *   - Cyber threat map     → moved to /threatintel/threat-map page
 * The /api/v1/snapshot envelope still ships `onion`, `rules`, and
 * `threat_map` fields — we just don't render them here.
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
  // onion / rules / threat_map still ship in the envelope but the
  // corresponding cards were removed 2026-05-11. Typed as unknown so
  // the panel doesn't pretend to consume them.
  onion?: SnapshotEnvelope<unknown>;
  scam: SnapshotEnvelope<AggregatedFeedResponse>;
  threat_intel: SnapshotEnvelope<AggregatedFeedResponse>;
  tech_ai: SnapshotEnvelope<AggregatedFeedResponse>;
  rules?: SnapshotEnvelope<unknown>;
  briefings: SnapshotEnvelope<BriefingsResp>;
  threat_map?: SnapshotEnvelope<unknown>;
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
  const [scam, setScam] = useState<AggregatedFeedResponse | null>(null);
  const [threatIntel, setThreatIntel] = useState<AggregatedFeedResponse | null>(null);
  const [techAi, setTechAi] = useState<AggregatedFeedResponse | null>(null);
  const [briefings, setBriefings] = useState<BriefingsResp | null>(null);
  const [errors, setErrors] = useState<{
    ransomware?: string;
    telegram?: string;
    scam?: string;
    threatIntel?: string;
    techAi?: string;
    briefings?: string;
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
        if (env.scam.ok && env.scam.data) setScam(env.scam.data);
        else if (!env.scam.ok) setErrors((cur) => ({ ...cur, scam: env.scam.error ?? 'unknown' }));
        if (env.threat_intel.ok && env.threat_intel.data) setThreatIntel(env.threat_intel.data);
        else if (!env.threat_intel.ok)
          setErrors((cur) => ({ ...cur, threatIntel: env.threat_intel.error ?? 'unknown' }));
        if (env.tech_ai.ok && env.tech_ai.data) setTechAi(env.tech_ai.data);
        else if (!env.tech_ai.ok) setErrors((cur) => ({ ...cur, techAi: env.tech_ai.error ?? 'unknown' }));
        if (env.briefings?.ok && env.briefings.data) setBriefings(env.briefings.data);
        else if (env.briefings && !env.briefings.ok)
          setErrors((cur) => ({ ...cur, briefings: env.briefings.error ?? 'unknown' }));
        // env.onion / env.rules / env.threat_map come through the snapshot
        // payload but the corresponding cards were removed 2026-05-11 — we
        // intentionally drop those fields here.
      } catch (e) {
        if (cancelled) return;
        // Single network failure blanks every card with the same error so
        // users know the issue is transport-level, not per-source.
        const msg = (e as Error).message;
        setErrors({
          ransomware: msg,
          telegram: msg,
          scam: msg,
          threatIntel: msg,
          techAi: msg,
          briefings: msg,
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
  const totalWatched = watchedRansomware + watchedTelegram + watchedScam + watchedThreatIntel + watchedTechAi;

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
              to="/threatintel/ransomware-activity"
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
                          role={matched.length > 0 || isNew ? 'img' : undefined}
                          aria-label={
                            matched.length > 0
                              ? `watchlist match: ${matched.join(', ')}`
                              : isNew
                                ? 'new since last visit'
                                : undefined
                          }
                          aria-hidden={matched.length === 0 && !isNew ? true : undefined}
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

        {/* Cybersec Telegram firehose — links to the dedicated /threatintel/cybersec
            page which has the full filterable view; the Telegram catalog
            (/threatintel/telegram-watch) is the channel-discovery surface, not the
            message stream. */}
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
              to="/threatintel/cybersec"
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

        {/* .onion reachability card removed 2026-05-11 — too noisy on the
            landing (the inventory page at /threatintel/onion-watch is the
            right place for that depth of detail; the card competed for
            attention with higher-signal sources). */}

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
                        {/* Tech & AI shows source for non-compact only — analysts want to see when YC blog / HN surfaces. */}
                        {!compact && <p className="text-slate-500 dark:text-slate-500 truncate pl-3.5">{it.source}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SnapshotCard>

        {/* Detection rules card removed 2026-05-11 — committers fire all
            day on Sigma / Elastic / Sentinel repos so the card was always
            full and rarely actionable from the landing. The full feed is
            still live at /threatintel/rules. */}

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

        {/* Cyber threat map card removed 2026-05-11 — the country-leaderboard
            duplicates what the full /threatintel/threat-map page does better.
            The card on the landing competed with higher-signal cards. */}
      </div>
    </section>
  );
}
