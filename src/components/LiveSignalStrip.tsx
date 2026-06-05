import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Flame, Radio, ShieldAlert } from 'lucide-react';
import { dedupRansomwareVictims } from '../lib/dedup-ransomware';

/**
 * Live-from-the-platform strip on the portfolio root. The goal: a first-
 * time visitor who doesn't drill into /threatintel still sees the platform
 * *working* on real data in the first scroll. Three numbers — none of them
 * vanity — fetched directly from the same edge worker that powers the CTI
 * surface.
 *
 * Design rule: each tile must be answerable in one breath. "How many
 * ransomware claims hit leak sites in the last 24 hours" beats "thirty-
 * four KPIs". And every tile has to link to where the underlying data
 * lives, so a curious visitor can verify the number rather than trust it.
 *
 * Failure mode: if any single fetch fails, that tile shows `—` and the
 * other two still render. The strip never blocks the page render; it's a
 * progressive enhancement on top of the static hero above it.
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

interface CorrelationResponse {
  totals: {
    indicators_scanned: number;
    correlated_indicators: number;
    by_kind?: Record<string, number>;
  };
}

interface Tile {
  icon: typeof Activity;
  label: string;
  /** The single number or compact phrase. Stays under ~14 chars. */
  primary: string;
  /** A one-line context (where the number came from / what it means). */
  context: string;
  /** Click-through to verifiable detail. */
  href: string;
  /** Optional pill color hint. */
  accent: 'rose' | 'amber' | 'brand';
}

const ACCENT_BG: Record<Tile['accent'], string> = {
  rose: 'border-rose-500/30 hover:border-rose-500/60',
  amber: 'border-amber-500/30 hover:border-amber-500/60',
  brand: 'border-brand-500/30 hover:border-brand-500/60',
};
const ACCENT_TEXT: Record<Tile['accent'], string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  brand: 'text-brand-600 dark:text-brand-400',
};

function within24h(iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 86400_000;
}

