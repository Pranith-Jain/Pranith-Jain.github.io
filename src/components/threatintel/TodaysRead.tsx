import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ShieldAlert, Flame, ArrowRight } from 'lucide-react';
import { publishedResearch } from '../../data/threatintel/research';
import { dedupRansomwareVictims } from '../../lib/dedup-ransomware';

/**
 * "Today's read" — opinionated three-card promotion at the top of
 * /threatintel. Same medicine the DFIR hub got: 20+ intel surfaces below
 * are useful but undirected; this section answers "if you have 60
 * seconds, which one of these is worth your attention right now?"
 *
 * Three cards:
 *   1. Latest authored research (static — newest publishedResearch entry)
 *   2. Top firing detection (live — /api/v1/detections, sev/match-count
 *      sorted, same picker the /detections page itself uses)
 *   3. Weekly ransomware read (live — count claims in the last 7d, compute
 *      a one-sentence trend interpretation similar to the metrics page)
 *
 * Each card has a concrete "do this if..." trigger framed by what the
 * reader gets, not by what feature it links to. Editorial first.
 */

interface Detection {
  rule_id: string;
  rule_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  match_count: number;
}

interface RansomwareVictim {
  group: string;
  discovered: string;
}

interface DetectionsResponse {
  detections?: Detection[];
}

interface RansomwareResponse {
  victims?: RansomwareVictim[];
}

