import { useState, useRef, useEffect, useCallback } from 'react';
import { sanitizeAiHtml } from '../../lib/sanitize-html';
import {
  Send,
  Loader2,
  AlertTriangle,
  Search,
  MessageSquare,
  FileText,
  Crosshair,
  BarChart3,
  Target,
  Brain,
  Shield,
} from 'lucide-react';
import { BackLink } from '../../components/BackLink';

// ── Types ───────────────────────────────────────────────────────────────

interface VeraModeDef {
  id: string;
  label: string;
  description: string;
  maxSteps: number;
}

interface AnalystRole {
  id: string;
  label: string;
  tools: string[];
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  ciso: BarChart3,
  detection: Search,
  ir: Target,
  cti: Brain,
};

const ROLE_COLORS: Record<string, string> = {
  ciso: 'from-emerald-500 to-teal-600',
  detection: 'from-blue-500 to-indigo-600',
  ir: 'from-rose-500 to-red-600',
  cti: 'from-violet-500 to-purple-600',
};

interface StepEvent {
  type: 'step';
  step: {
    stepNumber: number;
    plan: string;
    results: Array<{ tool: string; status: string }>;
  };
  specialist?: string;
}

interface DoneEvent {
  type: 'done';
  report: string | null;
  error?: string | null;
  modelUsed?: string;
  toolsUsed?: string[];
}

type StreamEvent = StepEvent | DoneEvent | { type: 'error' | 'heartbeat' | 'complete'; error?: string };

interface VeraMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: string;
  tools_used?: string[];
  model_used?: string;
  analyst_role?: string;
}

const MODE_META: Record<string, { icon: typeof MessageSquare; color: string }> = {
  ask: { icon: MessageSquare, color: 'from-sky-500 to-blue-600' },
  investigate: { icon: Search, color: 'from-violet-500 to-purple-600' },
  draft: { icon: FileText, color: 'from-amber-500 to-orange-600' },
  challenge: { icon: Crosshair, color: 'from-rose-500 to-red-600' },
};

// ── Local event-source hook ─────────────────────────────────────────────

function useVeraSSE(sessionId: string | null): StreamEvent[] {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      return;
    }
    setEvents([]);
    let cancelled = false;

    const ctrl = new AbortController();
    const stream = async () => {
      try {
        const res = await fetch(`/api/v1/agents/chat/${sessionId}/stream`, {
          headers: { accept: 'text/event-stream' },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
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
              const event = JSON.parse(line.slice(6)) as StreamEvent;
              if (!cancelled) setEvents((prev) => [...prev, event]);
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch {
        /* abort is expected on cancel */
      }
    };

    void stream();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sessionId]);

  return events;
}

// ── Main component ──────────────────────────────────────────────────────

