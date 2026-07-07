import type { ThreatCard } from './geo';
import { SEVERITY_TONE, type Severity } from '../../severity';

/* ─── Props ────────────────────────────────────────────────────────────── */

interface ThreatRailProps {
  threats: ThreatCard[];
  onCardClick?: (threat: ThreatCard) => void;
  selectedId?: string | null;
}

/* ─── Severity badge ───────────────────────────────────────────────────── */

function normalizeSeverity(sev: string): Severity {
  const s = sev.toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'info') return s;
  if (s === 'informational') return 'info';
  // low / none / unknown / unrated → neutral low
  return 'low';
}

function sevBadgeClass(sev: string): string {
  return SEVERITY_TONE[normalizeSeverity(sev)];
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
          className={`w-full text-left rounded-xl border p-3 transition-all ${
            selectedId === t.id
              ? 'border-brand-500/60 bg-brand-500/5 shadow-md'
              : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
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
