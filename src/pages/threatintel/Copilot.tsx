import { useState, useRef, useEffect, useCallback } from 'react';
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
  Clock,
  Trash2,
  List,
} from 'lucide-react';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { BackLink } from '../../components/BackLink';
import { adminAuthHeaders } from '../../lib/admin-token';
import { buildReport, pollReport, type Report, type Progress } from '../../lib/threatintel/report-client';
import { exportReportPdf } from '../../lib/threatintel/report-pdf';
import { ReportView } from '../../components/threatintel/ReportView';

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
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-mono transition-all ${
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

function generateFollowUps(content: string): string[] {
  const result: string[] = [];
  const lower = content.toLowerCase();
  if (/cve-\d{4}/i.test(content)) {
    result.push('What exploits are available for this CVE?');
    result.push('Which threat actors are associated with this vulnerability?');
    result.push('What is the CVSS score and EPSS percentile?');
  } else if (/ransom/i.test(lower) || /lockbit|blackcat|clop|alphv/i.test(content)) {
    result.push('What are the latest IoCs for this ransomware?');
    result.push('Which sectors are most targeted by this group?');
    result.push('What TTPs does this ransomware use?');
  } else if (/apt\d+|group|actor|threat.*group/i.test(content)) {
    result.push('What TTPs are associated with this threat actor?');
    result.push('What campaigns have they been linked to recently?');
    result.push('What industries do they typically target?');
  } else if (/ip|domain|hash|ioc|indicator/i.test(lower)) {
    result.push('What other IoCs are related to this?');
    result.push('What threat actor is associated with this indicator?');
    result.push('What campaigns have used this indicator?');
  }
  if (result.length === 0) {
    result.push('Tell me more about the sources');
    result.push('What should I prioritize?');
  }
  return result.slice(0, 3);
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
          if (data?.messages) setChatMessages(data.messages);
        })
        .catch(() => {});
    }
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

      try {
        const res = await fetch('/api/v1/copilot/chat', {
          method: 'POST',
          signal: AbortSignal.timeout(15_000),
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

        const streamRes = await fetch(`/api/v1/copilot/chat/${encodeURIComponent(newId)}/stream`);
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
        setStreaming(false);
        setAgentSteps([]);
      }
    },
    [sessionId, streaming]
  );

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

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-12 sm:py-16 text-slate-900 dark:text-white">
      {/* Session sidebar */}
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
      />

      {/* Sidebar toggle */}
      {mode === 'chat' && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-24 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-500 dark:hover:border-brand-400 dark:hover:text-brand-400"
          aria-label="Open conversation history"
        >
          <List size={15} />
        </button>
      )}

      {!isStandalone && (
        <BackLink
          to="/threatintel"
          className="mx-auto mb-8 flex max-w-3xl items-center gap-2 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 font-mono"
        >
          back
        </BackLink>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-600/10">
            <Sparkles className="h-8 w-8 text-brand-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'chat' && currentTitle ? (
              <span className="animate-[textReveal_0.4s_ease-out]">
                {currentTitle.length > 40 ? currentTitle.slice(0, 40) + '…' : currentTitle}
              </span>
            ) : (
              'Investigation Copilot'
            )}
          </h1>
          <p className="max-w-xl text-base text-slate-500 dark:text-slate-400">
            AI-powered investigation of CVEs, threat actors, ransomware groups, IPs, and domains. Ask in plain English —
            get a sourced, structured report.
          </p>
        </div>

        {/* Mode + template + TLP */}
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 text-xs font-mono dark:border-[rgb(var(--border-400))]">
            <button
              onClick={() => setMode('chat')}
              aria-pressed={mode === 'chat'}
              className={`px-3 py-1.5 transition-colors ${mode === 'chat' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300 dark:hover:bg-[rgb(var(--surface-300))]'}`}
            >
              <MessageSquare size={13} className="inline mr-1 -mt-0.5" />
              Chat
            </button>
            <button
              onClick={() => setMode('quick')}
              aria-pressed={mode === 'quick'}
              className={`px-3 py-1.5 transition-colors ${mode === 'quick' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300 dark:hover:bg-[rgb(var(--surface-300))]'}`}
            >
              Quick answer
            </button>
            <button
              onClick={() => setMode('report')}
              aria-pressed={mode === 'report'}
              className={`px-3 py-1.5 transition-colors ${mode === 'report' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300 dark:hover:bg-[rgb(var(--surface-300))]'}`}
            >
              Full report
            </button>
          </div>
          {mode === 'report' && (
            <>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                aria-label="Report template"
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
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
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-300"
              >
                <option value="CLEAR">TLP:CLEAR</option>
                <option value="GREEN">TLP:GREEN</option>
                <option value="AMBER">TLP:AMBER</option>
                <option value="RED">TLP:RED</option>
              </select>
            </>
          )}
        </div>

        {/* Role selector */}
        <div className="flex w-full flex-wrap justify-center gap-1.5">
          <span className="text-[10px] text-slate-400 self-center mr-1 font-medium uppercase tracking-wider">As:</span>
          {ROLES.map((r) => {
            const RIcon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                aria-pressed={role === r.id}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-mono transition-all ${
                  role === r.id
                    ? `${r.color} text-white shadow-sm`
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                }`}
              >
                <RIcon size={12} />
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Chat interface */}
        {mode === 'chat' && (
          <>
            {chatMessages.length > 0 && (
              <div className="w-full space-y-4">
                {chatMessages.map((msg, i) =>
                  msg.role === 'user' ? (
                    <div key={i} className="flex justify-end group">
                      <div className="relative max-w-[80%]">
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
                      <div className="w-full max-w-[90%] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                        {i === chatMessages.length - 1 && streaming && currentSteps.length > 0 && (
                          <StepIndicator steps={currentSteps} currentStep={currentStepNum} />
                        )}
                        {msg.content ? (
                          <div className="animate-[textReveal_0.5s_ease-out]">
                            <ChatNarrative markdown={msg.content} />
                          </div>
                        ) : streaming && i === chatMessages.length - 1 ? (
                          <div className="flex items-center gap-2 py-2">
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
                        ) : null}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {msg.sources.map((s) => (
                              <span
                                key={s.name}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] text-slate-500 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
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
                              <span className="font-mono text-[11px] text-slate-400">via {msg.model_used}</span>
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
                        {/* Follow-up suggestions (last assistant messages only) */}
                        {msg.content && i === chatMessages.length - 1 && !streaming && (
                          <FollowUpSuggestions
                            content={msg.content}
                            onSubmit={(q) => {
                              setQuery(q);
                              void submitChat(q);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {chatMessages.length === 0 && !streaming && (
              <div className="w-full space-y-4">
                <div className="flex flex-col items-center gap-3">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                    <Lightbulb size={12} /> Try an example
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUERY_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => {
                          setQuery(ex.query);
                          void submitChat(ex.query);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-200 dark:hover:bg-[rgb(var(--surface-300))]"
                      >
                        <span className="text-slate-400">{ex.desc}:</span> <span className="font-mono">{ex.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {CHAT_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      onClick={() => {
                        setQuery(starter);
                        void submitChat(starter);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-mono text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
                  {CAPABILITY_GRID.map(({ icon: Icon, label, desc }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-100))]"
                    >
                      <Icon className="h-5 w-5 text-brand-500" />
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.length > 0 && (
              <div className="flex w-full flex-wrap justify-center gap-3">
                <button
                  onClick={startNewChat}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 font-mono text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
                >
                  <Plus size={12} />
                  New conversation
                </button>
                {chatMessages.length > 2 && (
                  <button
                    onClick={exportConversation}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 font-mono text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
                  >
                    <Download size={12} />
                    Export thread
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Quick answer mode */}
        {(mode === 'quick' || mode === 'report') && (
          <>
            <div className="flex w-full flex-col gap-3">
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
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-14 text-base text-slate-900 shadow-e1 transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-brand-400"
                  disabled={loading || !!progress}
                />
                <button
                  onClick={() => submit(query)}
                  aria-label={loading || progress ? 'Submitting query' : 'Submit query'}
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

            {!hasResults && (
              <div className="flex w-full flex-col items-center gap-3">
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
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-200 dark:hover:bg-[rgb(var(--surface-300))]"
                    >
                      <span className="text-slate-400">{ex.desc}:</span> <span className="font-mono">{ex.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!hasResults && (
              <div className="mt-4 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
                {CAPABILITY_GRID.map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-100))]"
                  >
                    <Icon className="h-5 w-5 text-brand-500" />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Results area */}
      <div className="mx-auto mt-12 w-full max-w-4xl space-y-6">
        {progress && !report && (
          <section
            role="status"
            aria-live="polite"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-e1 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]"
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
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-500">
              Querying threat data sources and generating narrative
            </p>
          </div>
        )}

        {mode === 'chat' && error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <span className="font-mono">
              <AlertTriangle size={14} className="mr-1 inline" /> {error}
            </span>
          </div>
        )}

        {mode !== 'chat' && result && !loading && !report && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-e1 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">{result.query}</h2>
                  {badge && (
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                  {(() => {
                    const activeRole = ROLES.find((r) => r.id === role);
                    if (!activeRole) return null;
                    const RIcon = activeRole.icon;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${activeRole.color}`}
                      >
                        <RIcon size={10} />
                        {activeRole.label}
                      </span>
                    );
                  })()}
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
                    className={`rounded px-1.5 py-0.5 ${
                      result.confidence.score >= 70
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : result.confidence.score >= 40
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                    }`}
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
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400"
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
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Investigation Report</span>
                {result._meta && (
                  <span className="ml-auto font-mono text-[11px] text-slate-400">
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
                    <pre className="mt-2 max-h-48 overflow-auto overflow-x-auto rounded bg-slate-100 p-2 font-mono text-[11px] dark:bg-[rgb(var(--surface-200))]">
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

      {/* Chat input bar */}
      {mode === 'chat' && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/80 backdrop-blur-lg dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))/0.8]">
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
                    : chatMessages.length > 0
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

function FollowUpSuggestions({ content, onSubmit }: { content: string; onSubmit: (q: string) => void }) {
  const suggestions = generateFollowUps(content);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-[rgb(var(--border-400))]">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSubmit(s)}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-mono text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
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
}: {
  open: boolean;
  sessions: SessionItem[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-80 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] ${
          open ? 'translate-x-0' : '-translate-x-full'
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
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
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
      </div>
    </>
  );
}
