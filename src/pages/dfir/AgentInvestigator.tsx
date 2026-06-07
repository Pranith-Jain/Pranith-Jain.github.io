import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, ChevronRight, Clock, Loader2, Play, Search, Shield, Terminal, Zap } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { useDataFetch } from '../../hooks/useDataFetch';

// ── Types ────────────────────────────────────────────────────────────────

interface AgentToolResult {
  tool: string;
  args: Record<string, unknown>;
  status: 'ok' | 'error';
  data?: unknown;
  error?: string;
  durationMs: number;
}

interface AgentStep {
  stepNumber: number;
  plan: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; reasoning: string }>;
  results: AgentToolResult[];
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt?: string;
  completedAt?: string;
  observation?: string;
  nextAction?: 'continue' | 'synthesize';
}

interface AgentState {
  id: string;
  query: string;
  queryType: string;
  status: 'running' | 'done' | 'error';
  steps: AgentStep[];
  currentStep: number;
  maxSteps: number;
  report: string | null;
  modelUsed: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface SessionEntry {
  id: string;
  query: string;
  query_type: string;
  status: string;
  total_steps: number;
  model_used: string | null;
  created_at: string;
}

// ── Main Component ───────────────────────────────────────────────────────

export default function AgentInvestigator(): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  const { data: sessions } = useDataFetch<{ sessions: SessionEntry[] }>({
    url: '/api/v1/agent/sessions',
    ttl: 30_000,
    staleWhileRevalidate: true,
  });

