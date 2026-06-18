import { useEffect, useState } from 'react';
import { Flame, ShieldAlert, Radio } from 'lucide-react';
import { StatBand, StatCell, StatNumber, STAT_NUM, STAT_SUB, prefersReducedMotion } from '../StatBand';
import { dedupRansomwareVictims } from '../../lib/dedup-ransomware';

/**
 * LivePulse — the live "operations console" band at the top of /threatintel,
 * directly under the hero. Mirrors the same three tiles the portfolio root
 * (`Live from the platform · updated on load` strip) renders, so a visitor
 * who lands on /threatintel sees the exact same one-breath read of the
 * platform's live state:
 *
 *   1. Ransomware claims · last 24h        → /api/v1/ransomware-recent
 *   2. Top firing detection                → /api/v1/detections
 *   3. Cross-source IOC consensus          → /api/v1/ioc-correlation
 *
 * Same endpoints, same dedupe, same 18-feed scope copy as the root strip —
 * the only intentional diff is the band chrome (3-tile grid here vs 3-tile
 * strip on the home page) and the "Live · platform telemetry" header which
 * /threatintel owns. Data is fetched once on mount, "updated on load" — no
 * polling. Repeat visitors hit the worker edge cache and pay no upstream
 * cost.
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
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  match_count: number;
}
interface CorrelationResponse {
  totals: {
    indicators_scanned: number;
    correlated_indicators: number;
  };
}

interface Ransom24hMetric {
  /** Unique-victim count in the last 24h, after the (group, victim) dedupe
   *  that src/lib/dedup-ransomware.ts applies. */
  count: number;
  /** Dominant ransomware group for the same 24h window, with claim count. */
  topGroup: { name: string; count: number } | null;
}
interface TopDetMetric {
  matchCount: number;
  ruleName: string;
  severity: Detection['severity'];
}
interface ConsensusMetric {
  correlated: number;
  scanned: number;
}

/** 24h filter matching src/components/LiveSignalStrip.tsx so the two
 *  surfaces agree on "today" — same instant math, same dedupe. */
function within24h(iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 86_400_000;
}

function computeRansom24h(victims: RansomwareVictim[]): Ransom24hMetric {
  const recent = dedupRansomwareVictims(victims).filter((v) => within24h(v.discovered));
  const counts = new Map<string, number>();
  for (const v of recent) counts.set(v.group, (counts.get(v.group) ?? 0) + 1);
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return {
    count: recent.length,
    topGroup: name && count > 0 ? { name, count } : null,
  };
}

