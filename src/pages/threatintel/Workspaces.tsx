/**
 * /threatintel/tools/workspaces -- Guided Investigation Workspaces
 *
 * AEAD lifecycle workspace management: create, browse, and walk through
 * Acquire → Enrich → Assess → Deliver phases with step-by-step guidance.
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
  ArrowLeft,
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
  { id: 'acquire', label: 'Acquire', icon: Search, color: 'text-blue-600 dark:text-blue-400' },
  { id: 'enrich', label: 'Enrich', icon: Network, color: 'text-violet-600 dark:text-violet-400' },
  { id: 'assess', label: 'Assess', icon: BarChart3, color: 'text-amber-600 dark:text-amber-400' },
  { id: 'deliver', label: 'Deliver', icon: FileText, color: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'complete', label: 'Complete', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
] as const;

const TARGET_TYPES = [
  { value: 'domain', label: 'Domain', icon: Globe },
  { value: 'ip', label: 'IP', icon: Server },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'person', label: 'Person', icon: User },
  { value: 'username', label: 'Username', icon: AtSign },
  { value: 'org', label: 'Org', icon: Target },
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

const SEV: Record<string, string> = {
  Minimal:
    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  Moderate:
    'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  Elevated:
    'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  Critical: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  Unknown: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
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

  const api = '/api/v1';

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/workspaces?limit=50`, { headers: adminAuthHeaders() });
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    } catch {
      setError('Failed to load workspaces');
    }
    setLoading(false);
  }, []);

  const fetchSummary = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${api}/workspaces/${id}/workflow/summary`, { headers: adminAuthHeaders() });
      setSummary(await res.json());
    } catch {
      /* */
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
      const res = await fetch(`${api}/workspaces`, {
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
      const res = await fetch(`${api}/workspaces/${selectedId}/workflow/advance`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      if (res.ok) await fetchSummary(selectedId);
    } catch {
      /* */
    }
    setAdvancing(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workspace?')) return;
    await fetch(`${api}/workspaces/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
    if (selectedId === id) {
      setSelectedId(null);
      setSummary(null);
    }
    fetchWorkspaces();
  };

  const selected = workspaces.find((w) => w.id === selectedId);

  // ── Detail View ────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
        <button
          onClick={() => {
            setSelectedId(null);
            setSummary(null);
          }}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">{selected.title}</h1>
            {selected.description && <p className="text-sm font-mono text-muted max-w-2xl">{selected.description}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-meta font-mono text-muted">
              <span>
                Target: <span className="text-slate-900 dark:text-slate-100">{selected.target || 'N/A'}</span>
              </span>
              <span>
                Type: <span className="text-slate-900 dark:text-slate-100 capitalize">{selected.targetType}</span>
              </span>
            </div>
          </div>
          <span
            className={`text-micro font-mono font-semibold px-2 py-0.5 rounded-full border ${SEV[selected.exposureLabel] || SEV.Unknown}`}
          >
            {selected.exposureLabel} {selected.exposureScore > 0 ? `${selected.exposureScore}/100` : ''}
          </span>
        </div>

        {/* Phase Progress */}
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
          <h2 className="font-display font-semibold text-sm mb-3">AEAD Phase Progress</h2>
          <div className="flex items-center gap-1">
            {PHASES.map((phase, i) => {
              const isComplete = PHASES.findIndex((p) => p.id === selected.phase) > i;
              const isCurrent = phase.id === selected.phase;
              return (
                <div key={phase.id} className="flex items-center flex-1">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded flex-1 text-mini font-mono ${
                      isCurrent
                        ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 font-semibold'
                        : isComplete
                          ? 'bg-emerald-50 dark:bg-emerald-900/10'
                          : 'opacity-40'
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <phase.icon className={`w-3.5 h-3.5 ${isCurrent ? phase.color : 'text-slate-400'} shrink-0`} />
                    )}
                    <span
                      className={
                        isCurrent ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
                      }
                    >
                      {phase.label}
                    </span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-0.5 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          {summary && (
            <div className="flex items-center gap-4 mt-3 text-mini font-mono text-muted">
              <span>{summary.subjectsCount} subject(s)</span>
              <span>{summary.findingsCount} finding(s)</span>
              <button
                onClick={handleAdvance}
                disabled={advancing || selected.phase === 'complete'}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-mini font-mono font-semibold transition-colors disabled:opacity-50"
              >
                {advancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                Advance
              </button>
            </div>
          )}
        </div>

        {/* Recommended Commands */}
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
          <h2 className="font-display font-semibold text-sm mb-2">
            Recommended — <span className="text-brand-600 dark:text-brand-400 capitalize">{selected.phase}</span>
          </h2>
          <div className="grid grid-cols-2 gap-1.5">
            {(PHASE_COMMANDS[selected.phase] || []).map((cmd) => (
              <div
                key={cmd}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] rounded border border-slate-100 dark:border-[rgb(var(--border-300))]"
              >
                <code className="text-mini font-mono text-brand-600 dark:text-brand-400">{cmd}</code>
              </div>
            ))}
          </div>
          <p className="text-micro font-mono text-muted mt-2">Run via MCP tools or the Copilot.</p>
        </div>

        {/* Quick Links */}
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <h2 className="font-display font-semibold text-sm mb-2">Quick Links</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['/threatintel/tools/investigations', 'Investigations', Search],
                ['/threatintel/tools/unified-search', 'Unified Search', Crosshair],
                ['/threatintel/tools/mcp', 'MCP Tools', Shield],
                ['/threatintel/tools/stix', 'STIX Export', FileText],
              ] as const
            ).map(([to, label, Icon]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] rounded border border-slate-100 dark:border-[rgb(var(--border-300))] hover:border-brand-300 dark:hover:border-brand-700 transition-colors text-mini font-mono text-muted hover:text-slate-900 dark:hover:text-slate-100"
              >
                <Icon className="w-3 h-3" /> {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Investigation Workspaces</h1>
          <p className="text-sm font-mono text-muted max-w-2xl">
            AEAD lifecycle management — Acquire, Enrich, Assess, Deliver. Create workspaces to track investigations
            through structured intelligence phases.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          <Plus size={14} /> New Workspace
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center gap-2 font-mono text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
        >
          <h2 className="font-display font-semibold text-sm mb-3">New Investigation Workspace</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <input
                id="ws-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Investigation title"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-tool focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <input
                id="ws-target"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="Target (domain, IP, email...)"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-tool focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Target type">
              {TARGET_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFormType(t.value)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-mini font-mono border transition-colors ${
                    formType === t.value
                      ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300'
                      : 'bg-slate-50 dark:bg-[rgb(var(--surface-100))] border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <t.icon className="w-3 h-3" /> {t.label}
                </button>
              ))}
            </div>
            <div className="sm:col-span-2">
              <textarea
                id="ws-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-meta font-mono text-muted hover:text-slate-900 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded hover:bg-brand-700 dark:hover:bg-brand-400"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted py-12 justify-center font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading workspaces...
        </div>
      )}

      {!loading && workspaces.length === 0 && (
        <div className="text-center py-16 text-muted">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-display font-semibold text-lg mb-1">No workspaces yet</p>
          <p className="font-mono text-sm mb-3">Create a workspace to start a structured investigation</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-mono text-sm font-semibold"
          >
            Create your first workspace
          </button>
        </div>
      )}

      {!loading && workspaces.length > 0 && (
        <div className="space-y-2">
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
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 hover:border-brand-500/40 transition-colors p-4 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {ws.title}
                    </h3>
                    <span
                      className={`text-micro font-mono font-semibold px-1.5 py-0.5 rounded border ${SEV[ws.exposureLabel] || SEV.Unknown}`}
                    >
                      {ws.exposureLabel} {ws.exposureScore > 0 ? `${ws.exposureScore}` : ''}
                    </span>
                    <span className="text-micro font-mono text-muted capitalize">{ws.phase}</span>
                  </div>
                  {ws.target && <p className="text-meta font-mono text-slate-500 truncate">{ws.target}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ws.id);
                    }}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Delete workspace"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
