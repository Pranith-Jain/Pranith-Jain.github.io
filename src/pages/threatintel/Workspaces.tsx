import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { adminAuthHeaders } from '../../lib/admin-token';
import {
  Shield,
  Search,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  Target,
  Crosshair,
  BarChart3,
  FileText,
  Trash2,
  X,
  Plus,
  Loader2,
  Globe,
  Mail,
  User,
  AtSign,
  Server,
  Network,
} from 'lucide-react';

interface Workspace {
  id: string;
  title: string;
  description: string;
  target: string;
  targetType: string;
  phase: 'acquire' | 'enrich' | 'assess' | 'deliver' | 'complete';
  status: string;
  exposureScore: number;
  exposureLabel: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowSummary {
  workspace: Workspace;
  subjectsCount: number;
  findingsCount: number;
  currentPhase: string;
}

const PHASES = [
  {
    id: 'acquire',
    label: 'Acquire',
    icon: Search,
    color: 'text-blue-400',
    description: 'Collect raw data via multi-vector reconnaissance',
  },
  {
    id: 'enrich',
    label: 'Enrich',
    icon: Network,
    color: 'text-purple-400',
    description: 'Expand leads via lateral pivot and cross-referencing',
  },
  {
    id: 'assess',
    label: 'Assess',
    icon: BarChart3,
    color: 'text-amber-400',
    description: 'Score, verify, and build threat model from findings',
  },
  {
    id: 'deliver',
    label: 'Deliver',
    icon: FileText,
    color: 'text-green-400',
    description: 'Package intelligence into structured reports',
  },
  {
    id: 'complete',
    label: 'Complete',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    description: 'Investigation finished',
  },
] as const;

const TARGET_TYPES = [
  { value: 'domain', label: 'Domain', icon: Globe, placeholder: 'example.com' },
  { value: 'ip', label: 'IP Address', icon: Server, placeholder: '203.0.113.10' },
  { value: 'email', label: 'Email', icon: Mail, placeholder: 'user@example.com' },
  { value: 'person', label: 'Person', icon: User, placeholder: 'John Doe' },
  { value: 'username', label: 'Username', icon: AtSign, placeholder: 'johndoe' },
  { value: 'org', label: 'Organization', icon: Target, placeholder: 'Acme Corp' },
] as const;

const PHASE_COMMANDS: Record<string, string[]> = {
  acquire: [
    '/sweep',
    '/query',
    '/username',
    '/email-deep',
    '/subdomain',
    '/threat-check',
    '/breach-deep',
    '/github-osint',
  ],
  enrich: ['/branch', '/crossref', '/link-subjects', '/timeline'],
  assess: ['/exposure', '/threat-model', '/validate', '/coverage'],
  deliver: ['/report', '/report brief', '/brief', '/render entities'],
};

const SEVERITY_COLORS: Record<string, string> = {
  Minimal: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Elevated: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  Unknown: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formType, setFormType] = useState('domain');
  const [formDesc, setFormDesc] = useState('');

