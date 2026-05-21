import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Hero-section sparkline that renders the last 30 days of ransomware
 * leak-site claims as thin SVG bars directly below the main headline.
 * Decision rationale: the headline says "investigating attacks at human
 * scale, building defenders at AI scale" — without a piece of live data
 * underneath, the headline is just a line. With one, the headline is a
 * thesis statement backed by real numbers the visitor can verify by
 * clicking through to /threatintel/ransomware-activity.
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

interface ComputedBars {
  bars: number[];
  /** Index of the peak bar (highlighted), or -1 if all zero. */
  peakIdx: number;
  /** Display max — at least 1 so we never divide by zero. */
  max: number;
  /** Total claims across the 30 days. Used in the caption. */
  total: number;
}

function emptyBars(): ComputedBars {
  return { bars: Array(30).fill(0), peakIdx: -1, max: 1, total: 0 };
}

function computeBars(victims: RansomwareVictim[]): ComputedBars {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 29; i >= 0; i -= 1) {
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

export function HeroLiveSparkline(): JSX.Element {
  const [data, setData] = useState<ComputedBars | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/ransomware-recent');
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        const j = (await r.json()) as { victims?: RansomwareVictim[] };
        if (cancelled) return;
        setData(computeBars(j.victims ?? []));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render contract: while loading or failed, show the same 30-bar strip
  // at a flat 30% height. Keeps the hero layout fixed regardless of
  // network outcome (no CLS, no spinner, no error message in the hero).
  const display = data ?? emptyBars();
  const isLive = data !== null && !failed;

  // SVG geometry: 30 bars across, 36px tall, 2px gutter.
  const BARS = 30;
  const GAP = 2;
  const HEIGHT = 36;
  // Width is responsive (viewBox scales), so we pick a unit width for
  // each bar that produces a clean integer total in the viewBox.
  const BAR_W = 8;
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
            ? `Ransomware leak-site claims, last 30 days. ${display.total} total claims, peak day ${display.bars[display.peakIdx]} claims.`
            : 'Ransomware claim cadence, awaiting live data.'}
        </title>
        {display.bars.map((v, i) => {
          // Placeholder strip uses a flat 30% height so the visual rhythm
          // is preserved even before data lands. Once data is in, bars
          // scale to the 30-day max.
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
      <div className="mt-1.5 flex items-baseline justify-between text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
        <span>
          {isLive ? (
            <>
              ransomware claims · last 30d ·{' '}
              <span className="text-brand-600 dark:text-brand-400">{display.total} total</span>
            </>
          ) : failed ? (
            'ransomware cadence · live data unavailable'
          ) : (
            'ransomware cadence · loading'
          )}
        </span>
        <Link
          to="/threatintel/ransomware-activity"
          className="text-brand-600 dark:text-brand-400 hover:underline normal-case tracking-normal"
        >
          /threatintel ↗
        </Link>
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
