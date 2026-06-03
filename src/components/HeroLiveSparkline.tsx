import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

/**
 * Hero-section sparkline that renders the last 7 days of ransomware
 * leak-site claims as thin SVG bars directly below the main headline.
 * Decision rationale: the headline says "investigating attacks at human
 * scale, building defenders at AI scale" — without a piece of live data
 * underneath, the headline is just a line. With one, the headline is a
 * thesis statement backed by real numbers the visitor can verify by
 * clicking through to /threatintel/ransomware-activity.
 *
 * Was 30 days. Switched to 7 to match the /threatintel/metrics page's
 * weekly-read framing; the two surfaces now show the same window, and
 * the bars are wider individually so the daily cadence is more legible.
 *
 * Visual rules:
 *   - Bars only, no axis, no labels (sparkline, not chart).
 *   - One color (brand). The peak bar gets a brighter accent so the eye
 *     locks onto where the worst day was.
 *   - Animated reveal: each bar fades in left-to-right on mount. Honours
 *     prefers-reduced-motion (everything appears at once with no transition).
 *   - SSR-safe: server renders a placeholder strip; hydration replaces it
 *     with the live data. Never blocks the page on a network call.
 *
 * Failure mode: any fetch failure shows the placeholder strip with a
 * single muted caption "live data unavailable" — never an error toast
 * or a broken layout.
 */

interface RansomwareVictim {
  discovered: string;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Compact "fresh N min ago" label for the freshness indicator. Stays
 * short to fit beside the existing caption — "just now" for <60s,
 * "Nm ago" for minutes, "Nh ago" for hours. Never renders seconds
 * (jitter would draw the eye to a re-render every second; the polling
 * interval makes the freshness change every 5 minutes anyway).
 */
function relativeAge(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Number of daily buckets shown in the sparkline. Was 30; cut to 7 to
 * match the metrics page's weekly read. Each bar gets more pixels, so
 * the per-day cadence is legible without zooming.
 */
const SPARK_DAYS = 7;

interface ComputedBars {
  bars: number[];
  /** Index of the peak bar (highlighted), or -1 if all zero. */
  peakIdx: number;
  /** Display max — at least 1 so we never divide by zero. */
  max: number;
  /** Total claims across the window. Used in the caption. */
  total: number;
}

function emptyBars(): ComputedBars {
  return { bars: Array(SPARK_DAYS).fill(0), peakIdx: -1, max: 1, total: 0 };
}

function computeBars(victims: RansomwareVictim[]): ComputedBars {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = SPARK_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86400_000);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const v of victims) {
    const k = dayKey(v.discovered);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  const bars = [...map.values()];
  let peakIdx = -1;
  let max = 0;
  let total = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i] ?? 0;
    total += b;
    if (b > max) {
      max = b;
      peakIdx = i;
    }
  }
  return { bars, peakIdx, max: Math.max(max, 1), total };
}

