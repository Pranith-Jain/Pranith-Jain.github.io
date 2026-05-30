import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Search,
  Loader2,
  Trash2,
  Plus,
  X,
  FileText,
  Filter,
  CheckCircle2,
  HelpCircle,
  Brain,
  Database,
} from 'lucide-react';

interface ProviderVerdict {
  provider: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score: number;
  category: string;
}

interface ObservableNote {
  id: string;
  text: string;
  created_at: string;
  author: string;
}

interface ObservableEntry {
  id: string;
  indicator: string;
  type: string;
  composite_score: number;
  provider_count: number;
  verdicts: ProviderVerdict[];
  tags: string[];
  notes: ObservableNote[];
  tlp: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_checked_at: string | null;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function scoreColor(s: number): string {
  if (s >= 70) return 'text-rose-500';
  if (s >= 40) return 'text-amber-500';
  return 'text-emerald-500';
}

function scoreBg(s: number): string {
  if (s >= 70) return 'bg-rose-500';
  if (s >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function typeIcon(t: string): string {
  if (t === 'ip') return 'IP';
  if (t === 'domain') return 'DN';
  if (t === 'url') return 'UR';
  if (t === 'hash') return 'HX';
  if (t === 'email') return 'EM';
  return '??';
}

function verdictIcon(v: string) {
  if (v === 'malicious') return <CheckCircle2 size={10} className="text-rose-500" />;
  if (v === 'suspicious') return <Brain size={10} className="text-amber-500" />;
  if (v === 'clean') return <CheckCircle2 size={10} className="text-emerald-500" />;
  return <HelpCircle size={10} className="text-slate-400" />;
}

const TLP_COLORS: Record<string, string> = {
  white: 'bg-slate-200 text-slate-700',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
};

export default function ObservableDb(): JSX.Element {
  const [entries, setEntries] = useState<ObservableEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState<ObservableEntry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addIndicator, setAddIndicator] = useState('');
  const [addType, setAddType] = useState('ip');
  const [addTags, setAddTags] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (typeFilter) params.set('type', typeFilter);
      if (minScore > 0) params.set('min_score', String(minScore));
      params.set('limit', '100');
      params.set('sort', 'updated_at');
      params.set('order', 'desc');

      const res = await fetch(`/api/v1/observable-db?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { entries: ObservableEntry[]; total: number };
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter, minScore]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addObservable = async (e: FormEvent) => {
    e.preventDefault();
    if (!addIndicator.trim()) return;
    try {
      const res = await fetch('/api/v1/observable-db', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          indicator: addIndicator.trim(),
          type: addType,
          tags: addTags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          composite_score: 0,
          verdicts: [],
        }),
      });
      if (!res.ok) return;
      setShowAddForm(false);
      setAddIndicator('');
      setAddType('ip');
      setAddTags('');
      void fetchData();
    } catch {
      /* ignore */
    }
  };

  const deleteObservable = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/observable-db/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((prev) => prev - 1);
      if (selected?.id === id) setSelected(null);
    } catch {
      /* ignore */
    }
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !noteText.trim()) return;
    try {
      const res = await fetch(`/api/v1/observable-db/${selected.id}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: noteText.trim(), author: noteAuthor.trim() || 'anonymous' }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { entry: ObservableEntry };
      setSelected(data.entry);
      setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
      setNoteText('');
    } catch {
      /* ignore */
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/v1/observable-db/${selected.id}/notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) return;
      const data = (await res.json()) as { entry: ObservableEntry };
      setSelected(data.entry);
      setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
    } catch {
      /* ignore */
    }
  };

  const updateTags = async (id: string, tags: string[]) => {
    try {
      const res = await fetch(`/api/v1/observable-db/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { entry: ObservableEntry };
      setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
      if (selected?.id === id) setSelected(data.entry);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Observable Database</h1>
          <p className="text-sm font-mono text-slate-600 dark:text-slate-400 max-w-2xl">
            Persistent IOC storage with enrichment history, tags, and notes. Inspired by Yeti.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          <Plus size={14} /> Add Observable
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={(e) => void addObservable(e)}
          className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        >
          <h2 className="font-display font-semibold text-sm mb-3">Add Observable Manually</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={addIndicator}
              onChange={(e) => setAddIndicator(e.target.value)}
              placeholder="Indicator value (IP, domain, hash…)"
              className="flex-1 min-w-[200px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[13px] focus:outline-none focus:border-brand-500"
            />
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[12px]"
            >
              <option value="ip">IP</option>
              <option value="domain">Domain</option>
              <option value="url">URL</option>
              <option value="hash">Hash</option>
              <option value="email">Email</option>
            </select>
            <input
              type="text"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
              placeholder="Tags (comma)"
              className="w-48 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[12px] focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={!addIndicator.trim()}
              className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono text-[12px] font-semibold rounded disabled:opacity-30"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 font-mono text-[12px] rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators or tags…"
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[13px] focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[12px]"
        >
          <option value="">All types</option>
          <option value="ip">IP</option>
          <option value="domain">Domain</option>
          <option value="url">URL</option>
          <option value="hash">Hash</option>
          <option value="email">Email</option>
        </select>
        <div className="flex items-center gap-2 text-[12px] font-mono text-slate-500">
          <Filter size={12} />
          <span>Min score:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <span className="w-6 text-right">{minScore}</span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">{total} observables</span>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 mb-6">
          <p className="text-[13px] font-mono text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className={`${selected ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {loading && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-400 mb-2" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
              <Database size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-mono text-slate-500">No observables saved yet</p>
              <p className="text-xs font-mono text-slate-400 mt-1">
                Use the analysis page to check IOCs and save results here, or add manually
              </p>
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelected(entry);
                  }}
                  onClick={() => setSelected(entry)}
                  className={`rounded-lg border bg-white dark:bg-slate-900 p-3 cursor-pointer transition-all hover:border-brand-400 ${
                    selected?.id === entry.id
                      ? 'border-brand-500 ring-1 ring-brand-500'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-7 h-5 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold text-slate-500">
                      {typeIcon(entry.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold truncate">{entry.indicator}</span>
                        <span
                          className={`px-1 py-0.5 rounded text-[9px] font-mono font-semibold ${TLP_COLORS[entry.tlp] ?? TLP_COLORS.amber}`}
                        >
                          {entry.tlp.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-slate-400">
                        <span className={scoreColor(entry.composite_score)}>{entry.composite_score}%</span>
                        <span>{entry.provider_count} sources</span>
                        <span>Updated {timeAgo(entry.updated_at)} ago</span>
                      </div>
                      <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreBg(entry.composite_score)} transition-all`}
                          style={{ width: `${entry.composite_score}%` }}
                        />
                      </div>
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-mono text-slate-500"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteObservable(entry.id);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-sm">Details</h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4 text-[12px] font-mono">
                <div>
                  <span className="text-slate-400 text-[10px]">Indicator</span>
                  <p className="text-[13px] font-semibold break-all">{selected.indicator}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 text-[10px]">Type</span>
                    <p className="font-semibold capitalize">{selected.type}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">TLP</span>
                    <p>
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] font-semibold ${TLP_COLORS[selected.tlp] ?? TLP_COLORS.amber}`}
                      >
                        {selected.tlp.toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Score</span>
                    <p className={`font-bold ${scoreColor(selected.composite_score)}`}>{selected.composite_score}%</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Sources</span>
                    <p>{selected.provider_count}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Created</span>
                    <p>{new Date(selected.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Updated</span>
                    <p>{timeAgo(selected.updated_at)} ago</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-[10px]">Tags</span>
                    <button
                      type="button"
                      onClick={() => {
                        const t = prompt('Add tag (comma-separated)', '');
                        if (t)
                          void updateTags(selected.id, [
                            ...selected.tags,
                            ...t
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          ]);
                      }}
                      className="text-brand-600 dark:text-brand-400 text-[10px] hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() =>
                            void updateTags(
                              selected.id,
                              selected.tags.filter((x) => x !== t)
                            )
                          }
                          className="hover:text-rose-500"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {selected.tags.length === 0 && <span className="text-slate-400 text-[10px] italic">No tags</span>}
                  </div>
                </div>

                {selected.verdicts.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-[10px]">Provider Verdicts</span>
                    <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                      {selected.verdicts.slice(0, 20).map((v) => (
                        <div key={v.provider} className="flex items-center gap-2 text-[11px]">
                          {verdictIcon(v.verdict)}
                          <span className="font-semibold">{v.provider}</span>
                          <span className="text-slate-400 text-[10px] capitalize">{v.verdict}</span>
                          <span className={scoreColor(v.score)}>{v.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-[10px]">Notes ({selected.notes.length})</span>
                  </div>
                  <form onSubmit={(e) => void addNote(e)} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add note…"
                      className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="text"
                      value={noteAuthor}
                      onChange={(e) => setNoteAuthor(e.target.value)}
                      placeholder="Author"
                      className="w-20 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-mono focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={!noteText.trim()}
                      className="px-2 py-1.5 bg-brand-600 dark:bg-brand-500 text-white rounded text-[10px] font-mono disabled:opacity-30"
                    >
                      <Plus size={12} />
                    </button>
                  </form>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selected.notes
                      .slice()
                      .reverse()
                      .map((n) => (
                        <div key={n.id} className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 rounded p-2">
                          <FileText size={10} className="text-slate-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px]">{n.text}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              {n.author} · {timeAgo(n.created_at)} ago
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteNote(n.id)}
                            className="p-0.5 text-slate-400 hover:text-rose-500 shrink-0"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    {selected.notes.length === 0 && <span className="text-slate-400 text-[10px] italic">No notes</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