export default function VeraChat(): JSX.Element {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<string>('ask');
  const [role, setRole] = useState<string>('cti');
  const [modes, setModes] = useState<VeraModeDef[]>([]);
  const [roles, setRoles] = useState<AnalystRole[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VeraMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/v1/agents/chat/modes', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]),
    })
      .then((r) => r.json())
      .then((d) => setModes(d))
      .catch(() => {});
    fetch('/api/v1/agents/chat/roles', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]),
    })
      .then((r) => r.json())
      .then((d) => setRoles(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // SSE events for the active session
  const streamEvents = useVeraSSE(sessionId);

  // Process stream events into messages
  const lastReport = streamEvents.filter((e): e is DoneEvent => e.type === 'done').pop()?.report;

  const isLoading = loading || (sessionId != null && !lastReport);

  // Append assistant message when report arrives
  useEffect(() => {
    if (!lastReport) return;
    setMessages((prev) => {
      if (
        prev.length > 0 &&
        prev[prev.length - 1]?.role === 'assistant' &&
        prev[prev.length - 1]?.content === lastReport
      ) {
        return prev; // dedupe
      }
      return [...prev, { role: 'assistant', content: lastReport, mode }];
    });
    setLoading(false);
  }, [lastReport, mode]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamEvents]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitRef = useRef<AbortController | null>(null);
  const submit = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      submitRef.current?.abort();
      const ctrl = new AbortController();
      submitRef.current = ctrl;
      setLoading(true);
      setError(null);

      setMessages((prev) => [...prev, { role: 'user', content: q.trim(), mode }]);

      try {
        const res = await fetch('/api/v1/agents/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            mode,
            role,
            query: q.trim(),
          }),
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(60000)]),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? err.error ?? 'Vera request failed');
        }
        const data = await res.json();
        if (!ctrl.signal.aborted) setSessionId(data.sessionId);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
      setQuery('');
    },
    [sessionId, mode, role]
  );

  // If mode changes mid-session, reset
  const handleModeChange = (m: string) => {
    setMode(m);
  };

  const activeMode = (MODE_META[mode] ?? MODE_META.ask)!;
  const ModeIcon = activeMode.icon;

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-6 sm:py-10 text-slate-900 dark:text-white">
      <BackLink
        to="/threatintel"
        className="mx-auto mb-6 flex max-w-3xl items-center gap-2 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 font-mono"
      >
        back
      </BackLink>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${activeMode.color} shadow-e3 shadow-${mode === 'ask' ? 'sky' : mode === 'investigate' ? 'violet' : mode === 'draft' ? 'amber' : 'rose'}-500/20`}
          >
            <ModeIcon className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Vera</h1>
          <p className="max-w-xl text-base text-slate-500 dark:text-slate-400">
            Your AI threat-intel analyst. Ask, investigate, draft, or challenge — in plain English.
          </p>
          {(() => {
            const activeRole = roles.find((r) => r.id === role);
            if (!activeRole) return null;
            const RIcon = ROLE_ICONS[activeRole.id] ?? Shield;
            return (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-mono text-white ${ROLE_COLORS[activeRole.id] ?? 'from-slate-500 to-slate-600'}`}
              >
                <RIcon size={12} />
                {activeRole.label} persona
              </span>
            );
          })()}
        </div>

        {/* ── Mode selector ──────────────────────────────────────────── */}
        <div className="flex w-full flex-wrap justify-center gap-2">
          {modes.map((m) => {
            const meta = MODE_META[m.id] ?? { icon: MessageSquare, color: 'from-slate-500 to-slate-600' };
            const MIcon = meta.icon;
            return (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                aria-pressed={mode === m.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-mono transition-all ${
                  mode === m.id
                    ? 'border-brand-500 bg-brand-600/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300'
                }`}
                title={m.description}
              >
                <MIcon size={14} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* ── Active mode description ────────────────────────────────── */}
        <p className="text-center text-xs text-slate-400 italic">
          {modes.find((m) => m.id === mode)?.description ?? ''}
        </p>

        {/* ── Role selector ──────────────────────────────────────────── */}
        {roles.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-2">
            <span className="text-[10px] text-slate-400 self-center mr-1 font-medium uppercase tracking-wider">
              As:
            </span>
            {roles.map((r) => {
              const RIcon = ROLE_ICONS[r.id] ?? Shield;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  aria-pressed={role === r.id}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-mono transition-all ${
                    role === r.id
                      ? `bg-gradient-to-r ${ROLE_COLORS[r.id] ?? 'from-slate-500 to-slate-600'} text-white shadow-sm`
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                  }`}
                >
                  <RIcon size={10} />
                  {r.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Chat area ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
          <div className="flex max-h-[500px] min-h-[200px] flex-col gap-3 overflow-y-auto">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-1 items-center justify-center py-8">
                <div className="text-center">
                  <MessageSquare size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Ask about a CVE, threat actor, IOC, or anything threat-intel related.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {!isUser && (
                        <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
                          Vera · {msg.mode ?? 'ask'}
                          {msg.analyst_role && ` · ${msg.analyst_role.toUpperCase()}`}
                        </span>
                      )}
                    </div>
                    <VeraMessageContent content={msg.content} />
                    {!isUser && msg.tools_used && msg.tools_used.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-200 pt-1.5 dark:border-slate-600">
                        {msg.tools_used.map((tool) => (
                          <span
                            key={tool}
                            className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-mono text-slate-500 dark:bg-slate-600 dark:text-slate-400"
                          >
                            {tool}
                          </span>
                        ))}
                        {msg.model_used && (
                          <span className="ml-auto text-[9px] font-mono text-slate-400 dark:text-slate-500">
                            {msg.model_used.split('→')[0]?.trim()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live step stream */}
            {sessionId != null && !lastReport && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2 mb-1">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">Working</span>
                  </div>
                  {streamEvents
                    .filter((e): e is StepEvent => e.type === 'step')
                    .slice(-6)
                    .map((e, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                        <span className="font-mono">Step {e.step.stepNumber}</span>
                        {e.specialist && (
                          <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] dark:bg-slate-600">
                            {e.specialist}
                          </span>
                        )}
                        <span className="truncate opacity-70">{e.step.plan.slice(0, 80)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50/50 px-4 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <AlertTriangle size={12} />
                  {error}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ──────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-[rgb(var(--border-400))]">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                aria-label="Ask Vera"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit(query)}
                placeholder={
                  mode === 'ask'
                    ? role === 'ciso'
                      ? 'Ask about risk posture, trends, strategic priorities…'
                      : role === 'detection'
                        ? 'Ask about detection rules, TTPs, KQL queries…'
                        : role === 'ir'
                          ? 'Ask about IOCs, containment, incident procedures…'
                          : 'Ask about any threat…'
                    : mode === 'investigate'
                      ? 'What should I investigate?'
                      : mode === 'draft'
                        ? 'Subject for a brief…'
                        : 'What read should I challenge?'
                }
                disabled={isLoading}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white dark:placeholder:text-slate-500"
              />
              <button
                onClick={() => submit(query)}
                aria-label="Submit"
                disabled={isLoading || !query.trim()}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:opacity-30"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message content renderer (plain text → safe HTML) ─────────────────

function VeraMessageContent({ content }: { content: string }): JSX.Element {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!content) {
      setHtml('');
      return;
    }
    let cancelled = false;
    void (async () => {
      const { default: DOMPurify } = await import('isomorphic-dompurify');
      const safeMd = DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
      const rendered = renderVeraMarkdown(safeMd);
      const safe = await sanitizeAiHtml(rendered);
      if (!cancelled) setHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (!html) return <>{content.slice(0, 200)}</>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderVeraMarkdown(text: string): string {
  let html = text
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      '<pre class="rounded bg-slate-800 text-green-400 p-2 my-2 text-xs overflow-x-auto"><code>$2</code></pre>'
    )
    .replace(/### (.+)/g, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>')
    .replace(/# (.+)/g, '<h1 class="text-base font-bold mt-3 mb-1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-xs font-mono">$1</code>'
    )
    .replace(/\[(\d+(?:,\d+)*)\]/g, '<sup class="text-brand-600 font-mono text-[10px]">[$1]</sup>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-xs">$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-3 list-decimal text-xs">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => {
      return m.includes('list-decimal')
        ? `<ol class="space-y-0.5 my-1">${m}</ol>`
        : `<ul class="space-y-0.5 my-1">${m}</ul>`;
    });

  html = html
    .split(/\n\n+/)
    .map((b) => {
      const t = b.trim();
      if (!t) return '';
      if (t.startsWith('<') || t.startsWith('<pre')) return t;
      return `<p class="text-xs leading-relaxed mb-1.5">${t}</p>`;
    })
    .join('\n');

  return html;
}