function pickTopDetection(items: Detection[]): TopDetMetric | null {
  const SEV_RANK: Record<Detection['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
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
    ransom: Ransom24hMetric | null;
    det: TopDetMetric | null;
    cons: ConsensusMetric | null;
  } | null>(null);

  // "updated on load" — one fetch pass on mount, no polling. The underlying
  // endpoints are 1h edge-cached at the worker (snapshot.ts / detections.ts /
  // ioc-correlation.ts) so repeat visitors pay no upstream cost. Abort on
  // unmount so a fast nav away from /threatintel doesn't leak listeners.
  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const get = (url: string) =>
      fetch(url, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    void (async () => {
      const [r, d, i] = await Promise.allSettled([
        get('/api/v1/ransomware-recent'),
        get('/api/v1/detections'),
        get('/api/v1/ioc-correlation'),
      ]);
      if (!alive) return;
      setData({
        ransom:
          r.status === 'fulfilled'
            ? computeRansom24h((r.value as { victims?: RansomwareVictim[] }).victims ?? [])
            : null,
        det:
          d.status === 'fulfilled'
            ? pickTopDetection((d.value as { detections?: Detection[] }).detections ?? [])
            : null,
        cons:
          i.status === 'fulfilled'
            ? {
                correlated: (i.value as CorrelationResponse).totals?.correlated_indicators ?? 0,
                scanned: (i.value as CorrelationResponse).totals?.indicators_scanned ?? 0,
              }
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
    <StatBand ariaLabel="Live platform telemetry" indicator={indicator} note={note} gridCols={3}>
      {data === null ? (
        [0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-[7rem] flex-col gap-3 bg-white px-4 py-4 dark:bg-[#12121a] sm:px-5">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-[#1e2030]" />
            <div className="h-9 w-16 animate-pulse rounded bg-slate-200 dark:bg-[#1e2030]" />
            <div className="mt-auto h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-[#1e2030]" />
          </div>
        ))
      ) : (
        <>
          {/* Tile 1 — Ransomware claims · last 24h (with leader for the same
              window). Mirrors src/components/LiveSignalStrip.tsx so a
              visitor who saw the same number on the root sees the same
              "Leader: <group> (N claims)" attribution here. */}
          <StatCell
            to="/threatintel/darkweb/ransom-activity"
            label="Ransomware claims · last 24h"
            icon={<Flame size={14} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />}
            iconClass="bg-rose-500/10"
            ariaLabel={
              data.ransom
                ? `Ransomware last 24 hours: ${data.ransom.count} claims${data.ransom.topGroup ? `, leader ${data.ransom.topGroup.name} with ${data.ransom.topGroup.count} claims` : ''}.`
                : 'Ransomware data unavailable.'
            }
          >
            {data.ransom ? (
              <>
                <StatNumber
                  value={data.ransom.count}
                  reduce={reduce}
                  className={`${STAT_NUM} text-rose-600 dark:text-rose-400`}
                />
                <p className={STAT_SUB}>
                  {data.ransom.topGroup
                    ? `Leader: ${data.ransom.topGroup.name} (${data.ransom.topGroup.count} ${
                        data.ransom.topGroup.count === 1 ? 'claim' : 'claims'
                      }). 24h slice of the 7d sparkline on the home strip.`
                    : '24h slice of the 7d sparkline on the home strip; aggregated across tracked leak sites.'}
                </p>
              </>
            ) : (
              <>
                {DASH}
                <p className={STAT_SUB}>feed warming</p>
              </>
            )}
          </StatCell>

          {/* Tile 2 — Top firing detection (rule name + severity). Same
              picker logic / severity rank as the root strip so the rule
              named here is the rule named there. */}
          <StatCell
            to="/threatintel/detections/detections"
            label="Top firing detection"
            icon={<ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            iconClass="bg-amber-500/10"
            ariaLabel={
              data.det
                ? `Top firing detection: ${data.det.ruleName}, ${data.det.matchCount} indicators matched (${data.det.severity}). Open detections.`
                : 'Detection feed unavailable.'
            }
          >
            {data.det ? (
              <span className="flex items-baseline gap-1.5">
                <span className={`${STAT_NUM} text-amber-600 dark:text-amber-400`}>
                  ×{data.det.matchCount.toLocaleString()}
                </span>
              </span>
            ) : (
              DASH
            )}
            <p className={`${STAT_SUB} truncate`}>
              {data.det ? `${data.det.ruleName} (${data.det.severity}).` : 'rule pack warming'}
            </p>
          </StatCell>

          {/* Tile 3 — Cross-source IOC consensus. Same /api/v1/ioc-correlation
              endpoint and same 18-feed copy as the root strip; the trust
              signal the platform actually exists to produce. */}
          <StatCell
            to="/threatintel/iocs/cross"
            label="Cross-source IOC consensus"
            icon={<Radio size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />}
            iconClass="bg-brand-500/10"
            ariaLabel={
              data.cons
                ? `Cross-source IOC consensus: ${data.cons.correlated} indicators seen on two or more feeds, out of ${data.cons.scanned} scanned. Open correlation.`
                : 'Correlation data unavailable.'
            }
          >
            {data.cons ? (
              <StatNumber
                value={data.cons.correlated}
                reduce={reduce}
                className={`${STAT_NUM} text-brand-600 dark:text-brand-400`}
              />
            ) : (
              DASH
            )}
            <p className={STAT_SUB}>
              {data.cons
                ? `Out of ${data.cons.scanned.toLocaleString()} indicators scanned across 18 feeds.`
                : 'Indicators on two or more independent feeds.'}
            </p>
          </StatCell>
        </>
      )}
    </StatBand>
  );
}
