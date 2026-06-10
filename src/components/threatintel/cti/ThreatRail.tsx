import type { ThreatCard } from './geo';

/* ─── Props ────────────────────────────────────────────────────────────── */

interface ThreatRailProps {
  threats: ThreatCard[];
  onCardClick?: (threat: ThreatCard) => void;
  selectedId?: string | null;
}

/* ─── Severity badge ───────────────────────────────────────────────────── */

const SEV_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  HIGH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  LOW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  NONE: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

function sevBadgeClass(sev: string): string {
  return SEV_BADGE[sev.toUpperCase()] ?? SEV_BADGE.NONE;
}

/* ─── Time formatting ──────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function ThreatRail({ threats, onCardClick, selectedId }: ThreatRailProps): JSX.Element {
  if (threats.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs font-mono text-slate-400">
        No critical threats in window.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-micro font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-3">
        Top 10 Critical Threats
      </h3>
      {threats.map((t, i) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onCardClick?.(t)}
          className={`w-full text-left rounded-lg border p-3 transition-all ${
            selectedId === t.id
              ? 'border-brand-500/60 bg-brand-500/5 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-micro font-mono text-slate-400 w-4 shrink-0 pt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                  {t.title}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 text-micro font-mono font-medium rounded border ${sevBadgeClass(t.severity)}`}
                >
                  {t.severity}
                </span>
                {t.kev && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-micro font-mono font-medium rounded border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                    KEV
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {t.score != null && (
                  <span className="text-micro font-mono text-slate-500">CVSS {t.score.toFixed(1)}</span>
                )}
                <span className="text-micro font-mono text-slate-400">{t.source}</span>
                <span className="text-micro font-mono text-slate-400">{timeAgo(t.published)}</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
