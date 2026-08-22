/**
 * SelfEvalScorecard — displays the agent's 5-axis self-evaluation
 * (accuracy, completeness, clarity, actionability, conciseness) with
 * concrete evidence and improvement suggestions.
 *
 * Rendered when the agent's final state includes a `selfEval` result.
 */
import { CheckCircle2, AlertCircle, Lightbulb, Star } from 'lucide-react';

export interface SelfEvalAxis {
  axis: 'accuracy' | 'completeness' | 'clarity' | 'actionability' | 'conciseness';
  score: number; // 1-5
  evidence: string;
  improvement: string;
}

export interface SelfEvalResult {
  axes: SelfEvalAxis[];
  overallScore: number; // 1-5
  topGap: string;
  modelUsed: string;
}

const AXIS_LABELS: Record<SelfEvalAxis['axis'], string> = {
  accuracy: 'Accuracy',
  completeness: 'Completeness',
  clarity: 'Clarity',
  actionability: 'Actionability',
  conciseness: 'Conciseness',
};

function scoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreBg(score: number): string {
  if (score >= 4) return 'bg-emerald-500';
  if (score >= 3) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function SelfEvalScorecard({ selfEval }: { selfEval: SelfEvalResult }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Self-Evaluation</h4>
          <span className="text-xs text-slate-500 font-mono">via {selfEval.modelUsed}</span>
        </div>
        <div className={`text-lg font-bold ${scoreColor(selfEval.overallScore)}`}>
          {selfEval.overallScore.toFixed(1)}/5
        </div>
      </div>

      {/* Axis bars */}
      <div className="space-y-2 mb-3">
        {selfEval.axes.map((axis) => (
          <div key={axis.axis} className="flex items-center gap-2">
            <span className="text-xs text-muted w-28 shrink-0">{AXIS_LABELS[axis.axis]}</span>
            <div className="flex-1 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`h-2 flex-1 rounded-sm ${n <= axis.score ? scoreBg(axis.score) : 'bg-slate-200 dark:bg-[rgb(var(--surface-300))]'}`}
                />
              ))}
            </div>
            <span className={`text-xs font-mono w-8 text-right ${scoreColor(axis.score)}`}>{axis.score}/5</span>
          </div>
        ))}
      </div>

      {/* Top gap */}
      {selfEval.topGap && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 mb-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Top improvement gap: </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">{selfEval.topGap}</span>
          </div>
        </div>
      )}

      {/* Evidence + improvements (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Evidence &amp; improvements
        </summary>
        <div className="mt-2 space-y-2">
          {selfEval.axes.map((axis) => (
            <div
              key={axis.axis}
              className="text-xs border-l-2 pl-2"
              style={{ borderColor: axis.score >= 4 ? '#10b981' : axis.score >= 3 ? '#f59e0b' : '#f43f5e' }}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">{AXIS_LABELS[axis.axis]}</span>
              </div>
              <div className="text-muted mb-1">
                <span className="font-mono text-slate-400">evidence:</span> {axis.evidence}
              </div>
              <div className="text-muted">
                <span className="font-mono text-slate-400">improve:</span> {axis.improvement}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
