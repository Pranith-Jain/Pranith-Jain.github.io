import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, RefreshCw, Info, Plus, ChevronDown, ChevronRight } from 'lucide-react';

interface GrcFramework {
  id: string;
  name: string;
  version: string;
  category: string;
  control_count: number;
  evidence_count: number;
  compliance_pct: number;
  description: string;
}

interface GrcControl {
  id: string;
  framework_id: string;
  control_id: string;
  title: string;
  description: string;
  category: string;
  risk_rating: string;
  status: string;
  evidence_count: number;
  owner?: string;
  notes?: string;
}

interface GrcEvidenceItem {
  id: string;
  control_id: string;
  title: string;
  description: string;
  status: string;
  collected_by?: string;
  collected_at?: string;
  source_type: string;
  source_ref?: string;
  notes?: string;
}

interface GrcStats {
  total_frameworks: number;
  assessed_frameworks: number;
  avg_compliance: number;
  total_controls: number;
  total_evidence: number;
  controls_by_status: Record<string, number>;
  evidence_by_status: Record<string, number>;
}

const CONTROL_STATUS_TONES: Record<string, string> = {
  pass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  fail: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  not_assessed: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  not_applicable: 'border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-400',
};

const EVIDENCE_STATUS_TONES: Record<string, string> = {
  collected: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600 dark:text-amber-400',
  failed: 'text-rose-600 dark:text-rose-400',
  not_applicable: 'text-slate-400',
};

const FRAMEWORKS_COLORS: Record<string, string> = {
  soc2: 'bg-blue-500',
  iso27001: 'bg-violet-500',
  nist: 'bg-emerald-500',
  pci: 'bg-rose-500',
  hipaa: 'bg-cyan-500',
  custom: 'bg-slate-500',
};