  // Auto-scroll to latest step
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentState?.steps.length]);

  const startInvestigation = useCallback(async () => {
    if (!query.trim() || isStarting) return;
    setIsStarting(true);
    setError(null);
    setAgentState(null);

    try {
      const res = await fetch('/api/v1/agent/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      setActiveId(id);

      // Open SSE stream
      const es = new EventSource(`/api/v1/agent/${id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as
            | { type: 'step'; step: AgentStep }
            | { type: 'done'; report: string; modelUsed: string }
            | { type: 'error'; error: string };

          if (msg.type === 'step') {
            setAgentState((prev) => {
              if (!prev) return prev;
              const steps = [...prev.steps];
              const idx = steps.findIndex((s) => s.stepNumber === msg.step.stepNumber);
              if (idx >= 0) steps[idx] = msg.step;
              else steps.push(msg.step);
              return { ...prev, steps, currentStep: msg.step.stepNumber };
            });
          } else if (msg.type === 'done') {
            setAgentState((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'done',
                    report: msg.report,
                    modelUsed: msg.modelUsed,
                    completedAt: new Date().toISOString(),
                  }
                : prev
            );
            es.close();
          } else if (msg.type === 'error') {
            setError(msg.error);
            setAgentState((prev) =>
              prev ? { ...prev, status: 'error', error: msg.error, completedAt: new Date().toISOString() } : prev
            );
            es.close();
          }
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        // SSE connection lost — poll once to get final state
        es.close();
        if (activeId) {
          fetch(`/api/v1/agent/${id}`)
            .then((r) => r.json())
            .then((s) => {
              setAgentState(s as AgentState);
            })
            .catch(() => {});
        }
      };

      // Initialize state from the initial response
      setAgentState({
        id,
        query: query.trim(),
        queryType: 'generic',
        status: 'running',
        steps: [],
        currentStep: 0,
        maxSteps: 8,
        report: null,
        modelUsed: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  }, [query, isStarting, activeId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Bot size={28} className="text-brand-600 dark:text-brand-400" /> Agent — Autonomous Investigator
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-1 max-w-3xl leading-relaxed">
          Autonomous DFIR and threat intelligence agent. Describe what to investigate — the agent plans its approach,
          calls 30+ intelligence tools, analyzes results, and produces a structured report.
        </p>
        <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <span>Multi-step reasoning</span>
          <span>·</span>
          <span>30+ intel tools</span>
          <span>·</span>
          <span>Durable Object state</span>
          <span>·</span>
          <span>Max 8 steps</span>
        </p>
      </div>

      {/* Query input */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) startInvestigation();
              }}
              placeholder="Investigate: suspicious IP, phishing domain, ransomware group, CVE, threat actor..."
              className="w-full pl-9 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Investigation query"
              disabled={agentState?.status === 'running'}
            />
          </div>
          <button
            type="button"
            onClick={startInvestigation}
            disabled={!query.trim() || isStarting || agentState?.status === 'running'}
            className="inline-flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors"
          >
            {isStarting || agentState?.status === 'running' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Running
              </>
            ) : (
              <>
                <Play size={16} /> Investigate
              </>
            )}
          </button>
        </div>

        {/* Quick-start examples */}
        {!agentState && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Investigate APT28 recent activity',
              'Check reputation of 185.220.101.34',
              'CVE-2024-3094 exploitation status',
              'Phishing domain login-secure-verification.com',
            ].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuery(ex)}
                className="text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-slate-600 dark:text-slate-400 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 mb-6 text-sm text-rose-700 dark:text-rose-300 font-mono">
          {error}
        </div>
      )}

      {/* Agent steps timeline */}
      {agentState && agentState.steps.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Investigation steps">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Terminal size={14} /> Investigation Steps ({agentState.steps.length}/{agentState.maxSteps})
          </h2>
          {agentState.steps.map((step) => (
            <StepCard key={step.stepNumber} step={step} />
          ))}
          <div ref={stepsEndRef} />
        </section>
      )}

      {/* Running indicator */}
      {agentState?.status === 'running' && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 mb-6 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-brand-600" />
          <span className="text-sm font-mono text-brand-700 dark:text-brand-300">
            Agent is working... step {agentState.currentStep + 1} of {agentState.maxSteps}
          </span>
        </div>
      )}

      {/* Final report */}
      {agentState?.report && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 mb-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-emerald-600" />
            <h2 className="text-lg font-display font-bold">Intelligence Report</h2>
            {agentState.modelUsed && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-500">
                {agentState.modelUsed}
              </span>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {agentState.report}
          </div>
        </section>
      )}

      {/* Recent sessions */}
      {sessions && sessions.sessions.length > 0 && !agentState && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <Clock size={14} /> Recent Investigations
          </h2>
          <div className="space-y-1.5">
            {sessions.sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  fetch(`/api/v1/agent/${s.id}`)
                    .then((r) => r.json())
                    .then((state) => {
                      setAgentState(state as AgentState);
                      setActiveId(s.id);
                    })
                    .catch(() => {});
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-950/40 flex items-center gap-3 group"
              >
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${s.status === 'done' ? 'bg-emerald-500' : s.status === 'error' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`}
                />
                <span className="font-mono text-sm truncate flex-1">{s.query}</span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{s.total_steps} steps</span>
                <ChevronRight size={14} className="text-slate-400 group-hover:text-brand-500 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Step Card ────────────────────────────────────────────────────────────

function StepCard({ step }: { step: AgentStep }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isRunning = step.status === 'running';

  return (
    <article className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-950/40 text-left"
      >
        <span
          className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-mono font-bold ${
            step.status === 'done'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : step.status === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-600'
                : 'border-brand-500/40 bg-brand-500/10 text-brand-600'
          }`}
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : step.stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold">Step {step.stepNumber}</span>
            <span className="text-xs font-mono text-slate-500 truncate">{step.plan.slice(0, 120)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {step.toolCalls.map((tc) => (
              <span
                key={tc.tool}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
              >
                <Zap size={8} className="inline mr-0.5" />
                {tc.tool}
              </span>
            ))}
          </div>
        </div>
        {step.observation && (
          <span className="text-[10px] font-mono text-slate-500 max-w-[200px] truncate hidden sm:block">
            {step.observation}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/40 dark:bg-slate-950/40">
          <div className="mt-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Plan</div>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{step.plan}</p>
          </div>

          {step.results.map((r) => (
            <div key={r.tool} className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] font-mono font-bold ${r.status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {r.status === 'ok' ? 'OK' : 'ERR'} {r.tool}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{r.durationMs}ms</span>
              </div>
              {r.error && <p className="text-[10px] font-mono text-rose-600">{r.error}</p>}
              {r.data && (
                <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(r.data, null, 2).slice(0, 2000)}
                </pre>
              )}
            </div>
          ))}

          {step.observation && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Observation</div>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{step.observation}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