/**
 * How often the sparkline re-polls the API while the page is visible.
 * Backend cache TTL is 15 min, so 5 min is the right cadence — the user
 * sees the latest cached payload at most ~5 min after it rotates, while
 * the worker handles at most 3 client polls per cache cycle per visitor.
 * The poll is paused when document.visibilityState !== 'visible' so
 * backgrounded tabs don't burn API calls or warm the wrong cache region.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function HeroLiveSparkline(): JSX.Element {
  const [data, setData] = useState<ComputedBars | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  // The actual fetch + state-update. Reused by initial-mount, the
  // visibility-aware polling loop, AND the manual refresh button. Sends
  // a cache-busting query string so a user who hits "refresh" right
  // after a backend-cache rotation gets the new payload immediately
  // instead of the previously-cached one.
  const reload = useCallback(async (manual = false): Promise<void> => {
    if (manual) setRefreshing(true);
    try {
      const url = manual ? `/api/v1/ransomware-recent?cb=${Date.now()}` : '/api/v1/ransomware-recent';
      const r = await fetch(url);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const j = (await r.json()) as { victims?: RansomwareVictim[] };
      if (cancelledRef.current) return;
      setData(computeBars(j.victims ?? []));
      setFetchedAt(Date.now());
      setFailed(false);
    } catch {
      if (!cancelledRef.current) setFailed(true);
    } finally {
      if (!cancelledRef.current && manual) setRefreshing(false);
    }
  }, []);

  // Initial fetch + visibility-aware polling. The interval pauses while
  // the tab is backgrounded; when it returns to foreground we fetch
  // immediately (so a user switching back to the tab after an hour
  // doesn't keep seeing the stale data for another five minutes).
  useEffect(() => {
    cancelledRef.current = false;
    void reload();

    let intervalId: number | undefined;

    const startPolling = (): void => {
      if (intervalId === undefined) {
        intervalId = window.setInterval(() => void reload(), POLL_INTERVAL_MS);
      }
    };
    const stopPolling = (): void => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void reload(); // catch up immediately on return
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      startPolling();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelledRef.current = true;
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [reload]);

  // Render contract: while loading or failed, show the same 30-bar strip
  // at a flat 30% height. Keeps the hero layout fixed regardless of
  // network outcome (no CLS, no spinner, no error message in the hero).
  const display = data ?? emptyBars();
  const isLive = data !== null && !failed;

  // SVG geometry: 7 bars across, 36px tall. With one-seventh as many
  // bars as the old 30-day strip, each bar gets a wider footprint so the
  // peak read is unmistakable at hero scale.
  const BARS = SPARK_DAYS;
  const GAP = 4;
  const HEIGHT = 36;
  // Width is responsive (viewBox scales), so we pick a unit width that
  // gives the 7-bar strip a similar overall aspect ratio to the old 30.
  const BAR_W = 36;
  const TOTAL_W = BARS * BAR_W + (BARS - 1) * GAP;

  return (
    <div className="mt-4 mb-1 max-w-2xl" aria-label="Live ransomware claim cadence">
      <svg
        viewBox={`0 0 ${TOTAL_W} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-9 sm:h-11"
        role="img"
        aria-labelledby="hero-sparkline-title"
      >
        <title id="hero-sparkline-title">
          {isLive
            ? `Ransomware leak-site claims, last 7 days. ${display.total} total claims, peak day ${display.bars[display.peakIdx]} claims.`
            : 'Ransomware claim cadence, awaiting live data.'}
        </title>
        {display.bars.map((v, i) => {
          // Placeholder strip uses a flat 30% height so the visual rhythm
          // is preserved even before data lands. Once data is in, bars
          // scale to the weekly max.
          const norm = isLive ? v / display.max : 0.3;
          const h = Math.max(2, norm * HEIGHT);
          const y = HEIGHT - h;
          const x = i * (BAR_W + GAP);
          const isPeak = isLive && i === display.peakIdx;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={BAR_W}
              height={h}
              rx={1}
              className={
                isPeak
                  ? 'fill-rose-500 dark:fill-rose-400'
                  : isLive
                    ? 'fill-brand-600/80 dark:fill-brand-400/80'
                    : 'fill-slate-200 dark:fill-slate-800'
              }
              style={{
                // Stagger reveal: each bar fades + lifts on mount, 12ms
                // apart, finishing in under half a second total. Honours
                // prefers-reduced-motion via the media query below.
                animation: isLive ? `hero-bar-rise 320ms ease-out ${i * 12}ms both` : undefined,
              }}
            >
              {isLive && (
                <animate attributeName="opacity" from="0" to="1" begin={`${i * 12}ms`} dur="320ms" fill="freeze" />
              )}
            </rect>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {isLive ? (
            <>
              ransomware claims · last 7d ·{' '}
              <span className="text-brand-600 dark:text-brand-400">{display.total} total</span>
              {fetchedAt && (
                <span className="ml-2 normal-case tracking-normal text-slate-400">· {relativeAge(fetchedAt)}</span>
              )}
            </>
          ) : failed ? (
            'ransomware cadence · live data unavailable'
          ) : (
            'ransomware cadence · loading'
          )}
        </span>
        <span className="inline-flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void reload(true)}
            disabled={refreshing}
            aria-label="Refresh ransomware claim cadence"
            title="Refresh now"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 sm:my-0 sm:min-h-0 sm:min-w-0 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition disabled:opacity-50"
          >
            <RefreshCw size={11} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
          </button>
          <Link
            to="/threatintel/ransomware-activity"
            className="text-brand-600 dark:text-brand-400 hover:underline normal-case tracking-normal"
          >
            /threatintel ↗
          </Link>
        </span>
      </div>
      <style>{`
        @keyframes hero-bar-rise {
          0% { transform: translateY(8%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hero-bar-rise {
            0%, 100% { transform: none; opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