  const apiBase = '/api/v1';

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/workspaces?limit=50`, { headers: adminAuthHeaders() });
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    } catch {
      setError('Failed to load workspaces');
    }
    setLoading(false);
  }, []);

  const fetchSummary = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/workspaces/${id}/workflow/summary`, { headers: adminAuthHeaders() });
      const data = await res.json();
      setSummary(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);
  useEffect(() => {
    if (selectedId) fetchSummary(selectedId);
  }, [selectedId, fetchSummary]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    try {
      const res = await fetch(`${apiBase}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ title: formTitle, description: formDesc, target: formTarget, target_type: formType }),
      });
      if (res.ok) {
        const ws = await res.json();
        setShowCreate(false);
        setFormTitle('');
        setFormTarget('');
        setFormDesc('');
        await fetchWorkspaces();
        setSelectedId(ws.id);
      }
    } catch {
      setError('Failed to create workspace');
    }
  };

  const handleAdvance = async () => {
    if (!selectedId) return;
    setAdvancing(true);
    try {
      const res = await fetch(`${apiBase}/workspaces/${selectedId}/workflow/advance`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      if (res.ok) await fetchSummary(selectedId);
    } catch {
      /* ignore */
    }
    setAdvancing(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workspace?')) return;
    try {
      await fetch(`${apiBase}/workspaces/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
      if (selectedId === id) {
        setSelectedId(null);
        setSummary(null);
      }
      await fetchWorkspaces();
    } catch {
      /* ignore */
    }
  };

  const selected = workspaces.find((w) => w.id === selectedId);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Investigation Workspaces"
      description="AEAD lifecycle management — Acquire, Enrich, Assess, Deliver. Create workspaces to track structured investigations with subjects, connections, findings, and exposure scores."
      loading={loading && !showCreate}
      error={error}
      onRetry={() => {
        setError(null);
        fetchWorkspaces();
      }}
      empty={workspaces.length === 0 && !showCreate}
      emptyMessage="No workspaces yet. Create one to start an investigation."
      emptyIcon={<Shield size={32} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />}
      maxWidthClass="max-w-7xl"
      headerExtra={
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Workspace
        </button>
      }
    >
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create Investigation Workspace</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="ws-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  id="ws-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Phishing Campaign — example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="ws-target"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Target
                </label>
                <input
                  id="ws-target"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="example.com"
                />
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Type</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Target type">
                  {TARGET_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormType(t.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        formType === t.value
                          ? 'bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/30 text-brand-700 dark:text-brand-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <t.icon size={14} /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="ws-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  id="ws-desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Brief summary of the investigation..."
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar — workspace list */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Workspaces ({workspaces.length})
          </h2>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(ws.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId(ws.id);
                }
              }}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedId === ws.id
                  ? 'bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 dark:text-white text-sm truncate">{ws.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(ws.id);
                  }}
                  className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 p-1 rounded"
                  aria-label={`Delete ${ws.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SEVERITY_COLORS[ws.exposureLabel] || SEVERITY_COLORS.Unknown}`}
                >
                  {ws.exposureLabel} {ws.exposureScore > 0 ? `${ws.exposureScore}` : ''}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{ws.phase}</span>
              </div>
              {ws.target && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{ws.target}</p>}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500">
              <Crosshair size={40} className="mb-4 opacity-30" aria-hidden="true" />
              <p className="text-lg text-slate-600 dark:text-slate-300">Select a workspace</p>
              <p className="text-sm mt-1">Or create a new one to start an investigation</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Workspace header */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{selected.title}</h2>
                    {selected.description && (
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{selected.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-slate-500 dark:text-slate-400">
                      <span>
                        Target:{' '}
                        <span className="text-slate-900 dark:text-white font-medium">{selected.target || 'N/A'}</span>
                      </span>
                      <span>
                        Type:{' '}
                        <span className="text-slate-900 dark:text-white font-medium capitalize">
                          {selected.targetType}
                        </span>
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm px-3 py-1 rounded-full border font-medium ${SEVERITY_COLORS[selected.exposureLabel] || SEVERITY_COLORS.Unknown}`}
                  >
                    {selected.exposureLabel} {selected.exposureScore > 0 ? `${selected.exposureScore}/100` : ''}
                  </span>
                </div>
              </div>

              {/* Phase Progress */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
                  AEAD Phase Progress
                </h3>
                <div className="flex items-center gap-1">
                  {PHASES.map((phase, i) => {
                    const currentIdx = PHASES.findIndex((p) => p.id === selected.phase);
                    const isComplete = currentIdx > i;
                    const isCurrent = phase.id === selected.phase;
                    return (
                      <div key={phase.id} className="flex items-center flex-1">
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 transition-colors ${
                            isCurrent
                              ? 'bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30'
                              : isComplete
                                ? 'bg-emerald-50 dark:bg-emerald-500/5'
                                : 'opacity-40'
                          }`}
                        >
                          {isComplete ? (
                            <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                          ) : isCurrent ? (
                            <phase.icon size={16} className={`${phase.color} shrink-0`} />
                          ) : (
                            <phase.icon size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                          )}
                          <p
                            className={`text-xs font-medium ${isCurrent ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                          >
                            {phase.label}
                          </p>
                        </div>
                        {i < PHASES.length - 1 && (
                          <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 mx-1 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
                {summary && (
                  <div className="flex items-center gap-4 mt-4 text-sm text-slate-500 dark:text-slate-400">
                    <span>
                      {summary.subjectsCount} subject{summary.subjectsCount !== 1 ? 's' : ''}
                    </span>
                    <span>
                      {summary.findingsCount} finding{summary.findingsCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={handleAdvance}
                      disabled={advancing || selected.phase === 'complete'}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      {advancing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      Advance Phase
                    </button>
                  </div>
                )}
              </div>

              {/* Recommended Commands */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                  Recommended Commands —{' '}
                  <span className="capitalize text-slate-900 dark:text-white">{selected.phase}</span>
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {(PHASE_COMMANDS[selected.phase] || []).map((cmd) => (
                    <div
                      key={cmd}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <code className="text-sm text-brand-600 dark:text-brand-400 font-mono">{cmd}</code>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  Run these commands via MCP tools or the Copilot to collect intelligence for this phase.
                </p>
              </div>

              {/* Quick Links */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                  Quick Links
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/threatintel/tools/investigations"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/30 transition-colors text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Search size={14} /> Investigations
                  </Link>
                  <Link
                    to="/threatintel/tools/unified-search"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/30 transition-colors text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Crosshair size={14} /> Unified Search
                  </Link>
                  <Link
                    to="/threatintel/tools/mcp"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/30 transition-colors text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Shield size={14} /> MCP Tools
                  </Link>
                  <Link
                    to="/threatintel/tools/stix"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/30 transition-colors text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <FileText size={14} /> STIX Export
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