export function LiveSignalStrip(): JSX.Element {
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    const empty: Tile = {
      icon: Activity,
      label: '',
      primary: '—',
      context: 'unable to read live feed',
      href: '/threatintel',
      accent: 'brand',
    };

    const run = async () => {
      const opts = { signal: ctrl.signal } as const;
      const [rRes, dRes, iRes] = await Promise.allSettled([
        fetch('/api/v1/ransomware-recent', opts).then((r) =>
          r.ok ? r.json() : Promise.reject(`ransomware ${r.status}`)
        ),
        fetch('/api/v1/detections', opts).then((r) => (r.ok ? r.json() : Promise.reject(`detections ${r.status}`))),
        fetch('/api/v1/ioc-correlation', opts).then((r) =>
          r.ok ? r.json() : Promise.reject(`correlation ${r.status}`)
        ),
      ]);
      if (cancelled) return;

      // Tile 1: ransomware claims in the last 24h + the dominant operator
      // for the same window. Intentionally a tighter window than the
      // 7-day sparkline in the hero above: the sparkline shows cadence
      // (the week's shape), this tile shows velocity (today's pulse).
      // The two are complementary, not competing — context line below
      // makes the relationship explicit so a quiet 24h doesn't read as
      // contradicting the week's larger total.
      let t1: Tile = { ...empty, icon: Flame, label: 'Ransomware claims · last 24h', accent: 'rose' };
      if (rRes.status === 'fulfilled') {
        // Dedupe by (group + victim), keeping the earliest discovery date.
        // The upstream merge collapses same-day dupes, but the same victim
        // can still appear on multiple days when different trackers index
        // it 1-3 days apart. For a "today's claims" surface each unique
        // victim should count once.
        const all = (rRes.value as { victims?: RansomwareVictim[] }).victims ?? [];
        const victims = dedupRansomwareVictims(all).filter((v) => within24h(v.discovered));
        const counts = new Map<string, number>();
        for (const v of victims) counts.set(v.group, (counts.get(v.group) ?? 0) + 1);
        const [topGroup, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
        t1 = {
          icon: Flame,
          label: 'Ransomware claims · last 24h',
          primary: String(victims.length),
          context:
            victims.length === 0
              ? 'Quiet 24 hours; the 7d sparkline above carries the wider weekly view.'
              : topGroup
                ? `Leader: ${topGroup} (${topCount} ${topCount === 1 ? 'claim' : 'claims'}). 24h slice of the 7d sparkline above.`
                : '24h slice of the 7d sparkline above; aggregated across tracked leak sites.',
          href: '/threatintel/ransomware-activity',
          accent: 'rose',
        };
      }

      // Tile 2: the one rule the detection engine is most spun-up about
      // right now. Same picker logic the /detections page uses on its
      // headline card, just trimmed for the strip.
      let t2: Tile = { ...empty, icon: ShieldAlert, label: 'Top firing detection', accent: 'amber' };
      if (dRes.status === 'fulfilled') {
        const detections = (dRes.value as { detections?: Detection[] }).detections ?? [];
        const rank: Record<Detection['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const top = [...detections].sort((a, b) => {
          if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
          return b.match_count - a.match_count;
        })[0];
        if (top) {
          t2 = {
            icon: ShieldAlert,
            label: 'Top firing detection',
            primary: `×${top.match_count}`,
            context: `${top.rule_name} (${top.severity}).`,
            href: '/threatintel/detections',
            accent: 'amber',
          };
        }
      }

      // Tile 3: count of cross-source IOC consensus hits — the signal an
      // analyst trusts versus single-feed noise. This is the metric that
      // most justifies the platform's existence; surfacing it on the home
      // page is the implicit thesis statement of the whole CTI build.
      let t3: Tile = { ...empty, icon: Radio, label: 'Cross-source IOC consensus', accent: 'brand' };
      if (iRes.status === 'fulfilled') {
        const totals = (iRes.value as CorrelationResponse).totals;
        const correlated = totals?.correlated_indicators ?? 0;
        const scanned = totals?.indicators_scanned ?? 0;
        t3 = {
          icon: Radio,
          label: 'Cross-source IOC consensus',
          primary: String(correlated),
          context:
            scanned > 0
              ? `Out of ${scanned.toLocaleString()} indicators scanned across 18 feeds.`
              : 'Indicators on two or more independent feeds.',
          href: '/threatintel/correlation',
          accent: 'brand',
        };
      }

      setTiles([t1, t2, t3]);
    };

    // Defer the 3 fetches until the browser is idle so they don't compete with
    // hydration / the LCP paint on the landing page. The strip already renders a
    // stable skeleton, so there's no layout cost to waiting a beat.
    const idle: number =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(() => void run(), { timeout: 2000 })
        : (setTimeout(() => void run(), 200) as unknown as number);

    return () => {
      cancelled = true;
      ctrl.abort();
      if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  return (
    <section className="mt-10 mb-2" aria-labelledby="live-signal-heading">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="live-signal-heading" className="text-eyebrow font-mono uppercase text-slate-500 dark:text-slate-400">
          Live from the platform · updated on load
        </h2>
        <Link to="/threatintel" className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline">
          /threatintel →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          tiles ?? [
            {
              icon: Flame,
              label: 'Ransomware claims · last 24h',
              primary: '…',
              context: 'loading',
              href: '/threatintel/ransomware-activity',
              accent: 'rose' as const,
            },
            {
              icon: ShieldAlert,
              label: 'Top firing detection',
              primary: '…',
              context: 'loading',
              href: '/threatintel/detections',
              accent: 'amber' as const,
            },
            {
              icon: Radio,
              label: 'Cross-source IOC consensus',
              primary: '…',
              context: 'loading',
              href: '/threatintel/correlation',
              accent: 'brand' as const,
            },
          ]
        ).map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              to={t.href}
              className={`group block rounded-xl border bg-white dark:bg-slate-900/40 p-4 transition ${ACCENT_BG[t.accent]}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-eyebrow font-mono uppercase text-slate-400">{t.label}</span>
                <Icon className={`h-4 w-4 ${ACCENT_TEXT[t.accent]}`} aria-hidden="true" />
              </div>
              <div className="flex items-baseline gap-3">
                <span className={`font-display font-bold text-3xl ${ACCENT_TEXT[t.accent]} tabular-nums`}>
                  {t.primary}
                </span>
              </div>
              <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed mt-1.5 line-clamp-2">
                {t.context}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