export default function GrcEvidence(): JSX.Element {
  const [frameworks, setFrameworks] = useState<GrcFramework[]>([]);
  const [controls, setControls] = useState<GrcControl[]>([]);
  const [evidence, setEvidence] = useState<GrcEvidenceItem[]>([]);
  const [stats, setStats] = useState<GrcStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFw, setSelectedFw] = useState<string | null>(null);
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fwRes, statsRes] = await Promise.all([fetch('/api/v1/grc/frameworks'), fetch('/api/v1/grc/stats')]);
      if (!fwRes.ok || !statsRes.ok) throw new Error('Failed to load GRC data');
      const fwData = (await fwRes.json()) as GrcFramework[];
      setFrameworks(fwData);
      setStats((await statsRes.json()) as GrcStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchControls = useCallback(async (fwId: string) => {
    try {
      const r = await fetch(`/api/v1/grc/controls?framework_id=${fwId}`);
      if (!r.ok) return;
      setControls((await r.json()) as GrcControl[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (selectedFw) {
      void fetchControls(selectedFw);
    } else {
      setControls([]);
      setEvidence([]);
    }
  }, [selectedFw, fetchControls]);

  const handleSelectFramework = (id: string) => {
    setSelectedFw(id === selectedFw ? null : id);
    setExpandedControls(new Set());
  };

  const toggleControl = (id: string) => {
    const next = new Set(expandedControls);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedControls(next);
  };

  const handleUpdateStatus = async (controlId: string, status: string) => {
    const r = await fetch(`/api/v1/grc/controls/${controlId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const updated = (await r.json()) as GrcControl;
      setControls((prev) => prev.map((c) => (c.id === controlId ? updated : c)));
      void fetchAll();
    }
  };

  const handleAddEvidence = async (controlId: string) => {
    const title = prompt('Evidence title:');
    if (!title) return;
    const desc = prompt('Description:') ?? '';
    const sourceType = prompt('Source type (manual/api/scan/screenshot/document/log/config):') ?? 'manual';
    const r = await fetch('/api/v1/grc/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        control_id: controlId,
        title,
        description: desc,
        status: 'pending',
        source_type: sourceType,
      }),
    });
    if (r.ok) {
      const item = (await r.json()) as GrcEvidenceItem;
      setEvidence((prev) => [...prev, item]);
    }
  };

  const handleFetchEvidence = useCallback(async (controlId: string) => {
    try {
      const r = await fetch(`/api/v1/grc/evidence?control_id=${controlId}`);
      if (r.ok) {
        const data = await r.json();
        setEvidence((prev) => {
          const filtered = prev.filter((e) => e.control_id !== controlId);
          return [...filtered, ...data.items];
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const selectedFramework = frameworks.find((f) => f.id === selectedFw);

  const fwControls = useMemo(() => {
    if (!selectedFw) return [];
    return controls.filter((c) => c.framework_id === selectedFw);
  }, [controls, selectedFw]);

  const passCount = fwControls.filter((c) => c.status === 'pass').length;
  const failCount = fwControls.filter((c) => c.status === 'fail').length;
  const notAssessedCount = fwControls.filter((c) => c.status === 'not_assessed').length;

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="GRC Compliance Evidence"
      description="Track compliance across SOC 2, ISO 27001, NIST CSF, PCI DSS, HIPAA — map controls to evidence, monitor status, and generate audit trails."
      loading={loading}
      error={error}
      onRetry={fetchAll}
      maxWidthClass="max-w-6xl"
    >
      {/* Stats */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="text-micro font-mono text-slate-500">Frameworks</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_frameworks}</div>
          </div>
          <div className="rounded-xl border p-3 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="text-micro font-mono text-slate-500">Controls</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_controls}</div>
          </div>
          <div className="rounded-xl border p-3 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="text-micro font-mono text-slate-500">Evidence</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_evidence}</div>
          </div>
          <div className="rounded-xl border p-3 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="text-micro font-mono text-slate-500">Avg Compliance</div>
            <div
              className={`text-xl font-bold font-mono mt-1 ${stats.avg_compliance >= 70 ? 'text-emerald-600 dark:text-emerald-400' : stats.avg_compliance >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}
            >
              {stats.avg_compliance}%
            </div>
          </div>
          <div className="rounded-xl border p-3 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="text-micro font-mono text-slate-500">Assessed</div>
            <div className="text-xl font-bold font-mono mt-1">
              {stats.assessed_frameworks}/{stats.total_frameworks}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Framework selector */}
        <div className="space-y-2">
          {frameworks.map((fw) => {
            const pct = selectedFw === fw.id ? (passCount / Math.max(fwControls.length, 1)) * 100 : fw.compliance_pct;
            return (
              <button
                key={fw.id}
                type="button"
                onClick={() => handleSelectFramework(fw.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${selectedFw === fw.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20' : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-300'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm font-mono">{fw.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded text-white ${FRAMEWORKS_COLORS[fw.category] ?? 'bg-slate-500'}`}
                  >
                    {fw.version}
                  </span>
                </div>
                <div className="text-micro text-slate-500 mb-2">{fw.description.slice(0, 80)}...</div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.round(pct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-micro font-mono text-slate-500 mt-1">
                  <span>{fw.control_count} controls</span>
                  <span>{Math.round(pct)}%</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Control list */}
        <div className="lg:col-span-2 space-y-3">
          {!selectedFw && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <Info size={24} className="mx-auto mb-2 opacity-50" />
              <p className="font-mono text-sm">Select a framework to view its controls.</p>
            </div>
          )}

          {selectedFramework && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-mono font-semibold text-sm">{selectedFramework.name} Controls</h3>
                  <div className="flex gap-3 text-micro font-mono text-slate-500 mt-1">
                    <span className="text-emerald-600 dark:text-emerald-400">{passCount} pass</span>
                    <span className="text-rose-600 dark:text-rose-400">{failCount} fail</span>
                    <span className="text-slate-400">{notAssessedCount} not assessed</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchAll}
                  disabled={loading}
                  className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-300 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {fwControls.length === 0 && (
                <div className="text-center py-8 text-micro font-mono text-slate-400">
                  No controls found for this framework.
                </div>
              )}

              {fwControls.map((ctrl) => {
                const isExpanded = expandedControls.has(ctrl.id);
                const ctrlEvidence = evidence.filter((e) => e.control_id === ctrl.id);
                return (
                  <div key={ctrl.id} className="surface-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        toggleControl(ctrl.id);
                        if (!isExpanded) void handleFetchEvidence(ctrl.id);
                      }}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} className="shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-slate-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs font-semibold truncate">
                          {ctrl.control_id}: {ctrl.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${CONTROL_STATUS_TONES[ctrl.status] ?? CONTROL_STATUS_TONES.not_assessed}`}
                          >
                            {ctrl.status}
                          </span>
                          <span className="text-[10px] text-slate-400">{ctrl.category}</span>
                          {ctrl.owner && <span className="text-[10px] text-slate-400">Owner: {ctrl.owner}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-400">{ctrl.evidence_count} evidence</span>
                        <select
                          value={ctrl.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleUpdateStatus(ctrl.id, e.target.value)}
                          className="text-[10px] font-mono px-1.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                        >
                          <option value="not_assessed">Not Assessed</option>
                          <option value="pass">Pass</option>
                          <option value="fail">Fail</option>
                          <option value="not_applicable">N/A</option>
                        </select>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-[rgb(var(--surface-100))]/50">
                        <p className="text-[11px] text-slate-500 font-mono">{ctrl.description}</p>
                        {ctrl.notes && (
                          <p className="text-[10px] text-slate-400 font-mono italic">Notes: {ctrl.notes}</p>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            Evidence
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddEvidence(ctrl.id)}
                            className="inline-flex items-center gap-1.5 text-[10px] font-mono text-brand-600 hover:text-brand-700"
                          >
                            <Plus size={10} /> Add Evidence
                          </button>
                        </div>

                        {ctrlEvidence.length === 0 && (
                          <p className="text-[10px] text-slate-400 font-mono italic">No evidence collected yet.</p>
                        )}
                        {ctrlEvidence.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[rgb(var(--border-300))] last:border-0"
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-mono truncate">{ev.title}</div>
                              <div className="flex items-center gap-2 text-[9px] text-slate-400">
                                <span>{ev.source_type}</span>
                                {ev.collected_by && <span>by {ev.collected_by}</span>}
                                {ev.collected_at && <span>{new Date(ev.collected_at).toLocaleDateString()}</span>}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono ${EVIDENCE_STATUS_TONES[ev.status] ?? 'text-slate-400'}`}
                            >
                              {ev.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
