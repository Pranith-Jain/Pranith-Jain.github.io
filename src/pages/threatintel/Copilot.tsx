import { useState, useRef, useEffect, useCallback, type JSX } from 'react';
import { useLocation } from 'react-router-dom';
import { sanitizeAiHtml } from '../../lib/sanitize-html';
import {
  Send,
  Sparkles,
  FileText,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Lightbulb,
  Search,
  Save,
  Shield,
  Globe,
  Database,
  Cpu,
  Target,
  Brain,
  BarChart3,
  Plus,
  MessageSquare,
  Check,
  Copy,
  Edit3,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  Trash2,
} from 'lucide-react';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { BackLink } from '../../components/BackLink';
import { adminAuthHeaders } from '../../lib/admin-token';
import { buildReport, pollReport, type Report, type Progress } from '../../lib/threatintel/report-client';
import { exportReportPdf } from '../../lib/threatintel/report-pdf';
import { ReportView } from '../../components/threatintel/ReportView';
import { PivotSuggestions } from '../../components/threatintel/PivotSuggestions';
import { DetectionGenerate } from '../../components/threatintel/DetectionGenerate';
import { BulkIocInput } from '../../components/threatintel/BulkIocInput';

interface Source {
  name: string;
  items: number;
  data?: unknown[];
}

