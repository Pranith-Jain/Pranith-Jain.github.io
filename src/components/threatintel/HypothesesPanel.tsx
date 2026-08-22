/**
 * HypothesesPanel — Fleet-style hypothesis tracking surfaced in the
 * investigation UI. Derives the live hypothesis ledger from the steps'
 * observer findings: each observer pass may propose, support, or refute
 * hypotheses; we replay those updates in step order (same logic as
 * rebuildWorkingMemory) so the panel mirrors what the agent reasoned over.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FlaskConical, CircleDot, CheckCircle2, XCircle, Search } from 'lucide-react';

type HypothesisStatus = 'proposed' | 'testing' | 'supported' | 'refuted';

interface StepHypothesisUpdate {
  text: string;
  status: HypothesisStatus;
  evidence?: string;
}

export interface TraceStepWithHypotheses {
  stepNumber: number;
  observerFindings?: {
    hypothesisUpdates?: StepHypothesisUpdate[];
  };
}

const STATUS_META: Record<HypothesisStatus, { icon: typeof CircleDot; cls: string; label: string }> = {
  proposed: { icon: CircleDot, cls: 'text-sky-500', label: 'proposed' },
  testing: { icon: Search, cls: 'text-amber-500', label: 'testing' },
  supported: { icon: CheckCircle2, cls: 'text-emerald-500', label: 'supported' },
  refuted: { icon: XCircle, cls: 'text-rose-500', label: 'refuted' },
};

/** Replay hypothesis updates across steps (dedupe by normalized text). */
function deriveHypotheses(steps: TraceStepWithHypotheses[]): Array<StepHypothesisUpdate & { firstStep: number }> {
  const ledger = new Map<string, StepHypothesisUpdate & { firstStep: number }>();
  for (const step of [...steps].sort((a, b) => a.stepNumber - b.stepNumber)) {
    const updates = step.observerFindings?.hypothesisUpdates ?? [];
    for (const u of updates) {
      const key = u.text.trim().toLowerCase();
      if (!key) continue;
      const existing = ledger.get(key);
      if (existing) {
        existing.status = u.status;
        if (u.evidence) existing.evidence = u.evidence;
      } else {
        ledger.set(key, { ...u, firstStep: step.stepNumber });
      }
    }
  }
  // Supported first, then testing/proposed, then refuted.
  const rank: Record<HypothesisStatus, number> = { supported: 0, testing: 1, proposed: 2, refuted: 3 };
  return [...ledger.values()].sort((a, b) => rank[a.status] - rank[b.status]);
}

export function HypothesesPanel({ steps }: { steps: TraceStepWithHypotheses[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const hypotheses = useMemo(() => deriveHypotheses(steps), [steps]);

  if (hypotheses.length === 0) return null;

  const counts = hypotheses.reduce(
    (acc, h) => {
      acc[h.status] = (acc[h.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<HypothesisStatus, number>>
  );
  const summary = (['supported', 'testing', 'proposed', 'refuted'] as HypothesisStatus[])
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ');

  return (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50/50 dark:bg-[rgb(var(--surface-200))]/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={14} className="text-slate-400" />
          ) : (
            <ChevronRight size={14} className="text-slate-400" />
          )}
          <FlaskConical size={14} className="text-violet-500" />
          <span className="text-xs font-mono font-semibold text-body">Hypotheses</span>
          <span className="text-xs text-muted">{summary}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-3 py-2 space-y-1.5">
          {hypotheses.map((h) => {
            const meta = STATUS_META[h.status];
            const Icon = meta.icon;
            return (
              <div key={`${h.firstStep}-${h.text}`} className="flex items-start gap-2 py-1">
                <Icon size={14} className={`mt-0.5 shrink-0 ${meta.cls}`} />
                <div className="min-w-0">
                  <p className="text-sm text-body">
                    {h.text}
                    <span className={`ml-2 font-mono text-[10px] uppercase tracking-wide ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </p>
                  {h.evidence && (
                    <p className="text-xs text-muted truncate" title={h.evidence}>
                      ↳ {h.evidence}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    proposed at step {h.firstStep}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
