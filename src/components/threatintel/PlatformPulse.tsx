import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * 7-day "platform pulse" sparkline shown at the top of /threatintel.
 *
 * Drives off /api/v1/briefings/list — the daily-briefing cron stores
 * per-day IOC and finding counts, so we have honest historical data
 * for those two metrics. Per-source / per-tile sparklines would need
 * new backend cron-aggregated history we don't currently have, so
 * this is the realistic version.
 *
 * Two inline-SVG sparklines side-by-side:
 *   - IOCs / day (URLhaus + ThreatFox + MalwareBazaar + … merged)
 *   - Findings / day (KEV-window CVEs + NVD critical/high in window)
 *
 * Plus a trend arrow comparing the current 7-day median against the
 * previous 7-day median.
 *
 * Silent if the briefings endpoint returns fewer than 2 days of data
 * (sparkline needs at least 2 points to render a line) or fails.
 */

interface BriefingItem {
  slug: string;
  metadata?: {
    date?: string;
    range_end?: string;
    stats?: {
      iocs?: number;
      findings?: number;
      cves?: number;
    };
  };
}

interface BriefingsListResp {
  items?: BriefingItem[];
}

const WINDOW_DAYS = 7;

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Percentage change vs the prior window.
 *
 * Returns `NaN` to mean "no comparable baseline" — when the prior 7-day
 * median is 0 (a quiet stretch, or a source like MyThreatIntel that only
 * entered the briefing history part-way through the window). The old code
 * reported a flat `+100%` here, which read as a real doubling when it was
 * really just "new data, nothing to compare against" — misleading on the
 * landing pulse. The badge renders this case as "new" instead.
 */
function pctChange(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : NaN;
  return ((current - prior) / prior) * 100;
}

function Sparkline({ values, color }: { values: number[]; color: string }): JSX.Element {
  const W = 120;
  const H = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = (values.length - 1) * step;
  const lastY = H - ((values[values.length - 1]! - min) / range) * (H - 4) - 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

function TrendBadge({ change }: { change: number }): JSX.Element {
  // No comparable prior baseline → "new", not a fake +100%.
  if (!Number.isFinite(change)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-500"
        title="No comparable prior 7-day baseline"
      >
        <Minus size={11} aria-hidden="true" />
        <span>new</span>
      </span>
    );
  }
  const rounded = Math.round(change);
  const Icon = rounded > 3 ? TrendingUp : rounded < -3 ? TrendingDown : Minus;
  const cls =
    rounded > 3
      ? 'text-rose-600 dark:text-rose-400'
      : rounded < -3
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-500 dark:text-slate-500';
  const sign = rounded > 0 ? '+' : '';
  // Clamp the *display* so a one-off source step-change (e.g. MyThreatIntel
  // onboarding) reads as ">999%" instead of a meaningless five-digit number.
  // Icon/colour still key off the true rounded value.
  const capped = Math.abs(rounded) > 999;
  const shown = capped ? 999 : Math.abs(rounded);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums ${cls}`}
      title={`${sign}${rounded}% vs the median of the prior 6 days in the chart`}
    >
      <Icon size={11} aria-hidden="true" />
      <span>
        {capped ? (rounded < 0 ? '<-' : '>+') : sign}
        {shown}%
      </span>
    </span>
  );
}

export function PlatformPulse(): JSX.Element | null {
  const [briefings, setBriefings] = useState<BriefingItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/briefings/list?limit=14&type=daily')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: BriefingsListResp) => {
        if (!cancelled) setBriefings(j.items ?? []);
      })
      .catch(() => {
        // Silent — sparkline is decorative; don't break the landing if briefings are down.
        if (!cancelled) setBriefings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sort newest-first so slice(0,7) takes the most recent 7 days, then
  // reverse for chronological left-to-right display.
  const { iocsSeries, findingsSeries, iocsChange, findingsChange, latestDate } = useMemo(() => {
    if (!briefings || briefings.length < 2) {
      return {
        iocsSeries: [] as number[],
        findingsSeries: [] as number[],
        iocsChange: 0,
        findingsChange: 0,
        latestDate: null as string | null,
      };
    }
    const sorted = [...briefings].sort((a, b) => {
      const ad = a.metadata?.date ?? '';
      const bd = b.metadata?.date ?? '';
      return bd.localeCompare(ad);
    });
    const recent = sorted.slice(0, WINDOW_DAYS).reverse();
    return {
      iocsSeries: recent.map((b) => b.metadata?.stats?.iocs ?? 0),
      findingsSeries: recent.map((b) => b.metadata?.stats?.findings ?? 0),
      // New trend math (2026-05-22): the old logic compared the median of
      // the recent 7 days against the median of the prior 7 days. That's a
      // valid weekly signal but it disagrees with what the sparkline shows
      // — today can be a clear spike while the trailing weekly median is
      // still down. Visitors saw a green ▼ next to a chart line going
      // sharply up and the contradiction undercut both readings.
      //
      // Switched to: today's value (newest briefing) vs the median of the
      // prior 6 visible days in the chart. That matches what the eye sees
      // — the sparkline's last point versus the rest of the chart. More
      // volatile day-to-day, but volatility *is* the signal at this
      // cadence, and it stops the chart-vs-badge contradiction.
      iocsChange: pctChange(
        sorted[0]?.metadata?.stats?.iocs ?? 0,
        median(sorted.slice(1, WINDOW_DAYS).map((b) => b.metadata?.stats?.iocs ?? 0))
      ),
      findingsChange: pctChange(
        sorted[0]?.metadata?.stats?.findings ?? 0,
        median(sorted.slice(1, WINDOW_DAYS).map((b) => b.metadata?.stats?.findings ?? 0))
      ),
      latestDate: sorted[0]?.metadata?.date ?? null,
    };
  }, [briefings]);

  if (iocsSeries.length < 2) return null;

  const iocsLast = iocsSeries[iocsSeries.length - 1] ?? 0;
  const findingsLast = findingsSeries[findingsSeries.length - 1] ?? 0;

  // Friendly date label for the "as-of" line. Daily briefings are
  // retrospective (the 2026-05-20 briefing is generated on 2026-05-21),
  // so labeling the value "today's count" is technically wrong and was
  // masking real staleness on the findings number. Show the actual
  // date the value came from instead.
  const asOf = latestDate
    ? new Date(`${latestDate}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <section
      aria-label="7-day platform pulse"
      className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          7-day platform pulse
        </h2>
        <Link
          to="/threatintel/briefings"
          className="text-[11px] font-mono text-slate-500 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
        >
          see briefings →
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          to="/threatintel/briefings"
          className="flex items-center gap-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 p-3 hover:border-brand-500/40 transition-colors"
        >
          <Sparkline values={iocsSeries} color="#2c3ee5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">IOCs / day</span>
              <TrendBadge change={iocsChange} />
            </div>
            <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {iocsLast.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {asOf ? `latest daily · ${asOf}` : 'latest daily count'} · {WINDOW_DAYS}-day series
            </div>
          </div>
        </Link>
        <Link
          to="/threatintel/briefings"
          className="flex items-center gap-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 p-3 hover:border-brand-500/40 transition-colors"
        >
          <Sparkline values={findingsSeries} color="#e11d48" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Findings / day</span>
              <TrendBadge change={findingsChange} />
            </div>
            <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {findingsLast.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {asOf ? `latest daily · ${asOf}` : 'latest daily count'} · {WINDOW_DAYS}-day series
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
