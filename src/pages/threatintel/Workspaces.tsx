/**
 * /threatintel/tools/workspaces -- Guided Investigation Workspaces
 *
 * AEAD lifecycle workspace management: create, browse, and walk through
 * Acquire → Enrich → Assess → Deliver phases with step-by-step guidance.
 * Uses the new workspace API backed by D1.
 */

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { adminAuthHeaders } from '../../lib/admin-token';
import {
  Plus,
  Loader2,
  AlertTriangle,
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
  Globe,
  Mail,
  User,
  AtSign,
  Server,
  Network,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  // Create form
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
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <BackLink to="/threatintel" />

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] flex items-center gap-3">
              <Shield className="w-8 h-8 text-brand-500" />
              Investigation Workspaces
            </h1>
            <p className="text-[var(--text-secondary)] mt-2">
              AEAD lifecycle management — Acquire, Enrich, Assess, Deliver
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New Workspace
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 w-full max-w-lg">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Create Investigation Workspace</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label htmlFor="ws-title" className="block text-sm text-[var(--text-secondary)] mb-1">
                    Title *
                  </label>
                  <input
                    id="ws-title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
                    placeholder="Phishing Campaign — example.com"
                  />
                </div>
                <div>
                  <label htmlFor="ws-target" className="block text-sm text-[var(--text-secondary)] mb-1">
                    Target
                  </label>
                  <input
                    id="ws-target"
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
                    placeholder="example.com"
                  />
                </div>
                <div>
                  <span className="block text-sm text-[var(--text-secondary)] mb-1">Target Type</span>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Target type">
                    {TARGET_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFormType(t.value)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                          formType === t.value
                            ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                            : 'bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <t.icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="ws-desc" className="block text-sm text-[var(--text-secondary)] mb-1">
                    Description
                  </label>
                  <textarea
                    id="ws-desc"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
                    placeholder="Brief summary of the investigation..."
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workspace list */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Workspaces ({workspaces.length})
            </h2>
            {loading ? (
              <div className="flex items-center gap-2 text-[var(--text-secondary)] py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading...
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No workspaces yet</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 text-brand-400 hover:text-brand-300 text-sm"
                >
                  Create your first workspace
                </button>
              </div>
            ) : (
              workspaces.map((ws) => (
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
                      ? 'bg-brand-500/10 border-brand-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)] text-sm truncate">{ws.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ws.id);
                      }}
                      className="text-[var(--text-secondary)] hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[ws.exposureLabel] || SEVERITY_COLORS.Unknown}`}
                    >
                      {ws.exposureLabel} {ws.exposureScore > 0 ? `${ws.exposureScore}` : ''}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] capitalize">{ws.phase}</span>
                  </div>
                  {ws.target && <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{ws.target}</p>}
                </div>
              ))
            )}
          </div>

          {/* Workspace detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="flex flex-col items-center justify-center py-24 text-[var(--text-secondary)]">
                <Crosshair className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg">Select a workspace to view details</p>
                <p className="text-sm mt-1">Or create a new one to start an investigation</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-[var(--text-primary)]">{selected.title}</h2>
                      {selected.description && (
                        <p className="text-[var(--text-secondary)] mt-1">{selected.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-sm text-[var(--text-secondary)]">
                          Target: <span className="text-[var(--text-primary)]">{selected.target || 'N/A'}</span>
                        </span>
                        <span className="text-sm text-[var(--text-secondary)]">
                          Type: <span className="text-[var(--text-primary)] capitalize">{selected.targetType}</span>
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-sm px-3 py-1 rounded-full border ${SEVERITY_COLORS[selected.exposureLabel] || SEVERITY_COLORS.Unknown}`}
                    >
                      {selected.exposureLabel} {selected.exposureScore > 0 ? `${selected.exposureScore}/100` : ''}
                    </span>
                  </div>
                </div>

                {/* Phase Progress */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
                  <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                    AEAD Phase Progress
                  </h3>
                  <div className="flex items-center gap-1">
                    {PHASES.map((phase, i) => {
                      const isComplete = PHASES.findIndex((p) => p.id === selected.phase) > i;
                      const isCurrent = phase.id === selected.phase;
                      return (
                        <div key={phase.id} className="flex items-center flex-1">
                          <div
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 ${
                              isCurrent
                                ? 'bg-brand-500/10 border border-brand-500/30'
                                : isComplete
                                  ? 'bg-emerald-500/5'
                                  : 'opacity-50'
                            }`}
                          >
                            {isComplete ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : isCurrent ? (
                              <phase.icon className={`w-4 h-4 ${phase.color} shrink-0`} />
                            ) : (
                              <phase.icon className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-medium ${isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                              >
                                {phase.label}
                              </p>
                            </div>
                          </div>
                          {i < PHASES.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] mx-1 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {summary && (
                    <div className="flex items-center gap-4 mt-4 text-sm text-[var(--text-secondary)]">
                      <span>{summary.subjectsCount} subject(s)</span>
                      <span>{summary.findingsCount} finding(s)</span>
                      <button
                        onClick={handleAdvance}
                        disabled={advancing || selected.phase === 'complete'}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {advancing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        Advance Phase
                      </button>
                    </div>
                  )}
                </div>

                {/* Recommended Commands */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
                  <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Recommended Commands —{' '}
                    <span className="capitalize text-[var(--text-primary)]">{selected.phase}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(PHASE_COMMANDS[selected.phase] || []).map((cmd) => (
                      <div
                        key={cmd}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]"
                      >
                        <code className="text-sm text-brand-400 font-mono">{cmd}</code>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-3">
                    Run these commands via MCP tools or the Copilot to collect intelligence for this phase.
                  </p>
                </div>

                {/* Quick Links */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
                  <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Quick Links
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/threatintel/tools/investigations"
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] hover:border-brand-500/30 transition-colors text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Search className="w-4 h-4" /> Investigations
                    </Link>
                    <Link
                      to="/threatintel/tools/unified-search"
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] hover:border-brand-500/30 transition-colors text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Crosshair className="w-4 h-4" /> Unified Search
                    </Link>
                    <Link
                      to="/threatintel/tools/mcp"
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] hover:border-brand-500/30 transition-colors text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Shield className="w-4 h-4" /> MCP Tools
                    </Link>
                    <Link
                      to="/threatintel/tools/stix"
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] hover:border-brand-500/30 transition-colors text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <FileText className="w-4 h-4" /> STIX Export
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
