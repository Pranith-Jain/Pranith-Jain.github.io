import { useCallback, useEffect, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Plus, Calendar } from 'lucide-react';

type PatchSeverity = 'critical' | 'important' | 'moderate' | 'low';
type PatchStatus =
  | 'pending_review'
  | 'scheduled'
  | 'in_progress'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'deferred'
  | 'not_applicable';
type VendorSource =
  'microsoft' | 'oracle' | 'redhat' | 'vmware' | 'cisco' | 'palo_alto' | 'fortinet' | 'linux' | 'apple' | 'other';
type MwStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

interface PatchAdvisory {
  id: string;
  title: string;
  description: string;
  vendor: VendorSource;
  severity: PatchSeverity;
  cvss_score?: number;
  cve_ids: string[];
  affected_products: string[];
  vendor_advisory_url?: string;
  release_date: string;
  status: PatchStatus;
  assigned_to?: string;
  maintenance_window_id?: string;
  notes?: string;
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  status: MwStatus;
  affected_systems: string[];
  approver?: string;
  rollback_plan?: string;
  patch_ids: string[];
  notes?: string;
}

interface PtmStats {
  total_patches: number;
  open_patches: number;
  critical_patches: number;
  patches_by_vendor: Record<string, number>;
  total_windows: number;
  upcoming_windows: number;
}

