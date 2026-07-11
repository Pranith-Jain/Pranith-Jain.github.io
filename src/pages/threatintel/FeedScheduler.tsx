import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { adminAuthHeaders } from '../../lib/admin-token';
import { Plus, Trash2, Play, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Search, Pencil, X } from 'lucide-react';

interface FeedJob {
  id: string;
  name: string;
  source_url: string;
  interval_minutes: number;
  parser: string;
  enabled: boolean;
  created_at: string;
  last_run_at: string | null;
  last_status: 'pending' | 'running' | 'ok' | 'error' | null;
  last_item_count: number;
  last_error: string | null;
  tags: string[];
}

interface FeedPreset {
  id: string;
  name: string;
  source_url: string;
  parser: string;
  tags: string[];
}

interface FeedRunHistory {
  job_id: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'error';
  item_count: number;
  error: string | null;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedScheduler(): JSX.Element {
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [presets, setPresets] = useState<FeedPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [history, setHistory] = useState<Record<string, FeedRunHistory[]>>({});
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    source_url: '',
    parser: 'plaintext-ips',
    interval_minutes: 60,
    tags: '',
  });
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    source_url: string;
    parser: string;
    interval_minutes: number;
    tags: string;
  }>({ name: '', source_url: '', parser: 'plaintext-ips', interval_minutes: 60, tags: '' });

  const fetchRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    fetchRef.current?.abort();
    const ctrl = new AbortController();
    fetchRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]);
      const [jRes, hRes] = await Promise.all([
        fetch('/api/v1/feed-scheduler', { headers: adminAuthHeaders(), signal }),
        fetch('/api/v1/feed-scheduler-history', { headers: adminAuthHeaders(), signal }),
      ]);
      if (ctrl.signal.aborted) return;
      if (!jRes.ok) throw new Error('Failed to load');
      const jData = (await jRes.json()) as { jobs: FeedJob[]; presets: FeedPreset[] };
      setJobs(jData.jobs);
      setPresets(jData.presets);
      if (hRes.ok) {
        const hData = (await hRes.json()) as { history: Record<string, FeedRunHistory[]> };
        setHistory(hData.history);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    return () => {
      fetchRef.current?.abort();
    };
  }, [fetchData]);

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setForm({
      name: preset.name,
      source_url: preset.source_url,
      parser: preset.parser,
      interval_minutes: 60,
      tags: preset.tags.join(', '),
    });
    setSelectedPreset(presetId);
  };

  const flash = (kind: 'ok' | 'error', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const createRef = useRef<AbortController | null>(null);

  const createJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.source_url.trim()) return;
    createRef.current?.abort();
    const ctrl = new AbortController();
    createRef.current = ctrl;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/feed-scheduler', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          source_url: form.source_url.trim(),
          parser: form.parser,
          interval_minutes: form.interval_minutes,
          tags: form.tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        flash('error', errData.error ?? 'Failed to create feed');
        return;
      }
      const data = (await res.json()) as { job: FeedJob };
      setJobs((prev) => [...prev, data.job]);
      setShowForm(false);
      setForm({ name: '', source_url: '', parser: 'plaintext-ips', interval_minutes: 60, tags: '' });
      setSelectedPreset('');
      flash('ok', `Feed "${data.job.name}" created`);
    } catch {
      if (ctrl.signal.aborted) return;
      flash('error', 'Network error creating feed');
    } finally {
      if (!ctrl.signal.aborted) setCreating(false);
    }
  };

  const deleteJob = async (id: string, name: string) => {
    if (!window.confirm(`Delete feed "${name}"? This cannot be undone.`)) return;
    const ctrl = new AbortController();
    try {
      const res = await fetch(`/api/v1/feed-scheduler/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        flash('error', 'Failed to delete feed');
        return;
      }
      setJobs((prev) => prev.filter((j) => j.id !== id));
      flash('ok', `Feed "${name}" deleted`);
    } catch {
      if (ctrl.signal.aborted) return;
      flash('error', 'Network error deleting feed');
    }
  };

  const toggleJob = async (id: string, enabled: boolean) => {
    const ctrl = new AbortController();
    try {
      const res = await fetch(`/api/v1/feed-scheduler/${id}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        flash('error', 'Failed to toggle feed');
        return;
      }
      const data = (await res.json()) as { job: FeedJob };
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
    } catch {
      if (ctrl.signal.aborted) return;
      flash('error', 'Network error toggling feed');
    }
  };

  const updateJob = async (
    id: string,
    updates: Partial<Pick<FeedJob, 'name' | 'source_url' | 'parser' | 'interval_minutes' | 'tags'>>
  ) => {
    const ctrl = new AbortController();
    try {
      const res = await fetch(`/api/v1/feed-scheduler/${id}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(updates),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        flash('error', errData.error ?? 'Failed to update feed');
        return;
      }
      const data = (await res.json()) as { job: FeedJob };
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
      flash('ok', `Feed "${data.job.name}" updated`);
    } catch {
      if (ctrl.signal.aborted) return;
      flash('error', 'Network error updating feed');
    }
  };

  const runJob = async (id: string) => {
    if (runningJobs.has(id)) return;
    setRunningJobs((prev) => new Set(prev).add(id));
    const ctrl = new AbortController();
    try {
      const res = await fetch(`/api/v1/feed-scheduler/${id}/run`, {
        method: 'POST',
        headers: adminAuthHeaders(),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        flash('error', 'Failed to trigger feed run');
        return;
      }
      const data = (await res.json()) as { job: FeedJob; run: FeedRunHistory };
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
      if (data.run) {
        setHistory((prev) => ({ ...prev, [id]: [data.run, ...(prev[id] ?? [])] }));
      }
    } catch {
      if (ctrl.signal.aborted) return;
      flash('error', 'Network error running feed');
    } finally {
      setRunningJobs((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const filtered = jobs.filter((j) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.name.toLowerCase().includes(q) ||
      j.source_url.toLowerCase().includes(q) ||
      j.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<RefreshCw size={28} />}
      title="Feed Scheduler"
      maxWidthClass="max-w-6xl"
      description={
        <span className="font-mono text-sm">
          Automated threat feed collection — configure external sources, set intervals, and manually trigger fetches.
          Inspired by INTELMQ and Yeti.
        </span>
      }
      headerExtra={
        <div className="space-y-6">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-xl hover:bg-brand-700 dark:hover:bg-brand-400"
            >
              <Plus size={14} /> Add Feed
            </button>
          </div>
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search feeds…"
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => void fetchData()}
    >
      {showForm && (
        <form
          onSubmit={(e) => void createJob(e)}
          className="mb-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
        >
          <h2 className="font-display font-semibold text-sm mb-3">Add Feed Source</h2>

          <div className="mb-3">
            <label htmlFor="preset-select" className="text-mini font-mono text-slate-500 block mb-1">
              Quick-add from preset:
            </label>
            <select
              id="preset-select"
              value={selectedPreset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-700 dark:text-slate-300"
            >
              <option value="">— Select a preset —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Feed name"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-tool focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <select
                value={form.parser}
                onChange={(e) => setForm((p) => ({ ...p, parser: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-700 dark:text-slate-300"
              >
                <option value="plaintext-ips">IP list (one per line)</option>
                <option value="plaintext-domains">Domain list (one per line)</option>
                <option value="plaintext-urls">URL list (one per line)</option>
                <option value="plaintext-hashes">Hash list (one per line)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <input
                type="text"
                value={form.source_url}
                onChange={(e) => setForm((p) => ({ ...p, source_url: e.target.value }))}
                placeholder="Source URL"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <input
                type="number"
                value={form.interval_minutes}
                onChange={(e) => setForm((p) => ({ ...p, interval_minutes: Number(e.target.value) }))}
                placeholder="Interval (minutes)"
                min={5}
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="Tags (comma separated)"
                className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !form.name.trim() || !form.source_url.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono text-meta font-semibold rounded disabled:opacity-30"
            >
              {creating && <Loader2 size={12} className="animate-spin" />}Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setSelectedPreset('');
              }}
              className="px-4 py-2 border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 font-mono text-meta rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-6 rounded-xl border px-4 py-3 text-tool font-mono ${
            toast.kind === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-12 text-center">
          <RefreshCw size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-mono text-slate-500">{search ? 'No matching feeds' : 'No feed jobs configured'}</p>
          <p className="text-xs font-mono text-slate-400 mt-1">
            {search
              ? 'Try a different search'
              : 'Add a feed source to start collecting threat intelligence automatically'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((job) => {
          const jobHistory = history[job.id] ?? [];
          const isRunning = runningJobs.has(job.id) || job.last_status === 'running';
          const isDue =
            job.last_run_at && Date.now() - new Date(job.last_run_at).getTime() > job.interval_minutes * 60000;
          const isEditing = editingId === job.id;
          return (
            <div
              key={job.id}
              className={`rounded-xl border bg-white dark:bg-[rgb(var(--surface-200))] p-4 transition-colors ${
                job.enabled
                  ? 'border-slate-200 dark:border-[rgb(var(--border-400))]'
                  : 'border-slate-200/50 dark:border-[rgb(var(--border-400))]/50 opacity-60'
              }`}
            >
              {isEditing ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-semibold text-sm">Edit Feed</h3>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Feed name"
                      className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
                    />
                    <select
                      value={editForm.parser}
                      onChange={(e) => setEditForm((p) => ({ ...p, parser: e.target.value }))}
                      className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta text-slate-700 dark:text-slate-300"
                    >
                      <option value="plaintext-ips">IP list</option>
                      <option value="plaintext-domains">Domain list</option>
                      <option value="plaintext-urls">URL list</option>
                      <option value="plaintext-hashes">Hash list</option>
                    </select>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={editForm.source_url}
                        onChange={(e) => setEditForm((p) => ({ ...p, source_url: e.target.value }))}
                        placeholder="Source URL"
                        className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <input
                      type="number"
                      value={editForm.interval_minutes}
                      onChange={(e) => setEditForm((p) => ({ ...p, interval_minutes: Number(e.target.value) }))}
                      placeholder="Interval (minutes)"
                      min={5}
                      className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="text"
                      value={editForm.tags}
                      onChange={(e) => setEditForm((p) => ({ ...p, tags: e.target.value }))}
                      placeholder="Tags (comma separated)"
                      className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-meta focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        void updateJob(job.id, {
                          name: editForm.name.trim(),
                          source_url: editForm.source_url.trim(),
                          parser: editForm.parser,
                          interval_minutes: editForm.interval_minutes,
                          tags: editForm.tags
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      disabled={!editForm.name.trim() || !editForm.source_url.trim()}
                      className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono text-meta font-semibold rounded disabled:opacity-30"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 font-mono text-meta rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {job.name}
                        </h3>
                        {job.last_status === 'ok' && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                        {job.last_status === 'error' && <XCircle size={12} className="text-rose-500 shrink-0" />}
                        {isRunning && <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />}
                        {job.last_status === null && <Clock size={12} className="text-slate-400 shrink-0" />}
                      </div>
                      <p className="text-mini font-mono text-slate-500 mt-0.5 truncate max-w-xl">{job.source_url}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-micro font-mono text-slate-400">
                        <span className="capitalize">{job.parser.replace(/-/g, ' ')}</span>
                        <span>Every {job.interval_minutes}m</span>
                        {job.last_run_at && <span>Last: {relativeTime(job.last_run_at)}</span>}
                        {job.last_status === 'ok' && <span>{job.last_item_count.toLocaleString()} items</span>}
                        {isDue && job.enabled && <span className="text-amber-500">Due</span>}
                        {job.tags.map((t) => (
                          <span key={t} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))]">
                            {t}
                          </span>
                        ))}
                      </div>
                      {job.last_error && (
                        <p className="text-micro font-mono text-rose-500 mt-1 truncate">{job.last_error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void runJob(job.id)}
                        disabled={isRunning}
                        className="p-1.5 rounded text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-30"
                        title="Run now"
                      >
                        <Play size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(job.id);
                          setEditForm({
                            name: job.name,
                            source_url: job.source_url,
                            parser: job.parser,
                            interval_minutes: job.interval_minutes,
                            tags: job.tags.join(', '),
                          });
                        }}
                        disabled={isRunning}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleJob(job.id, !job.enabled)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                        title={job.enabled ? 'Disable' : 'Enable'}
                      >
                        <CheckCircle2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteJob(job.id, job.name)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {jobHistory.length > 0 && (
                    <details className="mt-3 pt-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
                      <summary className="text-micro font-mono text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none">
                        Run history ({jobHistory.length})
                      </summary>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {jobHistory.slice(0, 10).map((h, i) => (
                          <div
                            key={`${h.started_at}-${i}`}
                            className="flex items-center gap-2 text-micro font-mono text-slate-500"
                          >
                            {h.status === 'ok' ? (
                              <CheckCircle2 size={10} className="text-emerald-500" />
                            ) : (
                              <XCircle size={10} className="text-rose-500" />
                            )}
                            <span>{new Date(h.started_at).toLocaleString()}</span>
                            <span className="text-slate-400">—</span>
                            <span>{h.item_count.toLocaleString()} items</span>
                            {h.error && <span className="text-rose-500 truncate max-w-[200px]">{h.error}</span>}
                            <span className="text-slate-400">
                              (
                              {Math.round(
                                (new Date(h.finished_at).getTime() - new Date(h.started_at).getTime()) / 1000
                              )}
                              s)
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
