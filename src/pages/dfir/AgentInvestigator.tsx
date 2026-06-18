import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  Play,
  Search,
  Shield,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { useDataFetch } from '../../hooks/useDataFetch';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ReportView, type ReportActionCard } from '../../components/dfir/ReportView';

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
  actionCard?: ReportActionCard;
  qa?: {
    qualityScore: number;
    flaggedClaims: string[];
    missingFacts: string[];
  };
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

type AgentWsMessage =
  | { type: 'connected' }
  | { type: 'step'; step: AgentStep }
  | { type: 'done'; report: string; modelUsed: string; qa?: AgentState['qa']; actionCard?: ReportActionCard }
  | { type: 'error'; error: string };

export default function AgentInvestigator(): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  const { data: sessions, refetch: refetchSessions } = useDataFetch<{ sessions: SessionEntry[] }>({
    url: '/api/v1/agent/sessions',
    ttl: 30_000,
    staleWhileRevalidate: true,
  });

  // WebSocket connection for real-time step updates
  const wsUrl = activeId
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/ws/agent/${activeId}`
    : null;
  const { connected } = useWebSocket<AgentWsMessage>(wsUrl, {
    onMessage: useCallback(
      (msg: AgentWsMessage) => {
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
                  qa: msg.qa,
                  actionCard: msg.actionCard,
                  completedAt: new Date().toISOString(),
                }
              : prev
          );
          refetchSessions();
        } else if (msg.type === 'error') {
          setError(msg.error);
          setAgentState((prev) =>
            prev ? { ...prev, status: 'error', error: msg.error, completedAt: new Date().toISOString() } : prev
          );
        }
      },
      [refetchSessions]
    ),
    reconnect: true,
    maxReconnectAttempts: 5,
  });

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

      setAgentState({
        id,
        query: query.trim(),
        queryType: 'generic',
        status: 'running',
        steps: [],
        currentStep: 0,
        maxSteps: 6,
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
  }, [query, isStarting]);

  // Fallback: if WebSocket disconnects and investigation is still running, poll
  useEffect(() => {
    if (!activeId || !agentState || agentState.status !== 'running' || connected) return;
    const interval = setInterval(() => {
      fetch(`/api/v1/agent/${activeId}`)
        .then((r) => r.json())
        .then((s) => {
          const state = s as AgentState;
          setAgentState(state);
          if (state.status !== 'running') refetchSessions();
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [activeId, agentState?.status, connected, refetchSessions]);

  const deleteSession = async (id: string) => {
    try {
      await fetch(`/api/v1/agent/${id}`, { method: 'DELETE' });
      if (activeId === id) {
        setAgentState(null);
        setActiveId(null);
      }
      refetchSessions();
    } catch {
      /* non-fatal */
    }
  };

  const downloadReport = (state: AgentState, format: 'md' | 'stix') => {
    if (format === 'md') {
      const md = buildMarkdown(state);
      downloadFile(`investigation-${state.id.slice(0, 8)}.md`, md, 'text/markdown');
    } else {
      const stix = buildStixBundle(state);
      downloadFile(
        `investigation-${state.id.slice(0, 8)}.stix.json`,
        JSON.stringify(stix, null, 2),
        'application/json'
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Bot size={28} className="text-brand-600 dark:text-brand-400" /> Agent — Autonomous Investigator
        </h1>
        <p className="text-muted mb-1 max-w-3xl leading-relaxed">
          Describe what to investigate — the agent identifies the target, calls focused intel tools, and produces a
          structured report with STIX 2.1 export.
        </p>
        <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <span>2-6 step CTI investigation</span>
          <span>·</span>
          <span>30+ intel tools</span>
          <span>·</span>
          <span>STIX 2.1 export</span>
          <span>·</span>
          <span>Download as Markdown</span>
        </p>
      </div>

      {/* Query input */}
      <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4 mb-6">
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
              placeholder="Investigate: IP, domain, hash, CVE, threat actor, ransomware group..."
              className="w-full pl-9 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#1e2030] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
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

        {!agentState && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Investigate APT28',
              'CVE-2024-3094 xz backdoor',
              '185.220.101.34 reputation',
              'LockBit ransomware group',
              'Phishing login-secure-verification.com',
            ].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuery(ex)}
                className="text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-[#1e2030] hover:border-brand-500/40 text-muted transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 mb-6 text-sm text-rose-700 dark:text-rose-300 font-mono flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Steps */}
      {agentState && agentState.steps.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Investigation steps">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Terminal size={14} /> Steps ({agentState.steps.length}/{agentState.maxSteps})
          </h2>
          {agentState.steps.map((step) => (
            <StepCard key={step.stepNumber} step={step} />
          ))}
          <div ref={stepsEndRef} />
        </section>
      )}

      {agentState?.status === 'running' && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 mb-6 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-brand-600" />
          <span className="text-sm font-mono text-brand-700 dark:text-brand-300">
            Investigating... step {agentState.currentStep + 1} of {agentState.maxSteps}
          </span>
        </div>
      )}

      {/* Report + Download */}
      {agentState?.report && (
        <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-6 mb-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Shield size={16} className="text-emerald-600" />
            <h2 className="text-lg font-display font-bold">Intelligence Report</h2>
            {agentState.modelUsed && (
              <span className="text-micro font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[#1e2030] text-slate-500">
                {agentState.modelUsed}
              </span>
            )}
            {agentState.qa && (
              <span
                className={`text-micro font-mono px-2 py-0.5 rounded border ${
                  agentState.qa.qualityScore >= 80
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                    : agentState.qa.qualityScore >= 60
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-600'
                }`}
              >
                QA: {agentState.qa.qualityScore}/100
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => downloadReport(agentState, 'md')}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-[#1e2030] hover:border-brand-500/40 text-muted"
              >
                <Download size={12} /> .md
              </button>
              <button
                onClick={() => downloadReport(agentState, 'stix')}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                <Download size={12} /> STIX 2.1
              </button>
            </div>
          </div>

          {/* QA Details */}
          {agentState.qa && (agentState.qa.flaggedClaims.length > 0 || agentState.qa.missingFacts.length > 0) && (
            <details className="mb-4 rounded border border-amber-500/30 bg-amber-500/5 p-3">
              <summary className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300 cursor-pointer">
                QA Verification Notes ({agentState.qa.flaggedClaims.length} flagged, {agentState.qa.missingFacts.length}{' '}
                added)
              </summary>
              {agentState.qa.flaggedClaims.length > 0 && (
                <div className="mt-2">
                  <div className="text-micro font-mono uppercase tracking-wider text-amber-600 mb-1">
                    Flagged Claims
                  </div>
                  <ul className="space-y-1">
                    {agentState.qa.flaggedClaims.map((c, i) => (
                      <li key={i} className="text-micro font-mono text-amber-700 dark:text-amber-300">
                        • {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {agentState.qa.missingFacts.length > 0 && (
                <div className="mt-2">
                  <div className="text-micro font-mono uppercase tracking-wider text-amber-600 mb-1">
                    Added from Data
                  </div>
                  <ul className="space-y-1">
                    {agentState.qa.missingFacts.slice(0, 5).map((f, i) => (
                      <li key={i} className="text-micro font-mono text-amber-700 dark:text-amber-300">
                        + {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          )}

          {/* Structured report view */}
          <ReportView
            report={agentState.report ?? ''}
            actionCard={agentState.actionCard}
            query={agentState.query}
            onGenerateHuntingQueries={async () => {
              try {
                // Build a richer threat description that includes the action
                // card's IOCs, MITRE techniques, and verdict so the LLM
                // generates platform-native queries grounded in evidence
                // rather than guessing from the bare user query.
                const card = agentState.actionCard;
                const iocList = (card?.iocs ?? [])
                  .slice(0, 10)
                  .map((i) => `${i.type}:${i.value}`)
                  .join(', ');
                const mitreList = (card?.mitre ?? [])
                  .slice(0, 8)
                  .map((m) => `${m.id} ${m.name ?? ''}`)
                  .join('; ');
                const threat = [
                  agentState.query,
                  iocList ? `\n\nObserved IOCs: ${iocList}` : '',
                  mitreList ? `\n\nMITRE techniques: ${mitreList}` : '',
                  card?.verdict.headline ? `\n\nVerdict: ${card.verdict.headline}` : '',
                ]
                  .filter(Boolean)
                  .join('');
                const res = await fetch('/api/v1/hunting-queries/generate', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    threat,
                    platforms: ['KQL', 'Splunk', 'Sigma', 'Elastic'],
                  }),
                });
                if (!res.ok) return { tool: 'hunting_queries', data: { error: `HTTP ${res.status}` } };
                return { tool: 'hunting_queries', data: await res.json() };
              } catch (e) {
                return { tool: 'hunting_queries', data: { error: e instanceof Error ? e.message : String(e) } };
              }
            }}
            onGenerateYaraRule={async () => {
              try {
                // Same enrichment: pass IOCs + verdict so the LLM can
                // anchor the rule to observed evidence.
                const card = agentState.actionCard;
                const iocList = (card?.iocs ?? [])
                  .slice(0, 10)
                  .map((i) => `${i.type}:${i.value}`)
                  .join(', ');
                const mitreList = (card?.mitre ?? [])
                  .slice(0, 8)
                  .map((m) => `${m.id} ${m.name ?? ''}`)
                  .join('; ');
                const description = [
                  agentState.query,
                  iocList ? `\n\nObserved IOCs: ${iocList}` : '',
                  mitreList ? `\n\nMITRE techniques: ${mitreList}` : '',
                ]
                  .filter(Boolean)
                  .join('');
                const res = await fetch('/api/v1/rules/generate', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ description, type: 'yara' }),
                });
                if (!res.ok) return { tool: 'yara_rule', data: { error: `HTTP ${res.status}` } };
                return { tool: 'yara_rule', data: await res.json() };
              } catch (e) {
                return { tool: 'yara_rule', data: { error: e instanceof Error ? e.message : String(e) } };
              }
            }}
            onDrillDeeper={(question: string) => {
              // Hand off to the Copilot Chat with the follow-up question
              // pre-seeded into the input. The Copilot reads ?q=... on mount
              // and the user just hits enter to send.
              const params = new URLSearchParams({ q: question });
              window.location.href = `/threatintel/tools/copilot-chat?${params.toString()}`;
            }}
          />
        </section>
      )}

      {/* Sessions list */}
      {sessions && sessions.sessions.length > 0 && !agentState && (
        <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <Clock size={14} /> Recent Investigations
          </h2>
          <div className="space-y-1.5">
            {sessions.sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 group">
                <button
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
                  className="flex-1 text-left px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-950/40 flex items-center gap-3"
                >
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${s.status === 'done' ? 'bg-emerald-500' : s.status === 'error' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`}
                  />
                  <span className="font-mono text-sm truncate flex-1">{s.query}</span>
                  <span className="text-micro font-mono text-slate-500 shrink-0">{s.total_steps} steps</span>
                  <ChevronRight size={14} className="text-slate-400 group-hover:text-brand-500 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(s.id)}
                  className="shrink-0 p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete investigation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StepCard({ step }: { step: AgentStep }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isRunning = step.status === 'running';

  const phaseColors: Record<string, string> = {
    collection: 'border-sky-500/40 bg-sky-500/10 text-sky-600',
    enrichment: 'border-violet-500/40 bg-violet-500/10 text-violet-600',
    analysis: 'border-amber-500/40 bg-amber-500/10 text-amber-600',
    production: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600',
    synthesis: 'border-brand-500/40 bg-brand-500/10 text-brand-600',
  };
  const phase =
    step.plan.match(/phase\s*(\d)|collection|enrichment|analysis|production|synthesis/i)?.[0]?.toLowerCase() ?? '';
  const phaseColor = phaseColors[phase] ?? phaseColors.collection;

  return (
    <article className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 overflow-hidden">
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
                : phaseColor
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
            {step.toolCalls.map((tc, i) => (
              <span
                key={`${tc.tool}-${i}`}
                className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#1e2030] text-muted"
              >
                <Zap size={8} className="inline mr-0.5" />
                {tc.tool}
              </span>
            ))}
          </div>
        </div>
        {step.observation && (
          <span className="text-micro font-mono text-slate-500 max-w-[200px] truncate hidden sm:block">
            {step.observation}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 dark:border-[#1e2030] space-y-3 bg-slate-50/40 dark:bg-slate-950/40">
          <div className="mt-3">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">Plan</div>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{step.plan}</p>
          </div>

          {step.results.map((r, i) => (
            <div key={`${r.tool}-${i}`} className="rounded border border-slate-200 dark:border-[#1e2030] p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-micro font-mono font-bold ${r.status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {r.status === 'ok' ? 'OK' : 'ERR'} {r.tool}
                </span>
                <span className="text-micro font-mono text-slate-500">{r.durationMs}ms</span>
              </div>
              {r.error && <p className="text-micro font-mono text-rose-600">{r.error}</p>}
              {r.data !== undefined && r.data !== null && (
                <pre className="text-micro font-mono text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(r.data, null, 2).slice(0, 2000)}
                </pre>
              )}
            </div>
          ))}

          {step.observation && (
            <div>
              <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">Observation</div>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{step.observation}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── Download helpers ──────────────────────────────────────────────────────

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMarkdown(state: AgentState): string {
  const lines: string[] = [];
  lines.push(`# Investigation: ${state.query}`);
  lines.push(`**ID:** ${state.id}`);
  lines.push(`**Type:** ${state.queryType}`);
  lines.push(`**Status:** ${state.status}`);
  lines.push(`**Started:** ${state.startedAt}`);
  if (state.completedAt) lines.push(`**Completed:** ${state.completedAt}`);
  if (state.modelUsed) lines.push(`**Model:** ${state.modelUsed}`);
  lines.push('');

  if (state.steps.length > 0) {
    lines.push('## Investigation Steps');
    for (const s of state.steps) {
      lines.push(`### Step ${s.stepNumber}`);
      lines.push(`**Plan:** ${s.plan}`);
      if (s.toolCalls.length > 0) {
        lines.push(`**Tools:** ${s.toolCalls.map((tc) => tc.tool).join(', ')}`);
      }
      if (s.observation) lines.push(`**Observation:** ${s.observation}`);
      for (const r of s.results) {
        lines.push(`\n#### ${r.tool} (${r.status}, ${r.durationMs}ms)`);
        if (r.data) lines.push('```json\n' + JSON.stringify(r.data, null, 2).slice(0, 3000) + '\n```');
        if (r.error) lines.push(`Error: ${r.error}`);
      }
      lines.push('');
    }
  }

  if (state.report) {
    lines.push('## Report');
    lines.push(state.report);
  }

  return lines.join('\n');
}

function buildStixBundle(state: AgentState): Record<string, unknown> {
  const objects: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const report = state.report ?? '';

  // Extract entities
  const ipv4s = [
    ...new Set(
      report.match(/\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/g) ?? []
    ),
  ];
  const hashes = [...new Set(report.match(/\b[a-fA-F0-9]{64}\b/g) ?? [])];
  const cves = [...new Set((report.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((c) => c.toUpperCase()))];
  const mitres = [...new Set(report.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])];
  const domains = [
    ...new Set(
      report.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|onion)\b/gi) ?? []
    ),
  ];

  // Create report object
  const reportId = `report--${crypto.randomUUID()}`;
  objects.push({
    type: 'report',
    spec_version: '2.1',
    id: reportId,
    created: now,
    modified: now,
    name: `Investigation: ${state.query}`,
    published: now,
    object_refs: [] as string[], // filled below
  });

  // Vulnerability objects for CVEs
  for (const cve of cves) {
    const id = `vulnerability--${crypto.randomUUID()}`;
    objects.push({
      type: 'vulnerability',
      spec_version: '2.1',
      id,
      created: now,
      modified: now,
      name: cve,
      external_references: [{ source_name: 'cve', external_id: cve }],
    });
    (objects[0].object_refs as string[]).push(id);
  }

  // Indicator objects for IOCs
  for (const ip of ipv4s) {
    const id = `indicator--${crypto.randomUUID()}`;
    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id,
      created: now,
      modified: now,
      name: `IPv4: ${ip}`,
      pattern: `[ipv4-addr:value = '${ip}']`,
      pattern_type: 'stix',
      valid_from: now,
      labels: ['malicious-activity'],
    });
    (objects[0].object_refs as string[]).push(id);
  }

  for (const hash of hashes) {
    const id = `indicator--${crypto.randomUUID()}`;
    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id,
      created: now,
      modified: now,
      name: `SHA256: ${hash.slice(0, 16)}...`,
      pattern: `[file:hashes.'SHA-256' = '${hash}']`,
      pattern_type: 'stix',
      valid_from: now,
      labels: ['malicious-activity'],
    });
    (objects[0].object_refs as string[]).push(id);
  }

  for (const domain of domains.slice(0, 10)) {
    const id = `indicator--${crypto.randomUUID()}`;
    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id,
      created: now,
      modified: now,
      name: `Domain: ${domain}`,
      pattern: `[domain-name:value = '${domain}']`,
      pattern_type: 'stix',
      valid_from: now,
      labels: ['malicious-activity'],
    });
    (objects[0].object_refs as string[]).push(id);
  }

  // Attack pattern objects for MITRE techniques
  const attackPatternIds: string[] = [];
  for (const t of mitres) {
    const id = `attack-pattern--${crypto.randomUUID()}`;
    objects.push({
      type: 'attack-pattern',
      spec_version: '2.1',
      id,
      created: now,
      modified: now,
      name: t,
      external_references: [{ source_name: 'mitre-attack', external_id: t }],
    });
    attackPatternIds.push(id);
    (objects[0].object_refs as string[]).push(id);
  }

  // Threat actor (if actor query)
  if (state.queryType === 'actor' || state.queryType === 'ransomware') {
    const actorId = `threat-actor--${crypto.randomUUID()}`;
    objects.push({
      type: 'threat-actor',
      spec_version: '2.1',
      id: actorId,
      created: now,
      modified: now,
      name: state.query,
      threat_actor_types: ['crime-syndicate'],
      roles: ['agent'],
    });
    (objects[0].object_refs as string[]).push(actorId);

    // Link actor to techniques
    for (const apId of attackPatternIds) {
      const relId = `relationship--${crypto.randomUUID()}`;
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: relId,
        created: now,
        modified: now,
        relationship_type: 'uses',
        source_ref: actorId,
        target_ref: apId,
      });
      (objects[0].object_refs as string[]).push(relId);
    }
  }

  // Link indicators to vulnerabilities
  const vulnIds = objects.filter((o) => o.type === 'vulnerability').map((o) => o.id as string);
  const indicatorIds = objects.filter((o) => o.type === 'indicator').map((o) => o.id as string);

  for (const vId of vulnIds) {
    for (const iId of indicatorIds.slice(0, 3)) {
      const relId = `relationship--${crypto.randomUUID()}`;
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: relId,
        created: now,
        modified: now,
        relationship_type: 'indicates',
        source_ref: iId,
        target_ref: vId,
      });
      (objects[0].object_refs as string[]).push(relId);
    }
  }

  return {
    type: 'bundle',
    id: `bundle--${crypto.randomUUID()}`,
    objects,
  };
}