interface CopilotResponse {
  query: string;
  query_type: string;
  narrative: string;
  sources: Source[];
  model_used: string;
  processed_at: string;
  _meta?: { total_sources: number; total_items: number };
  confidence?: {
    level: string;
    score: number;
    admiralty?: { reliability: string; credibility: number; label: string };
    sources_contributing: number;
    contradictory_sources: number;
    reasoning: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent_id?: string;
  query_type?: string;
  model_used?: string;
  processed_at?: string;
  sources?: Source[];
  _meta?: { total_sources: number; total_items: number };
  confidence?: CopilotResponse['confidence'];
}

interface AgentStep {
  stepNumber: number;
  name: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  duration?: number;
}

interface SessionItem {
  id: string;
  title: string;
  messageCount: number;
  created_at: string;
  updated_at: string;
}

const QUERY_EXAMPLES = [
  { label: 'CVE-2024-1709', desc: 'CVE investigation', query: 'CVE-2024-1709' },
  { label: 'LockBit', desc: 'Ransomware group', query: 'LockBit' },
  { label: 'Scattered Spider', desc: 'Threat actor', query: 'Scattered Spider' },
  { label: '8.8.8.8', desc: 'IP address', query: '8.8.8.8' },
];

const CHAT_STARTERS = [
  'What are the latest critical CVEs?',
  'Which ransomware groups are most active this month?',
  'Tell me about APT29 tactics and techniques',
  'What IoCs are associated with LockBit?',
  'Summarize recent threat activity in the financial sector',
  'Are there any active exploits for CVE-2025-?',
];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  cve: { label: 'CVE', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  ip: { label: 'IP', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  domain: { label: 'Domain', color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  hash: { label: 'Hash', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  actor: { label: 'Actor', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  ransomware: {
    label: 'Ransomware',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  generic: {
    label: 'General',
    color: 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300',
  },
};

const CAPABILITY_GRID = [
  { icon: Shield, label: 'CVE Lookup', desc: 'Vulnerability context, exploits, patches' },
  { icon: Cpu, label: 'Threat Actors', desc: 'TTPs, campaigns, attribution' },
  { icon: Globe, label: 'IOC Triage', desc: 'IPs, domains, hashes, URLs' },
  { icon: Database, label: 'Ransomware Intel', desc: 'Groups, leaks, negotiations' },
];

type AnalystRole = 'ciso' | 'detection' | 'ir' | 'cti';
const ROLES: { id: AnalystRole; label: string; icon: typeof Shield; desc: string; color: string }[] = [
  { id: 'ciso', label: 'CISO', icon: BarChart3, desc: 'Risk posture & strategic trends', color: 'bg-emerald-600' },
  { id: 'detection', label: 'Detection', icon: Search, desc: 'TTPs, detections & rule ideas', color: 'bg-brand-600' },
  {
    id: 'ir',
    label: 'Incident Response',
    icon: Target,
    desc: 'IOCs & behaviors for rapid triage',
    color: 'bg-severity-critical',
  },
  { id: 'cti', label: 'Threat Intel', icon: Brain, desc: 'Contextual analysis & relationships', color: 'bg-brand-700' },
];

function renderMarkdown(safeMd: string): string {
  let html = safeMd;
  // Fenced code blocks — render before other markdown to protect content
  html = html.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_match, lang, code) => {
    const trimmed = (code as string).replace(/\n$/, '');
    const escaped = (trimmed as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const langAttr = lang ? ` data-language="${lang}"` : '';
    return `<pre class="overflow-x-auto rounded-lg bg-slate-100 p-3 my-2 dark:bg-[rgb(var(--surface-300))]"${langAttr}><code class="text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-200">${escaped}</code></pre>`;
  });
  html = html
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
    .replace(/(<li.*<\/li>\n?)+/g, function (match) {
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

const ACCENT_STEPS = ['bg-brand-600', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'];

function StepIndicator({ steps, currentStep }: { steps: AgentStep[]; currentStep: number }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {steps.map((s, i) => {
        const isActive = s.stepNumber === currentStep && s.status === 'running';
        const isDone = s.status === 'done';
        const isError = s.status === 'error';
        return (
          <div
            key={s.stepNumber}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-mini font-mono transition-all ${
              isDone
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : isError
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                  : isActive
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 ring-1 ring-brand-500/50'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            {isDone ? (
              <Check size={10} />
            ) : isActive ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${ACCENT_STEPS[i % ACCENT_STEPS.length]}`} />
            )}
            {s.name}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function Copilot(): JSX.Element {
  const location = useLocation();
  const isStandalone = location.pathname === '/copilot';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [role, setRole] = useState<AnalystRole>('cti');
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'chat' | 'quick' | 'report'>('chat');
  const [template, setTemplate] = useState<string>('auto');
  const [tlp, setTlp] = useState<string>('AMBER');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [streamingContent, setStreamingContent] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [, setEditingIndex] = useState<number | null>(null);

  const submitChatRef = useRef<((q: string) => Promise<void>) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // submitChatRef.current set after submitChat is defined below

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/v1/copilot/chat/sessions', {
        headers: adminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/copilot/chat/${encodeURIComponent(id)}`, {
        headers: adminAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setChatMessages(data.messages ?? []);
      setSessionId(id);
      sessionStorage.setItem('copilot_session_id', id);
      setError(null);
      setStreaming(false);
      setAgentSteps([]);
    } catch {
      /* ignore */
    }
  }, []);

  const startNewChat = useCallback(() => {
    setChatMessages([]);
    setSessionId(null);
    setStreaming(false);
    setAgentSteps([]);
    setStreamingContent('');
    setError(null);
    setEditingIndex(null);
    sessionStorage.removeItem('copilot_session_id');
    document.title = 'Investigation Copilot';
    inputRef.current?.focus();
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/v1/copilot/chat/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: adminAuthHeaders(),
        });
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== id));
          if (sessionId === id) {
            startNewChat();
          }
        }
      } catch {
        /* ignore */
      }
    },
    [sessionId, startNewChat]
  );

  const runReport = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setError(null);
      setReport(null);
      setProgress({ phase: 'queued', pct: 0, detail: 'Queued' });
      try {
        const id = await buildReport(q.trim(), template === 'auto' ? undefined : template, tlp);
        const r = await pollReport(id, setProgress);
        setReport(r);
        setProgress(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setProgress(null);
      }
    },
    [template, tlp]
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) setQuery(q);
  }, [location.search]);

  useEffect(() => {
    const storedId = sessionStorage.getItem('copilot_session_id');
    if (storedId) {
      setSessionId(storedId);
      fetch(`/api/v1/copilot/chat/${encodeURIComponent(storedId)}`, { headers: adminAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.messages) return;
          setChatMessages(data.messages);
          // Check for orphaned investigation: system msg with agent_id
          // but last assistant msg has no content (stream interrupted)
          const hasAgent = data.messages.some((m: ChatMessage) => m.role === 'system' && m.agent_id);
          if (!hasAgent) return;
          const lastAssistant = [...data.messages].reverse().find((m: ChatMessage) => m.role === 'assistant');
          if (lastAssistant && lastAssistant.content) return; // completed
          // Orphaned — reconnect to the stream
          const agentMsg = data.messages.find((m: ChatMessage) => m.role === 'system' && m.agent_id);
          if (agentMsg?.agent_id) {
            reconnectToStream(storedId);
          }
        })
        .catch(() => {});
    }
  }, []);

  const reconnectToStream = useCallback(async (sid: string) => {
    setStreaming(true);
    setAgentSteps([]);
    setStreamingContent('');
    const ac = new AbortController();
    abortControllerRef.current = ac;
    try {
      const streamRes = await fetch(`/api/v1/copilot/chat/${encodeURIComponent(sid)}/stream`, {
        headers: adminAuthHeaders(),
        signal: ac.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        setStreaming(false);
        return;
      }
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === 'heartbeat') continue;
            if (d.type === 'step' && d.step) {
              setAgentSteps((prev) => {
                if (prev.find((s) => s.stepNumber === d.step.stepNumber)) return prev;
                return [...prev, d.step];
              });
            }
            if (d.type === 'done' && d.report) {
              const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: d.report,
                model_used: d.modelUsed,
                processed_at: new Date().toISOString(),
                sources: d.sources,
                _meta: d._meta,
              };
              setChatMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = assistantMsg;
                } else {
                  next.push(assistantMsg);
                }
                return next;
              });
              setStreamingContent('');
            }
            if (d.type === 'error') {
              setStreaming(false);
              setAgentSteps([]);
              return;
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* stream failed — session may have expired */
    }
    setStreaming(false);
    setAgentSteps([]);
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions, sessionId]);

  const updateDocTitle = useCallback((messages: ChatMessage[]) => {
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser) {
      const title = firstUser.content.slice(0, 50);
      document.title = `${title}${firstUser.content.length > 50 ? '…' : ''} - Copilot`;
    } else {
      document.title = 'Investigation Copilot';
    }
  }, []);

  useEffect(() => {
    if (chatMessages.length > 0) updateDocTitle(chatMessages);
  }, [chatMessages, updateDocTitle]);

  const [narrativeHtml, setNarrativeHtml] = useState('');
  useEffect(() => {
    const md = result?.narrative;
    if (!md) {
      setNarrativeHtml('');
      return;
    }
    let cancelled = false;
    void (async () => {
      const { default: DOMPurify } = await import('isomorphic-dompurify');
      const safeMd = DOMPurify.sanitize(md, { ALLOWED_TAGS: [] });
      const safe = await sanitizeAiHtml(renderMarkdown(safeMd));
      if (!cancelled) setNarrativeHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.narrative]);

  const submitChat = useCallback(
    async (q: string) => {
      if (!q.trim() || streaming) return;
      setError(null);
      setStreaming(true);
      setAgentSteps([]);
      setStreamingContent('');

      const userMsg: ChatMessage = { role: 'user', content: q.trim() };
      setChatMessages((prev) => [...prev, userMsg]);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const ac = new AbortController();
      abortControllerRef.current = ac;

      try {
        const res = await fetch('/api/v1/copilot/chat', {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, query: q.trim() }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? err.error ?? 'Chat failed');
        }
        const { sessionId: newId } = await res.json();
        setSessionId(newId);
        sessionStorage.setItem('copilot_session_id', newId);

        const streamRes = await fetch(`/api/v1/copilot/chat/${encodeURIComponent(newId)}/stream`, {
          headers: adminAuthHeaders(),
          signal: ac.signal,
        });
        if (!streamRes.ok || !streamRes.body) throw new Error('Stream unavailable');

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'heartbeat') continue;
              if (data.type === 'step' && data.step) {
                setAgentSteps((prev) => {
                  const exists = prev.find((s) => s.stepNumber === data.step.stepNumber);
                  if (exists) return prev;
                  return [...prev, data.step];
                });
              }
              if (data.type === 'done' && data.report) {
                const assistantMsg: ChatMessage = {
                  role: 'assistant',
                  content: data.report,
                  model_used: data.modelUsed,
                  processed_at: new Date().toISOString(),
                  sources: data.sources,
                  _meta: data._meta,
                };
                setChatMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = assistantMsg;
                  return next;
                });
                setStreamingContent('');
              }
              if (data.type === 'error') {
                throw new Error(data.error ?? 'Investigation failed');
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setChatMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            next.pop();
          }
          return next;
        });
      } finally {
        abortControllerRef.current = null;
        setStreaming(false);
        setAgentSteps([]);
      }
    },
    [sessionId, streaming]
  );
  submitChatRef.current = submitChat;

  const cancelInvestigation = useCallback(async () => {
    if (!sessionId || !streaming) return;
    abortControllerRef.current?.abort();
    try {
      await fetch(`/api/v1/copilot/chat/${encodeURIComponent(sessionId)}/cancel`, {
        method: 'POST',
        headers: adminAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* best-effort */
    }
    setError('Investigation cancelled');
    setStreaming(false);
    setAgentSteps([]);
  }, [sessionId, streaming]);

  const investigate = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await fetch('/api/v1/copilot/investigate', {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ query: q.trim(), role }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? err.error ?? 'Investigation failed');
        }
        setResult(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [role]
  );

  const submit = useCallback(
    (q: string) => {
      if (mode === 'chat') void submitChat(q);
      else if (mode === 'report') void runReport(q);
      else void investigate(q);
    },
    [mode, submitChat, runReport, investigate]
  );

  const handleEditMessage = useCallback(
    (index: number) => {
      const msg = chatMessages[index];
      if (!msg || msg.role !== 'user') return;
      setQuery(msg.content);
      setChatMessages((prev) => prev.slice(0, index));
      setEditingIndex(index);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [chatMessages]
  );

  const exportConversation = useCallback(() => {
    const lines: string[] = [];
    for (const msg of chatMessages) {
      if (msg.role === 'user') lines.push(`## User\n\n${msg.content}\n`);
      else if (msg.role === 'assistant' && msg.content) lines.push(`## Assistant\n\n${msg.content}\n`);
    }
    const markdown = lines.join('---\n\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const firstUser = chatMessages.find((m) => m.role === 'user');
    const name = firstUser ? firstUser.content.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) : 'copilot_export';
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chatMessages]);

  const badge = result?.query_type ? TYPE_BADGES[result.query_type] : null;

  const currentSteps = agentSteps;
  const currentStepNum =
    currentSteps.filter((s) => s.status === 'running').length > 0
      ? Math.max(...currentSteps.filter((s) => s.status === 'running').map((s) => s.stepNumber))
      : currentSteps.length;
  const hasResults = !!(result || report || loading || progress || error || chatMessages.length > 0 || streaming);

  const currentTitle = chatMessages.find((m) => m.role === 'user')?.content;

  const hasMessages = chatMessages.length > 0;
  const isReporting = mode === 'report' || mode === 'quick';

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden text-slate-900 dark:text-white">
      {/* Persistent sidebar (desktop) + overlay (mobile) */}
      <SessionSidebar
        open={sidebarOpen}
        sessions={sessions}
        loading={loadingSessions}
        activeId={sessionId}
        onSelect={(id) => {
          loadSession(id);
          setSidebarOpen(false);
        }}
        onDelete={deleteSession}
        onNew={startNewChat}
        onClose={() => setSidebarOpen(false)}
        mode={mode}
        role={role}
        roles={ROLES}
        onModeChange={setMode}
        onRoleChange={setRole}
        onTemplateChange={setTemplate}
        onTlpChange={setTlp}
        template={template}
        tlp={tlp}
      />

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur-lg dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))/0.8]">
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-brand-600 lg:hidden dark:hover:bg-[rgb(var(--surface-300))]"
            aria-label="Toggle sidebar"
          >
            <PanelLeftOpen size={15} />
          </button>
          {!isStandalone && (
            <BackLink
              to="/threatintel"
              className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 shrink-0"
            >
              back
            </BackLink>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {hasMessages ? (
              <>
                <MessageSquare size={14} className="shrink-0 text-brand-500" />
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                  {currentTitle ?? 'Investigation Copilot'}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-micro text-slate-500 dark:bg-[rgb(var(--surface-300))]">
                  {chatMessages.length} msgs
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Investigation Copilot</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {mode === 'chat' && hasMessages && (
              <>
                <button
                  onClick={exportConversation}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-[rgb(var(--surface-300))]"
                  aria-label="Export conversation"
                >
                  <Download size={13} />
                </button>
                <BulkIocInput
                  onSubmit={(q) => {
                    startNewChat();
                    setTimeout(() => submitChatRef.current?.(q), 50);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* Scrollable chat area */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'chat' && (
            <div className="mx-auto max-w-4xl px-4 py-6">
              {/* Hero — only show when no messages */}
              {!hasMessages && !streaming && (
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600/10">
                    <Sparkles className="h-7 w-7 text-brand-600" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Investigation Copilot</h1>
                  <p className="max-w-lg text-sm text-slate-500 dark:text-slate-400">
                    Ask about any CVE, threat actor, ransomware group, IP, or domain.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUERY_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => {
                          setQuery(ex.query);
                          void submitChat(ex.query);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-200"
                      >
                        <span className="text-slate-400">{ex.desc}:</span> <span className="font-mono">{ex.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {CHAT_STARTERS.slice(0, 4).map((starter) => (
                      <button
                        key={starter}
                        onClick={() => {
                          setQuery(starter);
                          void submitChat(starter);
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-mini font-mono text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                    {CAPABILITY_GRID.map(({ icon: Icon, label, desc }) => (
                      <div
                        key={label}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-100))]"
                      >
                        <Icon className="h-4 w-4 text-brand-500" />
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-mini text-slate-500 dark:text-slate-400">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {hasMessages && (
                <div className="space-y-4">
                  {chatMessages.map((msg, i) =>
                    msg.role === 'user' ? (
                      <div key={i} className="flex justify-end group">
                        <div className="relative max-w-[85%] sm:max-w-[70%]">
                          <div className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">
                            {msg.content}
                          </div>
                          <button
                            onClick={() => handleEditMessage(i)}
                            className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Edit message"
                          >
                            <Edit3 size={12} className="text-slate-400 hover:text-brand-600" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex justify-start">
                        <div className="w-full max-w-[95%] sm:max-w-[85%] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                          {i === chatMessages.length - 1 && streaming && currentSteps.length > 0 && (
                            <StepIndicator steps={currentSteps} currentStep={currentStepNum} />
                          )}
                          {msg.content ? (
                            <div className="animate-[textReveal_0.5s_ease-out]">
                              <ChatNarrative markdown={msg.content} />
                            </div>
                          ) : streaming && i === chatMessages.length - 1 ? (
                            <div className="flex items-center gap-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-brand-500"
                                    style={{ animationDelay: '0ms' }}
                                  />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-brand-500"
                                    style={{ animationDelay: '150ms' }}
                                  />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-brand-500"
                                    style={{ animationDelay: '300ms' }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-slate-400">Investigating</span>
                              </div>
                              <button
                                onClick={cancelInvestigation}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-mini font-mono text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-800/50 dark:bg-rose-950/20 dark:text-rose-400"
                                aria-label="Cancel investigation"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : null}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {msg.sources.map((s) => (
                                <span
                                  key={s.name}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-mini text-slate-500 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
                                >
                                  {s.name}
                                  <span className="text-slate-400">({s.items})</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-[rgb(var(--border-400))]">
                            <div className="flex items-center gap-2">
                              {msg.model_used && (
                                <span className="font-mono text-mini text-slate-400">via {msg.model_used}</span>
                              )}
                            </div>
                            {msg.content && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content).catch(() => {});
                                    setCopiedIndex(i);
                                    setTimeout(() => setCopiedIndex(null), 1500);
                                  }}
                                  className="text-slate-400 hover:text-brand-600 transition-colors"
                                  aria-label="Copy response"
                                >
                                  {copiedIndex === i ? (
                                    <Check size={12} className="text-emerald-500" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          {msg.content && i === chatMessages.length - 1 && !streaming && (
                            <>
                              <FollowUpSuggestions
                                content={msg.content}
                                query={
                                  i > 0 && chatMessages[i - 1]?.role === 'user'
                                    ? chatMessages[i - 1]!.content
                                    : undefined
                                }
                                onSubmit={(q) => {
                                  setQuery(q);
                                  void submitChat(q);
                                }}
                              />
                              {(() => {
                                const userMsg = i > 0 ? chatMessages[i - 1] : null;
                                return userMsg?.role === 'user' ? (
                                  <PivotSuggestions
                                    query={userMsg.content}
                                    responseContent={msg.content ?? ''}
                                    responseSources={msg.sources}
                                    onSubmit={(q) => {
                                      setQuery(q);
                                      void submitChat(q);
                                    }}
                                  />
                                ) : null;
                              })()}
                              <DetectionGenerate context={msg.content ?? ''} />
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <span className="font-mono">
                    <AlertTriangle size={14} className="mr-1 inline" /> {error}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quick/Report mode */}
          {isReporting && (
            <div className="mx-auto max-w-4xl px-4 py-8">
              <div className="flex flex-col items-center gap-4 text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight">
                  {mode === 'report' ? 'Full Report' : 'Quick Answer'}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {mode === 'report'
                    ? 'Generate a structured CTI report'
                    : 'Get a sourced intelligence brief in seconds'}
                </p>
              </div>
              <div className="flex w-full flex-col gap-3">
                {mode === 'report' && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    <select
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      aria-label="Report template"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
                    >
                      <option value="auto">Auto template</option>
                      <option value="ransomware-group">Ransomware Group</option>
                      <option value="threat-actor">Threat Actor</option>
                      <option value="cve">CVE / Vulnerability</option>
                      <option value="ioc">IOC Dossier</option>
                    </select>
                    <select
                      value={tlp}
                      onChange={(e) => setTlp(e.target.value)}
                      aria-label="TLP classification"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
                    >
                      <option value="CLEAR">TLP:CLEAR</option>
                      <option value="GREEN">TLP:GREEN</option>
                      <option value="AMBER">TLP:AMBER</option>
                      <option value="RED">TLP:RED</option>
                    </select>
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    aria-label="Investigation query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit(query)}
                    placeholder={
                      mode === 'report'
                        ? 'Subject for a full report (group, actor, CVE, or IOC)…'
                        : 'Ask about any CVE, threat actor, ransomware group, IP, or domain…'
                    }
                    className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-14 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white dark:placeholder:text-slate-500"
                    disabled={loading || !!progress}
                  />
                  <button
                    onClick={() => submit(query)}
                    aria-label="Submit query"
                    disabled={loading || !!progress || !query.trim()}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {loading || progress ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
                {error && (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                  >
                    <span className="font-mono">
                      <AlertTriangle size={14} className="mr-1 inline" /> {error}
                    </span>
                    <button
                      onClick={() => submit(query)}
                      className="shrink-0 rounded border border-rose-400/60 px-3 py-1 font-mono text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                    >
                      retry
                    </button>
                  </div>
                )}
              </div>

              {!hasResults && !loading && !progress && !report && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                    <Lightbulb size={12} /> Try an example
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUERY_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => {
                          setQuery(ex.query);
                          void investigate(ex.query);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-200"
                      >
                        <span className="text-slate-400">{ex.desc}:</span> <span className="font-mono">{ex.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              <div className="mt-8 space-y-6">
                {progress && !report && (
                  <section
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]"
                  >
                    <div className="mb-2 flex items-center justify-between font-mono text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin text-brand-500" /> {progress.phase}
                      </span>
                      <span>{progress.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))]">
                      <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress.pct}%` }} />
                    </div>
                    <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">{progress.detail}</p>
                  </section>
                )}

                {report && <ReportView report={report} onExportPdf={() => void exportReportPdf(report)} />}

                {loading && !progress && (
                  <div className="py-16 text-center">
                    <Loader2 size={32} className="mx-auto mb-4 animate-spin text-brand-500" />
                    <p className="font-mono text-sm text-slate-500 dark:text-slate-400">Gathering intelligence…</p>
                  </div>
                )}

                {result && !loading && !report && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-lg font-bold">{result.query}</h2>
                          {badge && (
                            <span className={`rounded px-2 py-0.5 text-micro font-semibold uppercase ${badge.color}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-400">
                        <span>model: {result.model_used}</span>
                        {result._meta && (
                          <span>
                            {result._meta.total_sources} sources · {result._meta.total_items} data points
                          </span>
                        )}
                        {result.confidence && (
                          <span
                            className={`rounded px-1.5 py-0.5 ${result.confidence.score >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : result.confidence.score >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}
                            title={result.confidence.reasoning}
                          >
                            confidence: {result.confidence.score}/100 ({result.confidence.level})
                          </span>
                        )}
                        <span>{new Date(result.processed_at).toLocaleString()}</span>
                      </div>
                      {result.sources.length > 0 ? (
                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-[rgb(var(--border-400))]">
                          <div className="flex flex-wrap gap-1.5">
                            {result.sources.map((s, i) => (
                              <span
                                key={s.name}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-mini text-slate-500 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
                              >
                                <span className="font-bold text-slate-400">{i + 1}.</span>
                                {s.name}
                                <span className="text-slate-400">({s.items})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-amber-600 dark:border-[rgb(var(--border-400))] dark:text-amber-400">
                          No structured sources — report based on general knowledge.
                        </div>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-6 py-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200)/0.4)]">
                        <FileText size={15} className="text-brand-600 dark:text-brand-400" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Investigation Report
                        </span>
                        {result._meta && (
                          <span className="ml-auto font-mono text-mini text-slate-400">
                            {result._meta.total_items} data points across {result._meta.total_sources} sources
                          </span>
                        )}
                      </div>
                      <div
                        className="px-6 py-5 text-slate-800 dark:text-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-slate-100 [&_h2]:dark:border-[rgb(var(--border-400))] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_p]:text-slate-700 [&_p]:dark:text-slate-300 [&_ul]:space-y-0.5 [&_ul]:my-1.5 [&_ol]:space-y-1 [&_ol]:my-1.5 [&_li]:ml-4 [&_li]:pl-1 [&_li]:text-sm [&_li]:text-slate-700 [&_li]:dark:text-slate-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:dark:bg-[rgb(var(--surface-200))] [&_code]:text-xs [&_code]:font-mono [&_code]:text-brand-700 [&_code]:dark:text-brand-300"
                        dangerouslySetInnerHTML={{ __html: narrativeHtml }}
                      />
                      <div className="border-t border-slate-100 px-6 pb-4 pt-2 dark:border-[rgb(var(--border-400))]">
                        <FeedbackWidget targetType="copilot" targetId={query} compact />
                      </div>
                    </div>

                    <details className="group">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                        <ExternalLink size={14} />
                        Raw source data ({result.sources.length} sources)
                      </summary>
                      <div className="mt-3 space-y-3">
                        {result.sources.map((s) => (
                          <details
                            key={s.name}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200)/0.3)]"
                          >
                            <summary className="cursor-pointer text-xs font-medium">
                              {s.name} ({s.items} items)
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto overflow-x-auto rounded bg-slate-100 p-2 font-mono text-mini dark:bg-[rgb(var(--surface-200))]">
                              {JSON.stringify(s.data, null, 2)}
                            </pre>
                          </details>
                        ))}
                      </div>
                    </details>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          if (!result) return;
                          setSaving(true);
                          try {
                            const res = await fetch('/api/v1/threat-intel/assessments', {
                              method: 'POST',
                              signal: AbortSignal.timeout(30_000),
                              headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
                              body: JSON.stringify({
                                title: `Copilot: ${result.query}`,
                                type:
                                  result.query_type === 'cve'
                                    ? 'cve'
                                    : result.query_type === 'actor' || result.query_type === 'ransomware'
                                      ? 'actor'
                                      : 'general',
                                topic: result.query,
                                body: result.narrative,
                                sources: result.sources.map((s) => s.name),
                                confidence_score: result.confidence?.score ?? 0,
                                confidence_level: result.confidence?.level ?? 'unassessed',
                              }),
                            });
                            if (!res.ok) throw new Error('Failed to save');
                            setSaved(true);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Failed to save assessment');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || saved}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 disabled:opacity-50 dark:border-[rgb(var(--border-400))]"
                      >
                        <Save size={12} /> {saved ? 'Saved' : saving ? 'Saving…' : 'Save as Assessment'}
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([result.narrative], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${result.query.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 dark:border-[rgb(var(--border-400))]"
                      >
                        <FileText size={12} /> download .md
                      </button>
                      <button
                        onClick={() => void investigate(query)}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 font-mono text-xs transition-colors hover:border-brand-500/40 dark:border-[rgb(var(--border-400))]"
                      >
                        <RefreshCw size={12} /> re-investigate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat input bar — fixed bottom */}
        {mode === 'chat' && (
          <div className="shrink-0 border-t border-slate-200 bg-white/80 backdrop-blur-lg dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))/0.8]">
            <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  aria-label="Ask a follow-up"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (query.trim()) {
                        const q = query;
                        setQuery('');
                        void submitChat(q);
                      }
                    }
                  }}
                  placeholder={
                    streaming
                      ? 'Waiting for response…'
                      : hasMessages
                        ? 'Ask a follow-up question…'
                        : 'Ask about any CVE, threat actor, ransomware group, IP, or domain…'
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))] dark:text-white dark:placeholder:text-slate-500"
                  disabled={streaming}
                />
                <button
                  onClick={() => {
                    if (query.trim()) {
                      const q = query;
                      setQuery('');
                      void submitChat(q);
                    }
                  }}
                  aria-label="Send message"
                  disabled={streaming || !query.trim()}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatNarrative({ markdown }: { markdown: string }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cleaned = markdown
        .replace(/\n*```(?:report-header|action-card|json|stix)\s*\n[\s\S]*?\n```\s*/g, '')
        .replace(/\n*:::handoff\s*[\s\S]*?:::/g, '')
        .replace(/\{\s*"severity"\s*:\s*"[^"]*"\s*,\s*"[^}]*"\s*\}/g, '')
        .trim();
      const { default: DOMPurify } = await import('isomorphic-dompurify');
      const safeMd = DOMPurify.sanitize(cleaned, { ALLOWED_TAGS: [] });
      const rendered = renderMarkdown(safeMd);
      const safe = await sanitizeAiHtml(rendered);
      if (!cancelled) setHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [markdown]);
  return (
    <div
      className="text-slate-800 dark:text-slate-200 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_p]:text-slate-700 [&_p]:dark:text-slate-300 [&_ul]:space-y-0.5 [&_ul]:my-1 [&_ol]:space-y-1 [&_ol]:my-1 [&_li]:ml-4 [&_li]:pl-1 [&_li]:text-sm [&_li]:text-slate-700 [&_li]:dark:text-slate-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:dark:bg-[rgb(var(--surface-200))] [&_code]:text-xs [&_code]:font-mono [&_code]:text-brand-700 [&_code]:dark:text-brand-300"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function FollowUpSuggestions({
  content,
  query,
  onSubmit,
}: {
  content: string;
  query?: string;
  onSubmit: (q: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingFU, setLoadingFU] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSuggestions(null);
    setLoadingFU(true);
    void (async () => {
      try {
        const res = await fetch('/api/v1/copilot/follow-ups', {
          method: 'POST',
          headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ query: query ?? '', responseContent: content }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: string[] };
        if (!cancelled && data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
        }
      } catch {
        /* fall back to nothing */
      } finally {
        if (!cancelled) setLoadingFU(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content, query]);

  if (loadingFU) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-[rgb(var(--border-400))]">
        <Loader2 size={11} className="animate-spin text-slate-400" />
        <span className="font-mono text-mini text-slate-400">Suggesting follow-ups…</span>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-[rgb(var(--border-400))]">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSubmit(s)}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-mini font-mono text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function SessionSidebar({
  open,
  sessions,
  loading,
  activeId,
  onSelect,
  onDelete,
  onNew,
  onClose,
  mode,
  role,
  roles,
  onModeChange,
  onRoleChange,
  onTemplateChange,
  onTlpChange,
  template,
  tlp,
}: {
  open: boolean;
  sessions: SessionItem[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  mode?: 'chat' | 'quick' | 'report';
  role?: string;
  roles?: { id: string; label: string; icon: typeof import('lucide-react').Shield; desc: string; color: string }[];
  onModeChange?: (m: 'chat' | 'quick' | 'report') => void;
  onRoleChange?: (r: AnalystRole) => void;
  onTemplateChange?: (t: string) => void;
  onTlpChange?: (t: string) => void;
  template?: string;
  tlp?: string;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <div
        className={`w-80 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] lg:sticky lg:top-0 lg:h-full lg:translate-x-0 lg:z-10 ${
          open
            ? 'fixed inset-y-0 left-0 z-50 translate-x-0 shadow-xl transition-transform duration-300 lg:relative lg:shadow-none'
            : 'fixed -translate-x-full lg:relative lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-[rgb(var(--border-400))]">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Conversations</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono text-slate-500 hover:text-brand-600 transition-colors"
            >
              <Plus size={13} />
              New
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="px-4 py-8 text-center font-mono text-xs text-slate-400">No conversations yet</div>
          )}
          {!loading &&
            sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 cursor-pointer transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))/0.3] dark:hover:bg-[rgb(var(--surface-300))] ${
                  s.id === activeId ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                }`}
                onClick={() => onSelect(s.id)}
              >
                <MessageSquare size={14} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{s.title}</div>
                  <div className="flex items-center gap-2 text-mini font-mono text-slate-400">
                    <Clock size={10} />
                    <span>{formatTime(s.updated_at)}</span>
                    <span>
                      · {s.messageCount} {s.messageCount === 1 ? 'turn' : 'turns'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
        </div>

        {/* Settings footer */}
        <div className="border-t border-slate-100 p-3 dark:border-[rgb(var(--border-400))]">
          {onModeChange && mode && (
            <div className="mb-2">
              <label className="mb-1 block text-mini font-mono font-medium text-slate-400">Mode</label>
              <div className="flex gap-1">
                {(['chat', 'quick', 'report'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className={`flex-1 rounded px-2 py-1 text-xs font-mono transition-colors ${
                      mode === m
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-[rgb(var(--surface-300))]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          {role && roles && onRoleChange && (
            <div className="mb-2">
              <label className="mb-1 block text-mini font-mono font-medium text-slate-400">Role</label>
              <select
                value={role}
                onChange={(e) => onRoleChange(e.target.value as AnalystRole)}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-300))] dark:border-[rgb(var(--border-400))]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            {onTemplateChange && (
              <div className="flex-1">
                <label className="mb-1 block text-mini font-mono font-medium text-slate-400">Template</label>
                <select
                  value={template}
                  onChange={(e) => onTemplateChange(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-300))] dark:border-[rgb(var(--border-400))]"
                >
                  <option value="auto">Auto</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep Dive</option>
                </select>
              </div>
            )}
            {onTlpChange && (
              <div className="flex-1">
                <label className="mb-1 block text-mini font-mono font-medium text-slate-400">TLP</label>
                <select
                  value={tlp}
                  onChange={(e) => onTlpChange(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-300))] dark:border-[rgb(var(--border-400))]"
                >
                  <option value="WHITE">WHITE</option>
                  <option value="GREEN">GREEN</option>
                  <option value="AMBER">AMBER</option>
                  <option value="RED">RED</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
