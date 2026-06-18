import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Send,
  Loader2,
  Trash2,
  Clock,
  AlertTriangle,
  Bot,
  ChevronRight,
  Terminal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { sanitizeAiHtml } from '../../lib/sanitize-html';
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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  query_type?: string;
  model_used?: string;
  processed_at?: string;
  actionCard?: ReportActionCard;
  /** Original user query that produced this assistant message — used by
   *  the structured report view to call follow-up tools. */
  query?: string;
}

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  cve: { label: 'CVE', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  ip: { label: 'IP', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  domain: { label: 'Domain', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  hash: { label: 'Hash', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  actor: { label: 'Actor', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  ransomware: {
    label: 'Ransomware',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  generic: { label: 'General', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

function renderMarkdown(safeMd: string): string {
  let html = safeMd
    .replace(/### (.+)/g, '<h3 class="text-base font-semibold mt-4 mb-1.5">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
    .replace(/# (.+)/g, '<h1 class="text-xl font-bold mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-mono">$1</code>'
    )
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (match) => {
      if (match.includes('list-decimal')) return `<ol class="space-y-1 my-1.5">${match}</ol>`;
      return `<ul class="space-y-0.5 my-1.5">${match}</ul>`;
    });

  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<li')
      )
        return trimmed;
      return `<p class="text-sm leading-relaxed mb-2">${trimmed}</p>`;
    })
    .join('\n');
  return html;
}

export default function CopilotChat(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(searchParams.get('session') || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Pre-seed the input from ?q=... so the DFIR Agent's "Drill deeper" button
  // (and any external deep link) can hand off a follow-up question.
  const [query, setQuery] = useState(() => {
    const initial = searchParams.get('q');
    return initial ? initial.slice(0, 2000) : '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [currentStepNum, setCurrentStepNum] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [narrativeHtmls, setNarrativeHtmls] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentSteps]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/v1/copilot/chat/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages) setMessages(data.messages.filter((m: ChatMessage) => m.role !== 'system'));
      })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role === 'assistant' && !narrativeHtmls.has(i)) {
        const idx = i;
        void (async () => {
          const { default: DOMPurify } = await import('isomorphic-dompurify');
          const safeMd = DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: [] });
          const safe = await sanitizeAiHtml(renderMarkdown(safeMd));
          setNarrativeHtmls((prev) => new Map(prev).set(idx, safe));
        })();
      }
    }
  }, [messages, narrativeHtmls]);

  const sendMessage = useCallback(
    async (q: string) => {
      if (!q.trim() || loading) return;
      setLoading(true);
      setError(null);
      setAgentSteps([]);
      setCurrentStepNum(0);
      setNarrativeHtmls(new Map());
      eventSourceRef.current?.close();

      const userMsg: ChatMessage = { role: 'user', content: q.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setQuery('');

      try {
        const res = await fetch('/api/v1/copilot/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, query: q.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((err as { error?: string }).error ?? 'Chat failed');
        }
        const data = (await res.json()) as { sessionId: string; agentId: string };
        setSessionId(data.sessionId);

        const es = new EventSource(`/api/v1/copilot/chat/${encodeURIComponent(data.sessionId)}/stream`);
        eventSourceRef.current = es;

        es.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as
              | { type: 'step'; step: AgentStep }
              | {
                  type: 'done';
                  report: string | null;
                  error: string | null;
                  modelUsed: string | null;
                  actionCard?: ReportActionCard;
                }
              | { type: 'error'; report?: null; error: string; modelUsed?: null }
              | { type: 'heartbeat' };

            if (msg.type === 'heartbeat') return;

            if (msg.type === 'step') {
              setAgentSteps((prev) => {
                const steps = [...prev];
                const idx = steps.findIndex((s) => s.stepNumber === msg.step.stepNumber);
                if (idx >= 0) steps[idx] = msg.step;
                else steps.push(msg.step);
                return steps;
              });
              setCurrentStepNum(msg.step.stepNumber);
            } else if (msg.type === 'done') {
              es.close();
              if (msg.report) {
                const assistantMsg: ChatMessage = {
                  role: 'assistant',
                  content: msg.report,
                  model_used: msg.modelUsed ?? undefined,
                  processed_at: new Date().toISOString(),
                  actionCard: msg.actionCard,
                  query: q.trim(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
              }
              setLoading(false);
            } else if (msg.type === 'error') {
              es.close();
              setError(msg.error);
              setLoading(false);
            }
          } catch {
            /* ignore parse errors */
          }
        };

        es.onerror = () => {
          es.close();
          setError('Connection lost');
          setLoading(false);
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    },
    [sessionId, loading]
  );

  const newSession = useCallback(() => {
    eventSourceRef.current?.close();
    setSessionId(null);
    setMessages([]);
    setError(null);
    setNarrativeHtmls(new Map());
    setAgentSteps([]);
    setCurrentStepNum(0);
    setQuery('');
  }, []);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const badge = lastAssistantMsg?.query_type ? TYPE_BADGES[lastAssistantMsg.query_type] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between mb-6">
        <BackLink
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 font-mono"
        >
          <ArrowLeft size={14} /> back
        </BackLink>
        {sessionId && (
          <button
            onClick={newSession}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} /> New session
          </button>
        )}
      </div>

      <div className="animate-fade-in-up mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Bot className="text-brand-600 dark:text-brand-400" size={28} />
          CTI Chat
        </h1>
        <p className="text-muted max-w-3xl leading-relaxed">
          Autonomous multi-turn investigation. Ask about any CVE, threat actor, ransomware group, IP, domain, or hash —
          the agent plans, gathers intelligence, and produces a structured report.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 mb-4 min-h-[400px] flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[600px]">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-600">
              <Bot size={32} className="mb-3 opacity-50" />
              <p className="text-sm font-mono">Ask anything about threat intelligence</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {['CVE-2024-1709', 'LockBit', 'Scattered Spider', '8.8.8.8'].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => sendMessage(ex)}
                    className="text-xs font-mono px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <div>
                    {badge && (
                      <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded mb-2 ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    {msg.actionCard ? (
                      <ReportView
                        report={msg.content}
                        actionCard={msg.actionCard}
                        query={msg.query}
                        onGenerateHuntingQueries={async () => {
                          try {
                            const res = await fetch('/api/v1/hunting-queries/generate', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ threat: msg.query ?? '', siem: 'kql' }),
                            });
                            if (!res.ok) return { tool: 'hunting_queries', data: { error: `HTTP ${res.status}` } };
                            return { tool: 'hunting_queries', data: await res.json() };
                          } catch (e) {
                            return {
                              tool: 'hunting_queries',
                              data: { error: e instanceof Error ? e.message : String(e) },
                            };
                          }
                        }}
                        onGenerateYaraRule={async () => {
                          try {
                            const res = await fetch('/api/v1/rules/generate', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ description: msg.query ?? '', type: 'yara' }),
                            });
                            if (!res.ok) return { tool: 'yara_rule', data: { error: `HTTP ${res.status}` } };
                            return { tool: 'yara_rule', data: await res.json() };
                          } catch (e) {
                            return { tool: 'yara_rule', data: { error: e instanceof Error ? e.message : String(e) } };
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: narrativeHtmls.get(i) ?? '' }}
                      />
                    )}
                    {msg.model_used && (
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {msg.model_used} · {msg.processed_at ? new Date(msg.processed_at).toLocaleTimeString() : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-lg px-4 py-3 bg-slate-100 dark:bg-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  <Bot size={14} className="text-brand-600 dark:text-brand-400" />
                  Agent investigating...
                </div>
                {agentSteps.map((step) => (
                  <div
                    key={step.stepNumber}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-xs"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
                      <span className="font-mono text-muted flex items-center gap-1.5">
                        {step.status === 'done' ? (
                          <CheckCircle2 size={12} className="text-green-500" />
                        ) : step.status === 'error' ? (
                          <XCircle size={12} className="text-red-500" />
                        ) : (
                          <Loader2 size={12} className="animate-spin text-brand-600" />
                        )}
                        Step {step.stepNumber}
                      </span>
                      <span className="text-slate-400">
                        {step.toolCalls.length} tool{step.toolCalls.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <details className="px-3 py-2">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
                        <Terminal size={10} />
                        Plan &amp; results
                      </summary>
                      <div className="mt-2 space-y-2">
                        <p className="text-muted">{step.plan}</p>
                        {step.results.map((r, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-slate-500">
                            <ChevronRight size={10} className="mt-0.5 shrink-0" />
                            <span>
                              <code className="text-brand-600 dark:text-brand-400">{r.tool}</code>
                              {r.status === 'ok' ? (
                                <span className="text-green-500 ml-1">OK</span>
                              ) : (
                                <span className="text-red-500 ml-1">error</span>
                              )}
                              <span className="text-slate-400 ml-1">({r.durationMs}ms)</span>
                            </span>
                          </div>
                        ))}
                        {step.observation && (
                          <p className="text-slate-500 italic border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5">
                            {step.observation}
                          </p>
                        )}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                <AlertTriangle size={14} />
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(query)}
              placeholder="Ask a follow-up question..."
              disabled={loading}
              className="w-full pr-14 py-2.5 pl-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(query)}
              disabled={loading || !query.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded bg-brand-600 dark:bg-brand-500 hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
              aria-label="Send message"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          {sessionId && !loading && (
            <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1">
              <Clock size={10} /> Session active · {messages.length} message{messages.length !== 1 ? 's' : ''}
            </p>
          )}
          {loading && currentStepNum > 0 && (
            <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              Step {currentStepNum} of 6
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
