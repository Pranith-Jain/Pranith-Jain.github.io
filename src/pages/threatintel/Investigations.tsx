import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import { SEVERITY_TONE } from '../../components/severity';
import { SeverityPill } from '../../components/SeverityPill';
import { adminAuthHeaders } from '../../lib/admin-token';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ListTodo,
  X,
  FileDown,
} from 'lucide-react';

interface Observable {
  id: string;
  value: string;
  type: string;
  description?: string;
  tags: string[];
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  created_at: string;
}

interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface Investigation {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tlp: 'white' | 'green' | 'amber' | 'red';
  status: 'open' | 'in-progress' | 'closed';
  tags: string[];
  created_at: string;
  updated_at: string;
  observables: Observable[];
  tasks: Task[];
  timeline: TimelineEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-slate-200 dark:bg-slate-800 text-muted',
  'in-progress': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  closed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

const TLP_COLORS: Record<string, string> = {
  white: 'bg-slate-200 dark:bg-slate-800 text-muted',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InvestigationsPage(): JSX.Element {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeInv, setActiveInv] = useState<Investigation | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [obsValue, setObsValue] = useState('');
  const [obsType, setObsType] = useState('ipv4');
  const [taskTitle, setTaskTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'medium' as Investigation['severity'],
    tlp: 'amber' as Investigation['tlp'],
    tags: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/investigations', { headers: adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { investigations: Investigation[] };
      setInvestigations(data.investigations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setInvestigations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshInvestigation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/investigations/${id}`, { headers: adminAuthHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { investigation: Investigation };
      setActiveInv(data.investigation);
      setInvestigations((prev) => prev.map((i) => (i.id === id ? data.investigation : i)));
    } catch {
      /* ignore */
    }
  }, []);

  const createInvestigation = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;
    try {
      const res = await fetch('/api/v1/investigations', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description,
          severity: createForm.severity,
          tlp: createForm.tlp,
          tags: createForm.tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { investigation: Investigation };
      setInvestigations((prev) => [data.investigation, ...prev]);
      setActiveInv(data.investigation);
      setShowCreate(false);
      setCreateForm({ title: '', description: '', severity: 'medium', tlp: 'amber', tags: '' });
    } catch {
      /* ignore */
    }
  };

  const updateStatus = async (id: string, status: Investigation['status']) => {
    try {
      const res = await fetch(`/api/v1/investigations/${id}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { investigation: Investigation };
      setActiveInv(data.investigation);
      setInvestigations((prev) => prev.map((i) => (i.id === id ? data.investigation : i)));
    } catch {
      /* ignore */
    }
  };

  const deleteInvestigation = async (id: string) => {
    try {
      await fetch(`/api/v1/investigations/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
      setInvestigations((prev) => prev.filter((i) => i.id !== id));
      if (activeInv?.id === id) setActiveInv(null);
    } catch {
      /* ignore */
    }
  };

  const addObservable = async () => {
    if (!obsValue.trim() || !activeInv) return;
    try {
      await fetch(`/api/v1/investigations/${activeInv.id}/observables`, {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ value: obsValue.trim(), type: obsType }),
      });
      setObsValue('');
      await refreshInvestigation(activeInv.id);
    } catch {
      /* ignore */
    }
  };

  const removeObservable = async (obsId: string) => {
    if (!activeInv) return;
    try {
      await fetch(`/api/v1/investigations/${activeInv.id}/observables/${obsId}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      await refreshInvestigation(activeInv.id);
    } catch {
      /* ignore */
    }
  };

  const addTask = async () => {
    if (!taskTitle.trim() || !activeInv) return;
    try {
      await fetch(`/api/v1/investigations/${activeInv.id}/tasks`, {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ title: taskTitle.trim() }),
      });
      setTaskTitle('');
      await refreshInvestigation(activeInv.id);
    } catch {
      /* ignore */
    }
  };

  const updateTask = async (taskId: string, status: Task['status']) => {
    if (!activeInv) return;
    try {
      await fetch(`/api/v1/investigations/${activeInv.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refreshInvestigation(activeInv.id);
    } catch {
      /* ignore */
    }
  };

  const addNote = async () => {
    if (!noteText.trim() || !activeInv) return;
    try {
      await fetch(`/api/v1/investigations/${activeInv.id}/notes`, {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ message: noteText.trim() }),
      });
      setNoteText('');
      await refreshInvestigation(activeInv.id);
    } catch {
      /* ignore */
    }
  };

  const updateSeverity = async (severity: Investigation['severity']) => {
    if (!activeInv) return;
    try {
      const res = await fetch(`/api/v1/investigations/${activeInv.id}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ severity }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { investigation: Investigation };
      setActiveInv(data.investigation);
      setInvestigations((prev) => prev.map((i) => (i.id === activeInv.id ? data.investigation : i)));
    } catch {
      /* ignore */
    }
  };

  const filtered = investigations.filter((inv) => {
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && inv.severity !== filterSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !inv.title.toLowerCase().includes(q) &&
        !inv.description.toLowerCase().includes(q) &&
        !inv.tags.some((t) => t.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  const exportJson = () => {
    if (!activeInv) return;
    const blob = new Blob([JSON.stringify(activeInv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation-${activeInv.title.replace(/[^a-z0-9]+/gi, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (activeInv) {
    const inv = activeInv;
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
        <button
          type="button"
          onClick={() => setActiveInv(null)}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
        >
          <ArrowLeft size={14} /> back to investigations
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">{inv.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityPill tone={inv.severity} className="px-2 text-mini">
                {inv.severity}
              </SeverityPill>
              <span className={`text-mini font-mono px-2 py-0.5 rounded ${STATUS_COLORS[inv.status]}`}>
                {inv.status}
              </span>
              <span className={`text-mini font-mono px-2 py-0.5 rounded border ${TLP_COLORS[inv.tlp]}`}>
                TLP:{inv.tlp.toUpperCase()}
              </span>
              {inv.tags.map((t) => (
                <span
                  key={t}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportJson}
              className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
            >
              <FileDown size={11} /> JSON
            </button>
            <button
              type="button"
              onClick={() => deleteInvestigation(inv.id)}
              className="text-mini font-mono px-2 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-500 hover:bg-rose-500/10 inline-flex items-center gap-1"
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>
        </div>

        {inv.description && <p className="text-sm font-mono text-muted mb-6">{inv.description}</p>}

        <div className="flex gap-2 mb-6">
          <span className="text-mini font-mono text-slate-500 dark:text-slate-400">Severity:</span>
          {(['low', 'medium', 'high', 'critical'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateSeverity(s)}
              className={
                inv.severity === s
                  ? `text-mini font-mono px-2 py-0.5 rounded border ${SEVERITY_TONE[s]}`
                  : 'text-mini font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500'
              }
            >
              {s}
            </button>
          ))}
          <span className="ml-4 text-mini font-mono text-slate-500">Status:</span>
          {(['open', 'in-progress', 'closed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateStatus(inv.id, s)}
              className={`text-mini font-mono px-2 py-0.5 rounded ${inv.status === s ? STATUS_COLORS[s] : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {s === 'in-progress' ? 'in progress' : s}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                <ShieldAlert size={14} /> Observables ({inv.observables.length})
              </h2>
              <div className="flex gap-2 mb-3">
                <select
                  value={obsType}
                  onChange={(e) => setObsType(e.target.value)}
                  className="text-meta font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
                >
                  <option value="ipv4">IPv4</option>
                  <option value="ipv6">IPv6</option>
                  <option value="domain">Domain</option>
                  <option value="url">URL</option>
                  <option value="hash">Hash</option>
                  <option value="email">Email</option>
                </select>
                <input
                  type="text"
                  value={obsValue}
                  onChange={(e) => setObsValue(e.target.value)}
                  placeholder="observable value"
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addObservable();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void addObservable()}
                  disabled={!obsValue.trim()}
                  className="px-3 py-1.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-mini rounded disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
                >
                  <Plus size={12} />
                </button>
              </div>
              {inv.observables.length === 0 ? (
                <p className="text-meta font-mono text-slate-500 text-center py-4">No observables added yet</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {inv.observables.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-micro font-mono uppercase text-slate-400 shrink-0 w-10">{o.type}</span>
                        <span className="text-meta font-mono text-slate-800 dark:text-slate-200 break-all">
                          {o.value}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeObservable(o.id)}
                        className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                <ListTodo size={14} /> Tasks ({inv.tasks.filter((t) => t.status !== 'completed').length} open)
              </h2>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="new task"
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addTask();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void addTask()}
                  disabled={!taskTitle.trim()}
                  className="px-3 py-1.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-mini rounded disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
                >
                  <Plus size={12} />
                </button>
              </div>
              {inv.tasks.length === 0 ? (
                <p className="text-meta font-mono text-slate-500 text-center py-4">No tasks yet</p>
              ) : (
                <div className="space-y-1">
                  {inv.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <button
                        type="button"
                        onClick={() => void updateTask(t.id, t.status === 'completed' ? 'pending' : 'completed')}
                        className="shrink-0"
                      >
                        {t.status === 'completed' ? (
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                        )}
                      </button>
                      <span
                        className={`text-meta font-mono flex-1 ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}
                      >
                        {t.title}
                      </span>
                      {t.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void updateTask(t.id, 'in-progress')}
                          className="text-micro font-mono text-blue-500 hover:underline"
                        >
                          start
                        </button>
                      )}
                      {t.status === 'in-progress' && (
                        <span className="text-micro font-mono text-blue-500 flex items-center gap-1">
                          <Clock size={10} /> in progress
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock size={14} /> Timeline
              </h2>
              <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {[...inv.timeline].reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="relative pl-4 border-l-2 border-slate-200 dark:border-[rgb(var(--border-400))]"
                  >
                    <p className="text-meta font-mono text-slate-700 dark:text-slate-300 leading-snug">{ev.message}</p>
                    <p className="text-micro font-mono text-slate-400 mt-0.5">{relativeTime(ev.created_at)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="add a note…"
                    className="flex-1 px-3 py-1.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addNote();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void addNote()}
                    disabled={!noteText.trim()}
                    className="px-3 py-1.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-mini rounded disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
                  >
                    Add
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
              <h2 className="font-display font-semibold text-sm mb-2">Meta</h2>
              <div className="text-mini font-mono text-slate-500 space-y-1">
                <p>Created: {new Date(inv.created_at).toLocaleString()}</p>
                <p>Updated: {new Date(inv.updated_at).toLocaleString()}</p>
                <p>TLP: {inv.tlp.toUpperCase()}</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Investigations</h1>
          <p className="text-sm font-mono text-muted max-w-2xl">
            Case management board — create investigations, track observables, manage tasks, and document your analysis
            timeline. Inspired by TheHive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          <Plus size={14} /> New Investigation
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search investigations…"
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="text-meta font-mono px-2 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 text-slate-700 dark:text-slate-300"
        >
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-meta font-mono px-2 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 text-slate-700 dark:text-slate-300"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void createInvestigation(e)}
          className="mb-6 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
        >
          <h2 className="font-display font-semibold text-sm mb-3">New Investigation</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Investigation title"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-tool focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
            <select
              value={createForm.severity}
              onChange={(e) => setCreateForm((p) => ({ ...p, severity: e.target.value as Investigation['severity'] }))}
              className="text-meta font-mono px-2 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select
              value={createForm.tlp}
              onChange={(e) => setCreateForm((p) => ({ ...p, tlp: e.target.value as Investigation['tlp'] }))}
              className="text-meta font-mono px-2 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
            >
              <option value="white">TLP:WHITE</option>
              <option value="green">TLP:GREEN</option>
              <option value="amber">TLP:AMBER</option>
              <option value="red">TLP:RED</option>
            </select>
            <div className="sm:col-span-2">
              <input
                type="text"
                value={createForm.tags}
                onChange={(e) => setCreateForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="Tags (comma separated)"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!createForm.title.trim()}
              className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono text-meta font-semibold rounded disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 font-mono text-meta rounded hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 mb-6">
          <p className="text-tool font-mono text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-12 text-center">
          <Loader2 size={20} className="animate-spin mx-auto text-slate-400 mb-2" />
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">Loading investigations…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-12 text-center">
          <AlertTriangle size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-mono text-slate-500">
            {search || filterSeverity !== 'all' || filterStatus !== 'all'
              ? 'No matching investigations'
              : 'No investigations yet'}
          </p>
          <p className="text-xs font-mono text-slate-400 mt-1">
            {search || filterSeverity !== 'all' || filterStatus !== 'all'
              ? 'Try different filters'
              : 'Create your first investigation to start tracking security cases'}
          </p>
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActiveInv(inv);
              }}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 hover:border-brand-500/40 transition-colors p-4 cursor-pointer"
              onClick={() => setActiveInv(inv)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{inv.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <SeverityPill tone={inv.severity}>{inv.severity}</SeverityPill>
                    <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${STATUS_COLORS[inv.status]}`}>
                      {inv.status}
                    </span>
                    <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${TLP_COLORS[inv.tlp]}`}>
                      TLP:{inv.tlp.toUpperCase()}
                    </span>
                    {inv.tags.map((t) => (
                      <span
                        key={t}
                        className="text-micro font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {inv.description && (
                    <p className="text-meta font-mono text-slate-500 mt-1 line-clamp-1">{inv.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-micro font-mono text-slate-400">
                  <p>{inv.observables.length} observables</p>
                  <p>{inv.tasks.filter((t) => t.status !== 'completed').length} open tasks</p>
                  <p className="mt-1">{relativeTime(inv.updated_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InvestigationsPage;