const SEV_RANK: Record<Detection['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

function pickTopDetection(items: Detection[]): Detection | null {
  if (items.length === 0) return null;
  return (
    [...items].sort((a, b) => {
      if (SEV_RANK[a.severity] !== SEV_RANK[b.severity]) return SEV_RANK[a.severity] - SEV_RANK[b.severity];
      return b.match_count - a.match_count;
    })[0] ?? null
  );
}

function weeklyRansomwareLine(victims: RansomwareVictim[]): { primary: string; secondary: string } {
  if (!victims || victims.length === 0) {
    return { primary: '—', secondary: 'no live ransomware data yet' };
  }
  // Calendar-day bucketing — same definition the hero sparkline on /
  // and the /threatintel/metrics page (StatBar + chart + headline) use.
  // The old rolling-168h cutoff produced a different number for the
  // same "last 7 days" label, which surfaced as 241 here vs 233 there
  // on the same load. One definition, four surfaces, no surprises.
  const now = new Date();
  const day = 86400_000;
  const last7Days = new Set<string>();
  const prior7Days = new Set<string>();
  for (let i = 0; i < 7; i += 1) {
    last7Days.add(new Date(now.getTime() - i * day).toISOString().slice(0, 10));
  }
  for (let i = 7; i < 14; i += 1) {
    prior7Days.add(new Date(now.getTime() - i * day).toISOString().slice(0, 10));
  }
  let last7 = 0;
  let prior7 = 0;
  const groupCounts = new Map<string, number>();
  for (const v of dedupRansomwareVictims(victims)) {
    const t = Date.parse(v.discovered);
    if (Number.isNaN(t)) continue;
    const key = new Date(t).toISOString().slice(0, 10);
    if (last7Days.has(key)) {
      last7 += 1;
      groupCounts.set(v.group, (groupCounts.get(v.group) ?? 0) + 1);
    } else if (prior7Days.has(key)) {
      prior7 += 1;
    }
  }
  const top = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const direction =
    prior7 === 0 && last7 === 0
      ? 'flat'
      : prior7 === 0
        ? 'first activity'
        : ((last7 - prior7) / prior7) * 100 > 10
          ? 'up'
          : ((last7 - prior7) / prior7) * 100 < -10
            ? 'down'
            : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→';
  const pct =
    prior7 > 0 ? `${Math.abs(Math.round(((last7 - prior7) / prior7) * 100))}% vs prior 7d` : 'no prior-week baseline';
  const leader = top ? `Leader: ${top[0]} (${top[1]} ${top[1] === 1 ? 'claim' : 'claims'})` : '';
  return {
    primary: `${last7} ${arrow}`,
    secondary: [pct, leader].filter(Boolean).join(' · '),
  };
}

export function TodaysRead(): JSX.Element {
  const [det, setDet] = useState<Detection | null>(null);
  const [detFailed, setDetFailed] = useState(false);
  const [ransom, setRansom] = useState<{ primary: string; secondary: string }>({
    primary: '…',
    secondary: 'loading',
  });
  const [ransomFailed, setRansomFailed] = useState(false);

  // Latest research is static (in-bundle). The other two cards fetch live.
  const latestResearch = publishedResearch()[0] ?? null;

  useEffect(() => {
    const ctrl = new AbortController();
    const fallbackTimeout = setTimeout(() => ctrl.abort(), 5000);
    let cancelled = false;
    void (async () => {
      const [dRes, rRes] = await Promise.allSettled([
        fetch('/api/v1/detections', { signal: ctrl.signal }).then((r) =>
          r.ok ? r.json() : Promise.reject(`det ${r.status}`)
        ),
        fetch('/api/v1/ransomware-recent', { signal: ctrl.signal }).then((r) =>
          r.ok ? r.json() : Promise.reject(`ransom ${r.status}`)
        ),
      ]);
      clearTimeout(fallbackTimeout);
      if (cancelled) return;
      if (dRes.status === 'fulfilled') {
        const top = pickTopDetection((dRes.value as DetectionsResponse).detections ?? []);
        setDet(top);
      } else {
        setDetFailed(true);
      }
      if (rRes.status === 'fulfilled') {
        setRansom(weeklyRansomwareLine((rRes.value as RansomwareResponse).victims ?? []));
      } else {
        setRansomFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  return (
    <section className="mb-10" aria-labelledby="todays-read">
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2
            id="todays-read"
            className="text-mini font-mono uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
          >
            Today's read
          </h2>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {/* 1. Latest authored research */}
        {latestResearch && (
          <Link
            to={`/threatintel/research/${latestResearch.slug}`}
            className="group rounded-xl border border-brand-500/30 bg-brand-50/30 dark:bg-brand-900/10 p-4 transition hover:border-brand-500/60 flex flex-col h-full"
          >
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span className="text-micro font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                Latest research
              </span>
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug mb-1.5 line-clamp-3">
              {latestResearch.title}
            </p>
            <p className="text-meta text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
              {latestResearch.excerpt}
            </p>
            <div className="mt-auto pt-2.5 inline-flex items-center gap-1 text-mini font-mono text-brand-600 dark:text-brand-400 group-hover:underline">
              read · {latestResearch.readingTime} <ArrowRight size={11} />
            </div>
          </Link>
        )}

        {/* 2. Top firing detection (live) */}
        <Link
          to="/threatintel/detections"
          className="group rounded-xl border border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10 p-4 transition hover:border-amber-500/60 flex flex-col h-full"
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="text-micro font-mono uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
              Top firing detection
            </span>
          </div>
          {det ? (
            <>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug mb-1.5">
                {det.rule_name}
              </p>
              <p className="text-meta text-slate-600 dark:text-slate-400 leading-relaxed">
                {det.match_count.toLocaleString()} indicators matched · {det.severity} severity
              </p>
            </>
          ) : detFailed ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug italic">Detection feed unavailable</p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
              Loading the rule pack's current state…
            </p>
          )}
          <div className="mt-auto pt-2.5 inline-flex items-center gap-1 text-mini font-mono text-amber-700 dark:text-amber-400 group-hover:underline">
            see what fired <ArrowRight size={11} />
          </div>
        </Link>

        {/* 3. Weekly ransomware read (live) */}
        <Link
          to="/threatintel/metrics"
          className="group rounded-xl border border-rose-500/30 bg-rose-50/30 dark:bg-rose-900/10 p-4 transition hover:border-rose-500/60 flex flex-col h-full"
        >
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span className="text-micro font-mono uppercase tracking-[0.18em] text-rose-700 dark:text-rose-400">
              Ransomware · last 7d
            </span>
          </div>
          {ransomFailed ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug italic">
              Ransomware data unavailable
            </p>
          ) : (
            <>
              <p className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100 leading-none mb-2 tabular-nums">
                {ransom.primary}
                <span className="text-sm font-mono text-slate-500 ml-2">claims</span>
              </p>
              <p className="text-meta text-slate-600 dark:text-slate-400 leading-relaxed">{ransom.secondary}</p>
            </>
          )}
          <div className="mt-auto pt-2.5 inline-flex items-center gap-1 text-mini font-mono text-rose-700 dark:text-rose-400 group-hover:underline">
            full weekly read <ArrowRight size={11} />
          </div>
        </Link>
      </div>
    </section>
  );
}
