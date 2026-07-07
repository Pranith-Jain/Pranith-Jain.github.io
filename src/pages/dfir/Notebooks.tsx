import { useState, useEffect, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { api } from '../../lib/api-client';
import {
  Plus,
  Search,
  Loader2,
  BookOpen,
  Clock,
  Tag,
  AlertTriangle,
  CheckCircle,
  Archive,
  Pin,
  Trash2,
  FileText,
  Shield,
  Eye,
} from 'lucide-react';

interface Notebook {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'archived';
  tags: string[];
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

interface NotebookEntry {
  id: string;
  notebook_id: string;
  entry_type: 'note' | 'ioc' | 'finding' | 'timeline' | 'artifact';
  content: string;
  metadata: Record<string, unknown>;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface Stats {
  notebooks: number;
  entries: number;
  by_status: Record<string, number>;
  by_entry_type: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  investigating: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  resolved: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  archived: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400',
  low: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  medium: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  high: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',
  critical: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

const ENTRY_TYPE_ICONS: Record<string, typeof FileText> = {
  note: FileText,
  ioc: Shield,
  finding: AlertTriangle,
  timeline: Clock,
  artifact: Eye,
};

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  open: Eye,
  investigating: Search,
  resolved: CheckCircle,
  archived: Archive,
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function Notebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<Notebook['severity']>('info');
  const [creating, setCreating] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryType, setEntryType] = useState<NotebookEntry['entry_type']>('note');
  const [entryContent, setEntryContent] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);

  const loadNotebooks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      const [nbData, stData] = await Promise.all([
        api.get<{ notebooks: Notebook[]; total: number }>(`/api/v1/notebooks?${qs}`),
        api.get<Stats>('/api/v1/notebooks/stats'),
      ]);
      setNotebooks(nbData.notebooks);
      setStats(stData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notebooks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  const loadEntries = useCallback(async (nbId: string) => {
    setEntriesLoading(true);
    try {
      const data = await api.get<{ notebook: Notebook; entries: NotebookEntry[] }>(`/api/v1/notebooks/${nbId}`);
      setEntries(data.entries);
    } catch {
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedNotebook) {
      loadEntries(selectedNotebook);
    } else {
      setEntries([]);
    }
  }, [selectedNotebook, loadEntries]);

  const createNotebook = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/v1/notebooks', {
        title: newTitle.trim(),
        description: newDesc.trim(),
        severity: newSeverity,
      });
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewSeverity('info');
      loadNotebooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create notebook');
    } finally {
      setCreating(false);
    }
  };

  const deleteNotebook = async (id: string) => {
    if (!confirm('Delete this notebook and all its entries?')) return;
    try {
      await api.delete(`/api/v1/notebooks/${id}`);
      if (selectedNotebook === id) {
        setSelectedNotebook(null);
        setEntries([]);
      }
      loadNotebooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete notebook');
    }
  };

  const addEntry = async () => {
    if (!selectedNotebook || !entryContent.trim()) return;
    setAddingEntry(true);
    try {
      await api.post(`/api/v1/notebooks/${selectedNotebook}/entries`, {
        entry_type: entryType,
        content: entryContent.trim(),
      });
      setShowAddEntry(false);
      setEntryContent('');
      loadEntries(selectedNotebook);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add entry');
    } finally {
      setAddingEntry(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!selectedNotebook) return;
    try {
      await api.delete(`/api/v1/notebooks/${selectedNotebook}/entries/${entryId}`);
      loadEntries(selectedNotebook);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entry');
    }
  };

  const filtered = notebooks.filter(
    (nb) =>
      !search ||
      nb.title.toLowerCase().includes(search.toLowerCase()) ||
      nb.description.toLowerCase().includes(search.toLowerCase()) ||
      nb.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const selected = notebooks.find((nb) => nb.id === selectedNotebook);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        all tools
      </BackLink>

      <h1 className="font-display font-bold text-3xl mb-2">Investigation Notebooks</h1>
      <p className="text-sm font-mono text-muted mb-6 max-w-2xl">
        Persistent notes, IOC snapshots, and findings for DFIR investigations.
      </p>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-mono text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </span>
          <button
            onClick={() => setError('')}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Notebooks', value: stats.notebooks, icon: BookOpen },
            { label: 'Entries', value: stats.entries, icon: FileText },
            { label: 'Open', value: stats.by_status.open ?? 0, icon: Eye },
            { label: 'Investigating', value: stats.by_status.investigating ?? 0, icon: Search },
          ].map((s) => (
            <div
              key={s.label}
              className="p-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
            >
              <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">{s.value}</div>
              <div className="text-xs font-mono text-muted flex items-center gap-1.5">
                <s.icon size={12} /> {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar — notebook list */}
        <div className="lg:w-96 flex-shrink-0">
          {/* Controls */}
          <form onSubmit={(e) => e.preventDefault()} className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notebooks..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              type="button"
              className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm font-medium transition-colors"
            >
              <Plus size={16} />
            </button>
          </form>

          {/* Status filter */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {['', 'open', 'investigating', 'resolved', 'archived'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                  statusFilter === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {/* Notebook list */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-brand-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-mono">No notebooks yet</p>
              </div>
            ) : (
              filtered.map((nb) => {
                const StatusIcon = STATUS_ICON[nb.status] ?? Eye;
                return (
                  <div
                    key={nb.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNotebook(nb.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedNotebook(nb.id);
                    }}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      selectedNotebook === nb.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 dark:border-brand-500/40'
                        : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-300 dark:hover:border-brand-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIcon size={14} className="flex-shrink-0 text-muted" />
                          <span className="font-medium text-sm truncate">{nb.title}</span>
                        </div>
                        {nb.description && <p className="text-xs text-muted truncate ml-5">{nb.description}</p>}
                        <div className="flex items-center gap-2 mt-2 ml-5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${STATUS_COLORS[nb.status]}`}
                          >
                            {nb.status}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${SEVERITY_COLORS[nb.severity]}`}
                          >
                            {nb.severity}
                          </span>
                          <span className="text-[10px] text-muted font-mono flex items-center gap-1">
                            <Clock size={10} />
                            {timeAgo(nb.updated_at)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotebook(nb.id);
                        }}
                        className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Main — notebook detail */}
        <div className="flex-1 min-w-0">
          {!selectedNotebook ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted">
              <BookOpen size={48} className="mb-3 opacity-30" />
              <p className="text-sm font-mono">Select a notebook or create a new one</p>
            </div>
          ) : !selected ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={20} className="animate-spin text-brand-500" />
            </div>
          ) : (
            <div>
              {/* Notebook header */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-display font-semibold">{selected.title}</h2>
                    {selected.description && <p className="text-sm text-muted mt-1">{selected.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${STATUS_COLORS[selected.status]}`}
                      >
                        {selected.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${SEVERITY_COLORS[selected.severity]}`}
                      >
                        {selected.severity}
                      </span>
                      {selected.tags.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]"
                        >
                          <Tag size={10} />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddEntry(true)}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-mono text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <Plus size={14} className="inline mr-1" />
                    Add Entry
                  </button>
                </div>
              </div>

              {/* Add entry form */}
              {showAddEntry && (
                <div className="p-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-mono font-medium">New Entry</span>
                    <div className="flex gap-1 flex-wrap">
                      {(['note', 'ioc', 'finding', 'timeline', 'artifact'] as const).map((t) => {
                        const Icon = ENTRY_TYPE_ICONS[t] ?? FileText;
                        return (
                          <button
                            key={t}
                            onClick={() => setEntryType(t)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono transition-colors ${
                              entryType === t
                                ? 'bg-brand-600 text-white'
                                : 'bg-white dark:bg-[rgb(var(--surface-200))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]'
                            }`}
                          >
                            <Icon size={12} />
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <textarea
                    value={entryContent}
                    onChange={(e) => setEntryContent(e.target.value)}
                    placeholder={
                      entryType === 'ioc'
                        ? 'Paste IOCs (IPs, domains, hashes, URLs)...'
                        : entryType === 'finding'
                          ? 'Describe the finding...'
                          : entryType === 'timeline'
                            ? 'Timeline entry (e.g. "14:32 - Detected C2 beacon")'
                            : 'Write your note...'
                    }
                    rows={5}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      onClick={() => {
                        setShowAddEntry(false);
                        setEntryContent('');
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-mono text-muted hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addEntry}
                      disabled={addingEntry || !entryContent.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-mono text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {addingEntry ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Entries */}
              {entriesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-brand-500" />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <FileText size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-mono">No entries yet. Add your first note, IOC, or finding.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const Icon = ENTRY_TYPE_ICONS[entry.entry_type] ?? FileText;
                    return (
                      <div
                        key={entry.id}
                        className={`p-4 rounded-xl border ${
                          entry.pinned
                            ? 'border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5'
                            : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 mb-1">
                            {entry.pinned && <Pin size={12} className="text-brand-500" />}
                            <Icon size={14} className="text-muted" />
                            <span className="text-xs font-mono font-medium text-muted uppercase">
                              {entry.entry_type}
                            </span>
                            <span className="text-[10px] font-mono text-muted">{timeAgo(entry.created_at)}</span>
                          </div>
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <pre className="text-sm whitespace-pre-wrap font-mono mt-2 ml-5 text-slate-800 dark:text-slate-200">
                          {entry.content}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create notebook modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreate(false);
              setNewTitle('');
              setNewDesc('');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowCreate(false);
              setNewTitle('');
              setNewDesc('');
            }
          }}
        >
          <div className="w-full max-w-md mx-4 p-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-xl">
            <h3 className="text-lg font-display font-semibold mb-4">New Investigation Notebook</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="nb-title" className="block text-xs font-mono font-medium text-muted mb-1.5">
                  Title
                </label>
                <input
                  id="nb-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Phishing Campaign — example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="nb-desc" className="block text-xs font-mono font-medium text-muted mb-1.5">
                  Description
                </label>
                <textarea
                  id="nb-desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief summary of the investigation..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div>
                <span className="block text-xs font-mono font-medium text-muted mb-1.5">Severity</span>
                <div role="group" aria-label="Severity" className="flex gap-1.5 flex-wrap">
                  {(['info', 'low', 'medium', 'high', 'critical'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewSeverity(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-colors ${
                        newSeverity === s
                          ? `${SEVERITY_COLORS[s]} ring-1 ring-current`
                          : 'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewTitle('');
                  setNewDesc('');
                }}
                className="px-4 py-2 rounded-xl text-sm font-mono text-muted hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createNotebook}
                disabled={creating || !newTitle.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
