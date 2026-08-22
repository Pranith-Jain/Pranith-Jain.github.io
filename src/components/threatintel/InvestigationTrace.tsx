/**
 * InvestigationTrace — renders the agent's step-by-step decision ledger.
 *
 * Surfaces the reasoning behind each tool call (AgentStep.plan +
 * AgentToolCall.reasoning) so investigations are auditable and
 * replayable. Collapsible by default to avoid cluttering the chat.
 *
 * Accepts a loose step shape (the SSE step events carry the full
 * AgentStep from the DO, but each chat surface has its own local
 * AgentStep subset). We read fields defensively.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Brain, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface TraceStep {
  stepNumber: number;
  name?: string;
  plan?: string;
  status?: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown>; reasoning?: string }>;
  results?: Array<{ tool: string; status: string; durationMs?: number; error?: string }>;
  observation?: string;
  completedAt?: string;
}

export function InvestigationTrace({ steps }: { steps: TraceStep[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const okCount = steps.filter((s) => s.status === 'done').length;
  const errCount = steps.filter((s) => s.status === 'error').length;
  const totalTools = steps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0);

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
          <Brain size={14} className="text-rose-500" />
          <span className="text-xs font-mono font-semibold text-body">Investigation trace</span>
          <span className="text-xs text-muted">
            {steps.length} steps · {totalTools} tool calls · {okCount} done{errCount > 0 ? ` · ${errCount} errors` : ''}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-3 py-2 space-y-2">
          {steps.map((step) => {
            const isStepExpanded = expandedStep === step.stepNumber;
            const plan = step.plan ?? step.name ?? '';
            const toolCalls = step.toolCalls ?? [];
            return (
              <div
                key={step.stepNumber}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden"
              >
                <button
                  onClick={() => setExpandedStep(isStepExpanded ? null : step.stepNumber)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-xs font-mono font-bold">
                    {step.stepNumber}
                  </span>
                  {step.status === 'done' && <CheckCircle2 size={12} className="text-emerald-500" />}
                  {step.status === 'error' && <XCircle size={12} className="text-rose-500" />}
                  {step.status === 'running' && <Loader2 size={12} className="animate-spin text-rose-500" />}
                  <span className="truncate text-xs text-muted font-mono">
                    {plan.slice(0, 80)}
                    {plan.length > 80 ? '…' : ''}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {toolCalls.length} {toolCalls.length === 1 ? 'call' : 'calls'}
                  </span>
                </button>

                {isStepExpanded && (
                  <div className="border-t border-slate-100 dark:border-[rgb(var(--border-400))] px-2.5 py-2 space-y-2">
                    {plan && (
                      <div className="text-xs text-muted">
                        <span className="font-mono text-slate-400">plan:</span> {plan}
                      </div>
                    )}

                    {toolCalls.map((tc, i) => {
                      const result = step.results?.[i];
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <Wrench size={11} className="mt-0.5 shrink-0 text-sky-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-sky-100 dark:bg-sky-900/30 px-1.5 py-0.5 text-xs font-mono text-sky-700 dark:text-sky-300">
                                {tc.tool}
                              </span>
                              {result && (
                                <span
                                  className={`text-xs ${result.status === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}
                                >
                                  {result.status === 'ok' ? '✓' : '✗'}
                                  {result.durationMs ? ` ${result.durationMs}ms` : ''}
                                </span>
                              )}
                            </div>
                            {tc.reasoning && <div className="mt-0.5 text-xs text-muted italic">{tc.reasoning}</div>}
                            {tc.args && Object.keys(tc.args).length > 0 && (
                              <div className="mt-0.5 text-xs font-mono text-slate-400">
                                {Object.entries(tc.args)
                                  .map(
                                    ([k, v]) =>
                                      `${k}=${typeof v === 'string' ? v.slice(0, 50) : JSON.stringify(v).slice(0, 50)}`
                                  )
                                  .join(', ')}
                              </div>
                            )}
                            {result?.error && <div className="mt-0.5 text-xs text-rose-500">error: {result.error}</div>}
                          </div>
                        </div>
                      );
                    })}

                    {step.observation && (
                      <div className="text-xs text-muted border-l-2 border-slate-300 dark:border-[rgb(var(--border-400))] pl-2">
                        <span className="font-mono text-slate-400">observed:</span> {step.observation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
