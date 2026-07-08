import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Search,
  Shield,
  Cpu,
  Globe,
  Database,
  Bug,
  Target,
  User,
  Network,
  FileText,
  Zap,
  Box,
  Activity,
} from 'lucide-react';
import { BackLink } from '../../components/BackLink';

// ── Types ──────────────────────────────────────────────────────────────

interface StepEvent {
  type: 'step' | 'done' | 'error' | 'heartbeat';
  step?: {
    stepNumber: number;
    plan: string;
    specialist?: string;
    toolCalls: Array<{ tool: string; args: Record<string, unknown> }>;
    results: Array<{ tool: string; status: string }>;
  };
  report?: string | null;
  error?: string | null;
  modelUsed?: string;
  toolsUsed?: string[];
}

interface SpecialistNode {
  name: string;
  icon: typeof Shield;
  color: string;
  status: 'pending' | 'active' | 'done';
  steps: number;
  tools: string[];
}

// ── Specialist metadata ────────────────────────────────────────────────

const SPECIALIST_ICONS: Record<string, { icon: typeof Shield; color: string }> = {
  'IOC Reputation Specialist': { icon: Search, color: 'from-sky-500 to-blue-600' },
  'Threat Actor Specialist': { icon: User, color: 'from-rose-500 to-red-600' },
  'Vulnerability Specialist': { icon: Shield, color: 'from-amber-500 to-orange-600' },
  'Domain & Host Specialist': { icon: Globe, color: 'from-emerald-500 to-green-600' },
  'Malware Analysis Specialist': { icon: Bug, color: 'from-violet-500 to-purple-600' },
  'Detection Rules Specialist': { icon: FileText, color: 'from-indigo-500 to-blue-600' },
  'Phishing Specialist': { icon: Target, color: 'from-pink-500 to-rose-600' },
  'Ransomware Specialist': { icon: Database, color: 'from-orange-500 to-red-600' },
  'Campaign Correlation Specialist': { icon: Activity, color: 'from-cyan-500 to-teal-600' },
  'Dark Web & Cybercrime Specialist': { icon: Network, color: 'from-slate-600 to-slate-800' },
  'Strategic Intel Specialist': { icon: Cpu, color: 'from-amber-600 to-yellow-600' },
  'STIX Export Specialist': { icon: FileText, color: 'from-teal-500 to-emerald-600' },
  Synthesizer: { icon: Zap, color: 'from-brand-500 to-brand-700' },
  Planner: { icon: Box, color: 'from-slate-400 to-slate-600' },
};

const DEFAULT_ICON = { icon: Activity, color: 'from-slate-400 to-slate-600' };

// ── WebSocket hook ─────────────────────────────────────────────────────

function useAgentSSE(url: string | null): StepEvent[] {
  const [events, setEvents] = useState<StepEvent[]>([]);

  useEffect(() => {
    if (!url) {
      setEvents([]);
      return;
    }
    setEvents([]);
    let cancelled = false;
    const ctrl = new AbortController();

    const stream = async () => {
      try {
        const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: ctrl.signal });
        if (!res.ok || cancelled) return;
        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buf = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as StepEvent;
              if (!cancelled) setEvents((prev) => [...prev, ev]);
            } catch {
              /* skip */
            }
          }
        }
      } catch {
        /* abort */
      }
    };

    void stream();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [url]);

  return events;
}

// ── Main component ─────────────────────────────────────────────────────

