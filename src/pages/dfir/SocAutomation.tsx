import { useCallback, useEffect, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Info, Plus, Play, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

type PlaybookTrigger = 'incident_created' | 'incident_updated' | 'alert_created' | 'scheduled' | 'webhook' | 'manual';

interface PlaybookAction {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  next_on_success?: string;
  next_on_failure?: string;
  timeout_seconds: number;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  trigger: PlaybookTrigger;
  trigger_config?: Record<string, unknown>;
  actions: PlaybookAction[];
  enabled: boolean;
  tags: string[];
  run_count: number;
  avg_duration_ms: number;
  last_run_at?: string;
  last_run_status?: string;
}

interface PlaybookRun {
  id: string;
  playbook_id: string;
  playbook_name: string;
  trigger: PlaybookTrigger;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  action_results: Array<{
    action_id: string;
    action_label: string;
    status: string;
    output?: string;
    duration_ms: number;
  }>;
  error?: string;
}

interface SocStats {
  total_playbooks: number;
  enabled_playbooks: number;
  playbooks_by_trigger: Record<string, number>;
  total_runs: number;
  success_rate: number;
  avg_duration_ms: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  incident_created: 'Incident Created',
  incident_updated: 'Incident Updated',
  alert_created: 'Alert Created',
  scheduled: 'Scheduled',
  webhook: 'Webhook',
  manual: 'Manual',
};

export default function SocAutomation(): JSX.Element {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [runs, setRuns] = useState<PlaybookRun[]>([]);
  const [stats, setStats] = useState<SocStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'playbooks' | 'runs'>('playbooks');
  const [expandedPb, setExpandedPb] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pbRes, runsRes, statsRes] = await Promise.all([
        fetch('/api/v1/soc/playbooks'),
        fetch('/api/v1/soc/runs'),
        fetch('/api/v1/soc/stats'),
      ]);
      if (!pbRes.ok || !runsRes.ok || !statsRes.ok) throw new Error('Failed to load SOC data');
      setPlaybooks((await pbRes.json()).items ?? []);
      setRuns((await runsRes.json()).items ?? []);
      setStats((await statsRes.json()) as SocStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || '',
      trigger: fd.get('trigger') as PlaybookTrigger,
      actions: [] as PlaybookAction[],
      enabled: false,
      tags: ((fd.get('tags') as string) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const r = await fetch('/api/v1/soc/playbooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowCreate(false);
      void fetchData();
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/v1/soc/playbooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    void fetchData();
  };

  const handleExecute = async (id: string) => {
    const r = await fetch(`/api/v1/soc/playbooks/${id}/execute`, { method: 'POST' });
    if (r.ok) void fetchData();
  };

  const togglePb = (id: string) => {
    const next = new Set(expandedPb);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedPb(next);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="SOC Automation Engine"
      description="Playbook runner — trigger webhooks, send alerts, update KB, enrich via MCP tools. Automate incident response workflows on demand."
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {stats && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="surface-card p-3">
            <div className="text-micro font-mono text-slate-500">Playbooks</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_playbooks}</div>
          </div>
          <div className="surface-card p-3">
            <div className="text-micro font-mono text-slate-500">Enabled</div>
            <div className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
              {stats.enabled_playbooks}
            </div>
          </div>
          <div className="surface-card p-3">
            <div className="text-micro font-mono text-slate-500">Total Runs</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_runs}</div>
          </div>
          <div className="surface-card p-3">
            <div className="text-micro font-mono text-slate-500">Success Rate</div>
            <div
              className={`text-xl font-bold font-mono mt-1 ${stats.success_rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : stats.success_rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}
            >
              {stats.success_rate}%
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-0.5">
          <button
            type="button"
            onClick={() => setTab('playbooks')}
            className={`text-[10px] font-mono px-3 py-1 rounded ${tab === 'playbooks' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Playbooks
          </button>
          <button
            type="button"
            onClick={() => setTab('runs')}
            className={`text-[10px] font-mono px-3 py-1 rounded ${tab === 'runs' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Run History
          </button>
        </div>
        {tab === 'playbooks' && (
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Plus size={11} /> New Playbook
          </button>
        )}
      </div>

      {tab === 'playbooks' && (
        <>
          {showCreate && (
            <form
              onSubmit={handleCreate}
              className="mb-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="name"
                  placeholder="Playbook name *"
                  required
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
                />
                <select
                  name="trigger"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                >
                  <option value="manual">Manual</option>
                  <option value="incident_created">Incident Created</option>
                  <option value="incident_updated">Incident Updated</option>
                  <option value="alert_created">Alert Created</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="webhook">Webhook</option>
                </select>
                <input
                  name="tags"
                  placeholder="Tags (comma-separated)"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                />
              </div>
              <textarea
                name="description"
                placeholder="Description"
                rows={2}
                className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] w-full"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {playbooks.map((pb) => {
              const isExpanded = expandedPb.has(pb.id);
              return (
                <div key={pb.id} className="surface-card overflow-hidden">
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button type="button" onClick={() => togglePb(pb.id)} className="p-0.5">
                            {isExpanded ? (
                              <ChevronDown size={12} className="text-slate-400" />
                            ) : (
                              <ChevronRight size={12} className="text-slate-400" />
                            )}
                          </button>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${pb.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300'}`}
                          >
                            {pb.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {TRIGGER_LABELS[pb.trigger] ?? pb.trigger}
                          </span>
                          {pb.last_run_status && (
                            <span
                              className={`text-[10px] font-mono ${pb.last_run_status === 'completed' ? 'text-emerald-500' : pb.last_run_status === 'failed' ? 'text-rose-500' : 'text-amber-500'}`}
                            >
                              Last: {pb.last_run_status}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs font-semibold truncate">{pb.name}</div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>{pb.actions.length} actions</span>
                          <span>{pb.run_count} runs</span>
                          <span>{pb.avg_duration_ms}ms avg</span>
                          {pb.last_run_at && <span>Last: {new Date(pb.last_run_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleExecute(pb.id)}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          <Play size={10} /> Run
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(pb.id, !pb.enabled)}
                          className={`text-[10px] font-mono px-2 py-1 rounded border ${pb.enabled ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}
                        >
                          {pb.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3 space-y-3 bg-slate-50/50 dark:bg-[rgb(var(--surface-100))]/50">
                        <p className="text-[11px] text-slate-500 font-mono">{pb.description}</p>
                        {pb.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {pb.tags.map((t) => (
                              <span
                                key={t}
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1">
                          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            Actions
                          </span>
                          {pb.actions.length === 0 && (
                            <p className="text-[10px] text-slate-400 italic font-mono">
                              No actions yet. Edit the playbook to add steps.
                            </p>
                          )}
                          {pb.actions.map((a, i) => (
                            <div key={a.id} className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                              <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold">
                                {i + 1}
                              </span>
                              <span className="text-brand-600">{a.type}</span>
                              <span>{a.label}</span>
                              <span className="text-slate-400">({a.timeout_seconds}s timeout)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'runs' && (
        <div className="space-y-2">
          {runs.map((r) => (
            <div key={r.id} className="surface-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${r.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : r.status === 'failed' ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' : r.status === 'running' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300'}`}
                    >
                      {r.status}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{r.playbook_name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {TRIGGER_LABELS[r.trigger] ?? r.trigger}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
                    <span>Started {new Date(r.started_at).toLocaleString()}</span>
                    {r.completed_at && <span>Completed {new Date(r.completed_at).toLocaleString()}</span>}
                    {r.duration_ms && <span>{r.duration_ms}ms</span>}
                  </div>
                </div>
              </div>
              {r.action_results.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-[rgb(var(--border-300))] pt-2">
                  {r.action_results.map((ar, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                      {ar.status === 'success' ? (
                        <CheckCircle size={10} className="text-emerald-500" />
                      ) : (
                        <XCircle size={10} className="text-rose-500" />
                      )}
                      <span className="text-slate-500">{ar.action_label}</span>
                      <span className="text-slate-400">({ar.duration_ms}ms)</span>
                    </div>
                  ))}
                </div>
              )}
              {r.error && <p className="text-[10px] font-mono text-rose-500 mt-1">Error: {r.error}</p>}
            </div>
          ))}
          {runs.length === 0 && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <Info size={24} className="mx-auto mb-2 opacity-50" />
              <p className="font-mono text-sm">No runs yet. Execute a playbook to see results.</p>
            </div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}