const SEVERITY_TONES: Record<PatchSeverity, string> = {
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  important: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  moderate: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

export default function PatchTaskMgr(): JSX.Element {
  const [patches, setPatches] = useState<PatchAdvisory[]>([]);
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [stats, setStats] = useState<PtmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'patches' | 'windows'>('patches');
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [patchRes, winRes, statsRes] = await Promise.all([
        fetch('/api/v1/ptm/patches'),
        fetch('/api/v1/ptm/windows'),
        fetch('/api/v1/ptm/stats'),
      ]);
      if (!patchRes.ok || !winRes.ok || !statsRes.ok) throw new Error('Failed to load PTM data');
      setPatches((await patchRes.json()).items ?? []);
      setWindows((await winRes.json()).items ?? []);
      setStats((await statsRes.json()) as PtmStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreatePatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get('title') as string,
      description: (fd.get('description') as string) || '',
      vendor: fd.get('vendor') as VendorSource,
      severity: fd.get('severity') as PatchSeverity,
      cvss_score: parseFloat(fd.get('cvss') as string) || undefined,
      cve_ids: ((fd.get('cve_ids') as string) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      affected_products: ((fd.get('products') as string) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      release_date: new Date().toISOString(),
      status: 'pending_review' as PatchStatus,
    };
    const r = await fetch('/api/v1/ptm/patches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowCreate(false);
      void fetchData();
    }
  };

  const handleCreateWindow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get('title') as string,
      description: (fd.get('description') as string) || '',
      start_time: new Date(fd.get('start_time') as string).toISOString(),
      end_time: new Date(fd.get('end_time') as string).toISOString(),
      status: 'proposed' as MwStatus,
      affected_systems: ((fd.get('systems') as string) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      patch_ids: [],
    };
    const r = await fetch('/api/v1/ptm/windows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowCreate(false);
      void fetchData();
    }
  };

  const handlePatchStatus = async (id: string, status: PatchStatus) => {
    await fetch(`/api/v1/ptm/patches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void fetchData();
  };

  const handleWindowStatus = async (id: string, status: MwStatus) => {
    await fetch(`/api/v1/ptm/windows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void fetchData();
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Patch & Task Manager (PTM)"
      description="Vendor patch advisories, maintenance windows, approval workflows, and deploy tracking."
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {stats && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Patches</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_patches}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Open</div>
            <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              {stats.open_patches}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Critical</div>
            <div className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
              {stats.critical_patches}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Upcoming Windows</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.upcoming_windows}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-0.5">
          <button
            type="button"
            onClick={() => setTab('patches')}
            className={`text-[10px] font-mono px-3 py-1 rounded ${tab === 'patches' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Patches
          </button>
          <button
            type="button"
            onClick={() => setTab('windows')}
            className={`text-[10px] font-mono px-3 py-1 rounded ${tab === 'windows' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Maintenance Windows
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Plus size={11} /> New {tab === 'patches' ? 'Patch' : 'Window'}
        </button>
      </div>

      {tab === 'patches' && (
        <>
          {showCreate && (
            <form
              onSubmit={handleCreatePatch}
              className="mb-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="title"
                  placeholder="Patch title *"
                  required
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
                />
                <select
                  name="vendor"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                >
                  <option value="microsoft">Microsoft</option>
                  <option value="oracle">Oracle</option>
                  <option value="redhat">Red Hat</option>
                  <option value="vmware">VMware</option>
                  <option value="cisco">Cisco</option>
                  <option value="palo_alto">Palo Alto</option>
                  <option value="fortinet">Fortinet</option>
                  <option value="linux">Linux</option>
                  <option value="apple">Apple</option>
                  <option value="other">Other</option>
                </select>
                <select
                  name="severity"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                >
                  <option value="critical">Critical</option>
                  <option value="important">Important</option>
                  <option value="moderate">Moderate</option>
                  <option value="low">Low</option>
                </select>
                <input
                  name="cvss"
                  type="number"
                  step="0.1"
                  placeholder="CVSS"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                />
                <input
                  name="cve_ids"
                  placeholder="CVE IDs (comma-separated)"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
                />
                <input
                  name="products"
                  placeholder="Affected products (comma-separated)"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
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
            {patches.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${SEVERITY_TONES[p.severity]}`}
                      >
                        {p.severity.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {p.vendor}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{p.status.replace(/_/g, ' ')}</span>
                      {p.cvss_score !== undefined && (
                        <span className="text-[10px] font-mono text-slate-500">CVSS {p.cvss_score}</span>
                      )}
                    </div>
                    <div className="font-mono text-xs font-semibold truncate">{p.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>Released {new Date(p.release_date).toLocaleDateString()}</span>
                      {p.cve_ids.length > 0 && <span>{p.cve_ids.join(', ')}</span>}
                      {p.assigned_to && <span>Assigned: {p.assigned_to}</span>}
                    </div>
                  </div>
                  <select
                    value={p.status}
                    onChange={(e) => handlePatchStatus(p.id, e.target.value as PatchStatus)}
                    className="text-[10px] font-mono px-1.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                  >
                    <option value="pending_review">Review</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="deployed">Deployed</option>
                    <option value="failed">Failed</option>
                    <option value="rolled_back">Rolled Back</option>
                    <option value="deferred">Deferred</option>
                    <option value="not_applicable">N/A</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'windows' && (
        <>
          {showCreate && (
            <form
              onSubmit={handleCreateWindow}
              className="mb-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="title"
                  placeholder="Window title *"
                  required
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
                />
                <input
                  name="start_time"
                  type="datetime-local"
                  required
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                />
                <input
                  name="end_time"
                  type="datetime-local"
                  required
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                />
                <input
                  name="systems"
                  placeholder="Affected systems (comma-sep)"
                  className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2"
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
            {windows.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${w.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : w.status === 'in_progress' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : w.status === 'approved' ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300' : w.status === 'proposed' ? 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}
                      >
                        {w.status}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        <Calendar size={10} className="inline mr-1" />
                        {new Date(w.start_time).toLocaleString()} – {new Date(w.end_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-mono text-xs font-semibold truncate">{w.title}</div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>{w.affected_systems.length} systems</span>
                      {w.approver && <span>Approver: {w.approver}</span>}
                      {w.patch_ids.length > 0 && <span>{w.patch_ids.length} patches</span>}
                    </div>
                  </div>
                  <select
                    value={w.status}
                    onChange={(e) => handleWindowStatus(w.id, e.target.value as MwStatus)}
                    className="text-[10px] font-mono px-1.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                  >
                    <option value="proposed">Proposed</option>
                    <option value="approved">Approved</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </DataPageLayout>
  );
}
