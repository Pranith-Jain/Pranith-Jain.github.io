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
  open: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  investigating: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  archived: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-slate-500/15 text-slate-400',
  low: 'bg-blue-500/15 text-blue-400',
  medium: 'bg-amber-500/15 text-amber-400',
  high: 'bg-orange-500/15 text-orange-400',
  critical: 'bg-red-500/15 text-red-400',
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
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      const [nbData, stData] = await Promise.all([
        api.get<{ notebooks: Notebook[]; total: number }>(`/api/v1/notebooks?${qs}`),
        api.get<Stats>('/api/v1/notebooks/stats'),
      ]);
      setNotebooks(nbData.notebooks);
      setStats(stData);
    } catch {
      /* empty */
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
      /* empty */
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedNotebook) loadEntries(selectedNotebook);
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
    } catch {
      /* empty */
    } finally {
      setCreating(false);
    }
  };

  const deleteNotebook = async (id: string) => {
    if (!confirm('Delete this notebook and all its entries?')) return;
    try {
      await api.delete(`/api/v1/notebooks/${id}`);
      if (selectedNotebook === id) setSelectedNotebook(null);
      loadNotebooks();
    } catch {
      /* empty */
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
    } catch {
      /* empty */
    } finally {
      setAddingEntry(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!selectedNotebook) return;
    try {
      await api.delete(`/api/v1/notebooks/${selectedNotebook}/entries/${entryId}`);
      loadEntries(selectedNotebook);
    } catch {
      /* empty */
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
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <BackLink to="/dfir" label="Back to DFIR Tools" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-brand-500/10">
            <BookOpen className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Investigation Notebooks</h1>
            <p className="text-sm text-[var(--muted)]">
              Persistent notes, IOC snapshots, and findings for DFIR investigations
            </p>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Notebooks', value: stats.notebooks, icon: BookOpen },
              { label: 'Entries', value: stats.entries, icon: FileText },
              { label: 'Open', value: stats.by_status.open ?? 0, icon: Eye },
              { label: 'Investigating', value: stats.by_status.investigating ?? 0, icon: Search },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
              >
                <s.icon className="w-4 h-4 text-[var(--muted)]" />
                <div>
                  <div className="text-lg font-semibold text-[var(--text)]">{s.value}</div>
                  <div className="text-xs text-[var(--muted)]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar — notebook list */}
          <div className="lg:w-96 flex-shrink-0">
            {/* Controls */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notebooks..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                />
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New
              </button>
            </div>

            {/* Status filter */}
            <div className="flex gap-1 mb-3 flex-wrap">
              {['', 'open', 'investigating', 'resolved', 'archived'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-brand-600 text-white'
                      : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)] hover:border-brand-500/50'
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
                  <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)]">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No notebooks yet</p>
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
                      className={`p-3 rounded-lg cursor-pointer transition-all border ${
                        selectedNotebook === nb.id
                          ? 'bg-brand-500/10 border-brand-500/40'
                          : 'bg-[var(--surface)] border-[var(--border)] hover:border-brand-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="font-medium text-sm text-[var(--text)] truncate">{nb.title}</span>
                          </div>
                          {nb.description && (
                            <p className="text-xs text-[var(--muted)] truncate ml-5">{nb.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 ml-5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[nb.status]}`}
                            >
                              {nb.status}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SEVERITY_COLORS[nb.severity]}`}
                            >
                              {nb.severity}
                            </span>
                            <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(nb.updated_at)}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotebook(nb.id);
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
              <div className="flex flex-col items-center justify-center py-24 text-[var(--muted)]">
                <BookOpen className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Select a notebook or create a new one</p>
              </div>
            ) : !selected ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              </div>
            ) : (
              <div>
                {/* Notebook header */}
                <div className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--text)]">{selected.title}</h2>
                      {selected.description && (
                        <p className="text-sm text-[var(--muted)] mt-1">{selected.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selected.status]}`}>
                          {selected.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[selected.severity]}`}
                        >
                          {selected.severity}
                        </span>
                        {selected.tags.map((t) => (
                          <span
                            key={t}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]"
                          >
                            <Tag className="w-3 h-3" />
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddEntry(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Entry
                    </button>
                  </div>
                </div>

                {/* Add entry form */}
                {showAddEntry && (
                  <div className="p-4 rounded-lg bg-[var(--surface)] border border-brand-500/30 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-[var(--text)]">New Entry</span>
                      <div className="flex gap-1">
                        {(['note', 'ioc', 'finding', 'timeline', 'artifact'] as const).map((t) => {
                          const Icon = ENTRY_TYPE_ICONS[t] ?? FileText;
                          return (
                            <button
                              key={t}
                              onClick={() => setEntryType(t)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                entryType === t
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
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
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-y"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => {
                          setShowAddEntry(false);
                          setEntryContent('');
                        }}
                        className="px-3 py-1.5 rounded text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addEntry}
                        disabled={addingEntry || !entryContent.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {addingEntry ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Entries */}
                {entriesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-12 text-[var(--muted)]">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No entries yet. Add your first note, IOC, or finding.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const Icon = ENTRY_TYPE_ICONS[entry.entry_type] ?? FileText;
                      return (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-lg border ${
                            entry.pinned
                              ? 'bg-brand-500/5 border-brand-500/30'
                              : 'bg-[var(--surface)] border-[var(--border)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 mb-1">
                              {entry.pinned && <Pin className="w-3 h-3 text-brand-400" />}
                              <Icon className="w-3.5 h-3.5 text-[var(--muted)]" />
                              <span className="text-xs font-medium text-[var(--muted)] uppercase">
                                {entry.entry_type}
                              </span>
                              <span className="text-[10px] text-[var(--muted)]">{timeAgo(entry.created_at)}</span>
                            </div>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-1 rounded hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <pre className="text-sm text-[var(--text)] whitespace-pre-wrap font-mono mt-1 ml-5">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md mx-4 p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-4">New Investigation Notebook</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="nb-title" className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Title
                  </label>
                  <input
                    id="nb-title"
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Phishing Campaign — example.com"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  />
                </div>
                <div>
                  <label htmlFor="nb-desc" className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Description
                  </label>
                  <textarea
                    id="nb-desc"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief summary of the investigation..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
                  />
                </div>
                <div>
                  <span className="block text-xs font-medium text-[var(--muted)] mb-1">Severity</span>
                  <div role="group" aria-label="Severity" className="flex gap-1">
                    {(['info', 'low', 'medium', 'high', 'critical'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setNewSeverity(s)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          newSeverity === s
                            ? `${SEVERITY_COLORS[s]} ring-1 ring-current`
                            : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewTitle('');
                    setNewDesc('');
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createNotebook}
                  disabled={creating || !newTitle.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
