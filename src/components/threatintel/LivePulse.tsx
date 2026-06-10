import { useEffect, useState } from 'react';
import { Flame, Radar, ShieldAlert, Activity } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { StatBand, StatCell, StatNumber, STAT_NUM, STAT_SUB, prefersReducedMotion } from '../StatBand';
import { dedupRansomwareVictims } from '../../lib/dedup-ransomware';

/**
 * LivePulse — the live "operations console" band at the top of /threatintel,
 * directly under the hero. Replaces the old static StatBar, which buried the
 * platform's one genuinely live asset: real threat telemetry. This surfaces it
 * as the page's hero moment — big animated counts, a breathing LIVE indicator,
 * and a real 14-day ransomware sparkline.
 *
 * Reuses the exact endpoints + bucketing the editorial cards already use, so
 * there is no new data contract:
 *   - /api/v1/ransomware-recent  → last-7d claim count, week-over-week delta,
 *                                   leader group, and a 14-day daily series.
 *   - /api/v1/briefings/list?limit=1 → today's IOC + critical/KEV counts.
 *   - /api/v1/detections        → the top-firing rule's match count.
 *
 * Loading renders a fixed-height skeleton so the band never shifts layout
 * (the documented CLS budget is tight). The count-up + LIVE pulse both honour
 * prefers-reduced-motion (count-up via duration 0; CSS animations are zeroed
 * globally by the reduced-motion block in index.css).
 */

interface RansomwareVictim {
  group: string;
  discovered: string;
}
interface Detection {
  rule_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  match_count: number;
}
interface BriefingItem {
  slug: string;
  metadata?: { stats?: { kevs?: number; iocs?: number; critical?: number } };
}

interface RansomMetric {
  count7: number;
  arrow: '▲' | '▼' | '→';
  trend: string;
  leader: string | null;
  series: number[];
}
interface BriefMetric {
  iocs: number;
  critical: number;
  kevs: number;
  slug: string;
}
interface DetMetric {
  matchCount: number;
  ruleName: string;
  severity: string;
}

const SEV_RANK: Record<Detection['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const DAY = 86_400_000;
const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10);

function computeRansom(victims: RansomwareVictim[]): RansomMetric {
  const now = Date.now();
  // 14 daily buckets, oldest → newest (index 13 = today). Same calendar-day
  // definition as TodaysRead / the metrics page, so all surfaces agree.
  const series = new Array<number>(14).fill(0);
  const bucketOf = new Map<string, number>();
  const last7 = new Set<string>();
  const prior7 = new Set<string>();
  for (let i = 0; i < 14; i += 1) {
    const k = dayKey(now - i * DAY);
    bucketOf.set(k, 13 - i);
    if (i < 7) last7.add(k);
    else prior7.add(k);
  }
  // Dedupe by (group + victim), keeping the earliest discovery date. The
  // upstream /api/v1/ransomware-recent already collapses same-day
  // (group, victim) dupes, but the same victim can still appear on
  // multiple days when different trackers index it 1-3 days apart. For a
  // "this group made N claims" surface each unique victim should count
  // once — same fix as src/pages/threatintel/Metrics.tsx.
  const deduped = dedupRansomwareVictims(victims);
  const groups = new Map<string, number>();
  let l7 = 0;
  let p7 = 0;
  for (const v of deduped) {
    const t = Date.parse(v.discovered);
    if (Number.isNaN(t)) continue;
    const k = dayKey(t);
    const idx = bucketOf.get(k);
    if (idx !== undefined) series[idx] += 1;
    if (last7.has(k)) {
      l7 += 1;
      groups.set(v.group, (groups.get(v.group) ?? 0) + 1);
    } else if (prior7.has(k)) {
      p7 += 1;
    }
  }
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  let arrow: RansomMetric['arrow'] = '→';
  let trend = 'no prior-week baseline';
  if (p7 === 0 && l7 === 0) {
    trend = 'no activity in 7d';
  } else if (p7 === 0) {
    arrow = '▲';
    trend = 'first activity';
  } else {
    const pct = ((l7 - p7) / p7) * 100;
    arrow = pct > 10 ? '▲' : pct < -10 ? '▼' : '→';
    trend = `${Math.abs(Math.round(pct))}% vs prior 7d`;
  }
  return { count7: l7, arrow, trend, leader: top ? top[0] : null, series };
}

function extractBrief(item: BriefingItem | undefined): BriefMetric | null {
  if (!item) return null;
  const s = item.metadata?.stats ?? {};
  return { iocs: s.iocs ?? 0, critical: s.critical ?? 0, kevs: s.kevs ?? 0, slug: item.slug };
}

function pickTopDetection(items: Detection[]): DetMetric | null {
  const top = [...items].sort((a, b) =>
    SEV_RANK[a.severity] !== SEV_RANK[b.severity]
      ? SEV_RANK[a.severity] - SEV_RANK[b.severity]
      : b.match_count - a.match_count
  )[0];
  return top ? { matchCount: top.match_count, ruleName: top.rule_name, severity: top.severity } : null;
}

const DASH = <span className={`${STAT_NUM} text-slate-400`}>—</span>;