export default function AgentMesh(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [agentId, setAgentId] = useState(searchParams.get('id') ?? '');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);

  const events = useAgentSSE(agentId ? `/api/v1/agent/${agentId}/stream` : null);
  const steps = events.filter(
    (e): e is StepEvent & { step: NonNullable<StepEvent['step']> } => e.type === 'step' && !!e.step
  );
  const doneEvent = events.find((e): e is StepEvent => e.type === 'done' || e.type === 'error');

  // Build specialist nodes from events
  const specialistMap = useRef<Map<string, SpecialistNode>>(new Map());

  useEffect(() => {
    for (const e of events) {
      if (e.type === 'step' && e.step) {
        const name = e.step.specialist ?? 'Planner';
        if (!specialistMap.current.has(name)) {
          const meta = SPECIALIST_ICONS[name] ?? DEFAULT_ICON;
          specialistMap.current.set(name, {
            name,
            icon: meta.icon,
            color: meta.color,
            status: 'active',
            steps: 0,
            tools: [],
          });
        }
        const node = specialistMap.current.get(name)!;
        node.steps++;
        for (const tc of e.step.toolCalls ?? []) {
          if (!node.tools.includes(tc.tool)) node.tools.push(tc.tool);
        }
      }
    }
  }, [events]);

  const specialists = Array.from(specialistMap.current.values());
  const allDone = !!doneEvent;

  const startInvestigation = async () => {
    if (!query.trim()) return;
    setRunning(true);
    specialistMap.current.clear();
    try {
      const res = await fetch('/api/v1/agent/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), maxSteps: 10 }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { id: string };
      setAgentId(data.id);
    } catch (e) {
      console.error(e);
      setRunning(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-6 sm:py-10 text-slate-900 dark:text-white">
      <BackLink
        to="/threatintel"
        className="mx-auto mb-6 flex max-w-5xl items-center gap-2 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-e3 shadow-violet-500/20">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Agent Mesh</h1>
          <p className="max-w-xl text-base text-slate-500 dark:text-slate-400">
            Live view of the multi-agent orchestrator — each specialist runs its own tools and hands results to the
            next.
          </p>
        </div>

        {/* ── Input ──────────────────────────────────────────────── */}
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startInvestigation()}
            placeholder="e.g. CVE-2024-1709, LockBit, Scattered Spider..."
            disabled={running}
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white"
          />
          <button
            onClick={startInvestigation}
            disabled={running || !query.trim()}
            className="flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-30"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Investigate
          </button>
        </div>

        {/* ── Mesh visualisation ─────────────────────────────────── */}
        {(specialists.length > 0 || running) && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Specialist Mesh{allDone ? ' — Complete' : running ? ' — Running' : ''}
            </h2>

            {/* Flow connections */}
            {specialists.length > 1 && (
              <div className="flex items-center justify-center gap-1 mb-6 overflow-x-auto pb-2">
                {specialists.map((spec, i) => {
                  const Icon = spec.icon;
                  return (
                    <div key={spec.name} className="flex items-center gap-1 shrink-0">
                      <div
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-mono ${
                          i === specialists.length - 1 && allDone
                            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                            : i === specialists.length - 1 && !allDone
                              ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/20'
                              : 'border-slate-200 dark:border-[rgb(var(--border-400))]'
                        }`}
                        title={`${spec.name} (${spec.steps} steps, tools: ${spec.tools.join(', ')})`}
                      >
                        <div className={`rounded-full bg-gradient-to-br ${spec.color} p-1`}>
                          <Icon size={12} className="text-white" />
                        </div>
                        <span className="truncate max-w-[120px]">{spec.name.replace(' Specialist', '')}</span>
                        <span className="text-[10px] text-slate-400">{spec.steps}</span>
                      </div>
                      {i < specialists.length - 1 && <ArrowRightIcon />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step timeline */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {steps.map((e, i) => {
                const spec = e.step.specialist ?? 'Planner';
                const meta = SPECIALIST_ICONS[spec] ?? DEFAULT_ICON;
                const Icon = meta.icon;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))]"
                  >
                    <div className={`mt-0.5 rounded-full bg-gradient-to-br ${meta.color} p-1.5 shrink-0`}>
                      <Icon size={12} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                          Step {e.step.stepNumber}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-600">
                          {spec}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{e.step.plan}</p>
                      {e.step.toolCalls.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {e.step.toolCalls.map((tc, j) => (
                            <span
                              key={j}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                                e.step!.results?.[j]?.status === 'ok'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700'
                              }`}
                            >
                              {tc.tool}
                              {e.step!.results?.[j]?.status === 'ok' ? ' ✓' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {running && steps.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                  <Loader2 size={14} className="animate-spin" />
                  Waiting for first step...
                </div>
              )}
            </div>

            {/* Done/Error */}
            {doneEvent && (
              <div
                className={`mt-4 rounded-xl border p-4 text-sm ${
                  doneEvent.type === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold mb-1">
                  {doneEvent.type === 'done' ? '✓ Investigation complete' : '✗ Investigation failed'}
                </div>
                <p className="text-xs opacity-80">
                  {doneEvent.type === 'done'
                    ? `Report generated. Model: ${doneEvent.modelUsed ?? 'unknown'}`
                    : doneEvent.error}
                </p>
                {doneEvent.toolsUsed && (
                  <p className="text-[10px] mt-1 opacity-60">Tools used: {doneEvent.toolsUsed.join(', ')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Legend ─────────────────────────────────────────────── */}
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer font-mono">Specialist registry ({specialists.length} active)</summary>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {Object.entries(SPECIALIST_ICONS).map(([name, meta]) => {
              const Icon = meta.icon;
              const active = specialists.some((s) => s.name === name);
              return (
                <div
                  key={name}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  <div className={`rounded-full bg-gradient-to-br ${meta.color} p-0.5`}>
                    <Icon size={10} className="text-white" />
                  </div>
                  <span className="truncate">{name}</span>
                  {active && <span className="ml-auto text-emerald-500">●</span>}
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