export function LivePulse(): JSX.Element {
  const reduce = prefersReducedMotion();
  const [data, setData] = useState<{
    ransom: RansomMetric | null;
    brief: BriefMetric | null;
    det: DetMetric | null;
  } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const get = (url: string) =>
      fetch(url, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    void (async () => {
      const [r, b, d] = await Promise.allSettled([
        get('/api/v1/ransomware-recent'),
        get('/api/v1/briefings/list?limit=1'),
        get('/api/v1/detections'),
      ]);
      if (!alive) return;
      setData({
        ransom:
          r.status === 'fulfilled' ? computeRansom((r.value as { victims?: RansomwareVictim[] }).victims ?? []) : null,
        brief: b.status === 'fulfilled' ? extractBrief((b.value as { items?: BriefingItem[] }).items?.[0]) : null,
        det:
          d.status === 'fulfilled'
            ? pickTopDetection((d.value as { detections?: Detection[] }).detections ?? [])
            : null,
      });
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  const indicator = (
    <>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono text-mini uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
        Live · platform telemetry
      </span>
    </>
  );
  const note = (
    <span className="hidden font-mono text-micro uppercase tracking-[0.18em] text-slate-400 sm:inline">
      edge-cached
    </span>
  );

  return (
    <StatBand ariaLabel="Live platform telemetry" indicator={indicator} note={note}>
      {data === null ? (
        [0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-[7rem] flex-col gap-3 bg-white px-4 py-4 dark:bg-slate-900/60 sm:px-5">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-9 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-auto h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))
      ) : (
        <>
          {/* Ransomware — last 7d, with delta + 14-day sparkline */}
          <StatCell
            to="/threatintel/metrics"
            label="Ransomware · 7d"
            icon={<Flame size={14} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />}
            iconClass="bg-rose-500/10"
            ariaLabel={
              data.ransom
                ? `Ransomware last 7 days: ${data.ransom.count7} claims, ${data.ransom.trend}. Open metrics.`
                : 'Ransomware data unavailable.'
            }
          >
            {data.ransom ? (
              <>
                <div className="flex items-end justify-between gap-2">
                  <span className="flex items-baseline gap-1.5">
                    <StatNumber
                      value={data.ransom.count7}
                      reduce={reduce}
                      className={`${STAT_NUM} text-rose-600 dark:text-rose-400`}
                    />
                    <span
                      className={`text-sm font-bold ${data.ransom.arrow === '▲' ? 'text-rose-500' : data.ransom.arrow === '▼' ? 'text-emerald-500' : 'text-slate-400'}`}
                      aria-hidden="true"
                    >
                      {data.ransom.arrow}
                    </span>
                  </span>
                  <Sparkline values={data.ransom.series} className="shrink-0 text-rose-500/80 dark:text-rose-400/80" />
                </div>
                <p className={STAT_SUB}>
                  {data.ransom.trend}
                  {data.ransom.leader ? (
                    <>
                      {' · '}
                      <span className="text-slate-600 dark:text-slate-300">{data.ransom.leader}</span>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                {DASH}
                <p className={STAT_SUB}>feed warming</p>
              </>
            )}
          </StatCell>

          {/* IOCs in today's briefing */}
          <StatCell
            to="/threatintel/live-iocs"
            label="IOCs · today"
            icon={<Radar size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />}
            iconClass="bg-brand-500/10"
            ariaLabel={
              data.brief ? `${data.brief.iocs} IOCs in today's briefing. Open live IOCs.` : 'IOC data unavailable.'
            }
          >
            {data.brief ? (
              <StatNumber
                value={data.brief.iocs}
                reduce={reduce}
                className={`${STAT_NUM} text-brand-600 dark:text-brand-400`}
              />
            ) : (
              DASH
            )}
            <p className={STAT_SUB}>{data.brief ? "in today's briefing" : 'briefing warming'}</p>
          </StatCell>

          {/* Critical / KEV from today's briefing */}
          <StatCell
            to={data.brief ? `/threatintel/briefings/${data.brief.slug}` : '/threatintel/briefings'}
            label="Critical · KEV"
            icon={<ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            iconClass="bg-amber-500/10"
            ariaLabel={
              data.brief
                ? `${data.brief.critical} critical, ${data.brief.kevs} KEV-listed. Open the briefing.`
                : 'Briefing unavailable.'
            }
          >
            {data.brief ? (
              <StatNumber
                value={data.brief.critical}
                reduce={reduce}
                className={`${STAT_NUM} text-amber-600 dark:text-amber-400`}
              />
            ) : (
              DASH
            )}
            <p className={STAT_SUB}>
              {data.brief ? `${data.brief.kevs.toLocaleString()} KEV-listed` : 'briefing warming'}
            </p>
          </StatCell>

          {/* Top-firing detection */}
          <StatCell
            to="/threatintel/detections"
            label="Top detection"
            icon={<Activity size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
            iconClass="bg-emerald-500/10"
            ariaLabel={
              data.det
                ? `Top firing detection: ${data.det.ruleName}, ${data.det.matchCount} indicators matched. Open detections.`
                : 'Detection feed unavailable.'
            }
          >
            {data.det ? (
              <span className="flex items-baseline gap-1.5">
                <StatNumber
                  value={data.det.matchCount}
                  reduce={reduce}
                  className={`${STAT_NUM} text-emerald-600 dark:text-emerald-400`}
                />
                <span className="font-mono text-mini text-slate-500">matched</span>
              </span>
            ) : (
              DASH
            )}
            <p className={`${STAT_SUB} truncate`}>{data.det ? data.det.ruleName : 'rule pack warming'}</p>
          </StatCell>
        </>
      )}
    </StatBand>
  );
}
