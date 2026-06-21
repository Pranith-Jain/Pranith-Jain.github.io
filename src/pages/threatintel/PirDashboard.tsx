import { useEffect, useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import {
  ArrowLeft,
  Target,
  Shield,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
  Radio,
  CheckCircle,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Filter,
  CheckSquare,
  Circle,
  Clock,
  ListChecks,
} from 'lucide-react';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { adminAuthHeaders } from '../../lib/admin-token';
import { type Severity } from '../../components/severity';
import { SeverityPill } from '../../components/SeverityPill';

/** Normalize a priority/severity string to the canonical Severity union. */
function toSeverity(v: string | undefined | null): Severity {
  const k = (v ?? '').toLowerCase();
  if (k === 'critical' || k === 'high' || k === 'medium' || k === 'info') return k;
  if (k === 'informational') return 'info';
  return 'low'; // low / none / unknown / unrated → neutral
}

interface Pir {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  consumer: string;
  decision: string;
  kiqs: string[];
  relevant_sources: string[];
  coverage_score: number;
  min_source_ratio?: number;
  status?: string;
  collection_cadence_hours?: number;
}
interface PirScore {
  pir_id: string;
  pir_title: string;
  composite_coverage: number;
  freshness_score: number;
  confidence: { score: number };
  sources_contributing_today: number;
  total_relevant_sources: number;
  recent_findings: string[];
}
interface PirResponse {
  pirs: Pir[];
  scores: PirScore[];
  active_count: number;
  fresh_sources: string[];
}

interface PirAlert {
  id: string;
  pir_id: string;
  pir_title: string;
  type: string;
  severity: string;
  message: string;
  metric_before: number;
  metric_after: number;
  threshold: number;
  triggered_at: string;
  acknowledged: boolean;
}
interface AlertResponse {
  total: number;
  results: PirAlert[];
}

interface CollectionRoute {
  source_id: string;
  effective_cadence_hours: number;
  pir_count: number;
  driving_priorities: string[];
  next_collection_at: string;
}
interface RoutingResponse {
  routes: CollectionRoute[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  paused: 'text-amber-600 dark:text-amber-400',
  completed: 'text-blue-600 dark:text-blue-400',
  archived: 'text-slate-400 dark:text-slate-500',
};
const CATEGORIES = [
  'ransomware',
  'apt',
  'phishing',
  'vulnerability',
  'supply_chain',
  'insider',
  'sector',
  'general',
] as const;
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUSES = ['active', 'paused', 'completed', 'archived'] as const;

export default function PirDashboard(): JSX.Element {
  const [data, setData] = useState<PirResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<PirAlert[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [routing, setRouting] = useState<CollectionRoute[] | null>(null);
  const [showRouting, setShowRouting] = useState(false);
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());
  const [ackAllLoading, setAckAllLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── KIQ tracking state ────────────────────────────────────────────────
  // pir_id -> { kiq_index -> { answered, evidence } }
  const [kiqAnswers, setKiqAnswers] = useState<Record<string, Record<number, { answered: boolean; evidence: string }>>>(
    {}
  );

  // Restore from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pir-kiq-answers');
      if (saved) setKiqAnswers(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem('pir-kiq-answers', JSON.stringify(kiqAnswers));
    } catch {
      /* ignore */
    }
  }, [kiqAnswers]);

  // ── Create/Edit form state ────────────────────────────────────────────
  const [formTitle, setFormTitle] = useState('');
  const [formConsumer, setFormConsumer] = useState('');
  const [formDecision, setFormDecision] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formStatus, setFormStatus] = useState('active');
  const [formCategory, setFormCategory] = useState('general');
  const [formKiqs, setFormKiqs] = useState('');
  const [formSources, setFormSources] = useState('');
  const [formThreshold, setFormThreshold] = useState('50');
  const [formCadence, setFormCadence] = useState('4');
  const [saving, setSaving] = useState(false);

  const fetchAll = () => {
    fetch('/api/v1/threat-intel/pirs', { headers: adminAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 401 || r.status === 403
              ? 'This operator dashboard requires an admin token.'
              : `Couldn't load PIRs (HTTP ${r.status}).`
          );
        }
        return r.json() as Promise<PirResponse>;
      })
      // Normalize: a 200 with a partial/empty body (missing pirs/scores/etc.)
      // would otherwise crash the render (data.pirs.filter on undefined).
      .then((d) =>
        setData({
          ...d,
          pirs: d.pirs ?? [],
          scores: d.scores ?? [],
          fresh_sources: d.fresh_sources ?? [],
          active_count: d.active_count ?? 0,
        })
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    fetch('/api/v1/threat-intel/pirs/alerts?include_acknowledged=true', { headers: adminAuthHeaders() })
      .then((r) => (r.ok ? (r.json() as Promise<AlertResponse>) : null))
      // `alerts` is consumed unguarded in render (alerts.filter) — never set it
      // to undefined from an error body, or the page crashes.
      .then((r) => setAlerts(r?.results ?? []))
      .catch((e) => {
        setError((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
      });
    fetch('/api/v1/threat-intel/pirs/routing', { headers: adminAuthHeaders() })
      .then((r) => (r.ok ? (r.json() as Promise<RoutingResponse>) : null))
      .then((r) => setRouting(r?.routes ?? []))
      .catch((e) => {
        setError((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
      });
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // ── Filtered PIRs ─────────────────────────────────────────────────────
  const filteredPirs = useMemo(() => {
    if (!data) return [];
    return data.pirs.filter((pir) => {
      if (filterPriority !== 'all' && pir.priority !== filterPriority) return false;
      if (filterStatus !== 'all' && (pir.status ?? 'active') !== filterStatus) return false;
      if (filterCategory !== 'all' && pir.category !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = [pir.title, pir.description, pir.consumer, pir.decision, ...pir.kiqs, ...pir.relevant_sources]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterPriority, filterStatus, filterCategory, searchQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/v1/threat-intel/pirs/${editingId}` : '/api/v1/threat-intel/pirs';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          consumer: formConsumer,
          decision: formDecision,
          description: formDesc,
          priority: formPriority,
          status: formStatus,
          category: formCategory,
          kiqs: formKiqs
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          relevant_sources: formSources
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          min_source_ratio: parseInt(formThreshold, 10) || undefined,
          collection_cadence_hours: parseInt(formCadence, 10) || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed to ${isEdit ? 'update' : 'create'} PIR`);
      resetForm();
      const updated = await fetch('/api/v1/threat-intel/pirs', { headers: adminAuthHeaders() }).then(
        (r) => r.json() as Promise<PirResponse>
      );
      // Normalize like fetchAll() — a partial 200 body here would otherwise
      // white-screen the page (data.pirs.filter on undefined) right after a save.
      setData({
        ...updated,
        pirs: updated.pirs ?? [],
        scores: updated.scores ?? [],
        fresh_sources: updated.fresh_sources ?? [],
        active_count: updated.active_count ?? 0,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this PIR?')) return;
    try {
      const res = await fetch(`/api/v1/threat-intel/pirs/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleAcknowledge(alertId: string) {
    setAcknowledging((prev) => new Set(prev).add(alertId));
    try {
      await fetch(`/api/v1/threat-intel/pirs/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
        headers: adminAuthHeaders(),
      });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
    } catch {
      /* non-fatal */
    } finally {
      setAcknowledging((prev) => {
        const n = new Set(prev);
        n.delete(alertId);
        return n;
      });
    }
  }

  async function handleAcknowledgeAll() {
    setAckAllLoading(true);
    try {
      await fetch('/api/v1/threat-intel/pirs/alerts/acknowledge-all', {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    } catch {
      /* non-fatal */
    } finally {
      setAckAllLoading(false);
    }
  }

  function startEdit(pir: Pir) {
    setEditingId(pir.id);
    setFormTitle(pir.title);
    setFormConsumer(pir.consumer);
    setFormDecision(pir.decision);
    setFormDesc(pir.description);
    setFormPriority(pir.priority);
    setFormStatus(pir.status ?? 'active');
    setFormCategory(pir.category);
    setFormKiqs(pir.kiqs.join('\n'));
    setFormSources(pir.relevant_sources.join(', '));
    setFormThreshold(String(pir.min_source_ratio ?? 50));
    setFormCadence(String(pir.collection_cadence_hours ?? 4));
    setShowCreateForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setShowCreateForm(false);
    setFormTitle('');
    setFormConsumer('');
    setFormDecision('');
    setFormDesc('');
    setFormPriority('medium');
    setFormStatus('active');
    setFormCategory('general');
    setFormKiqs('');
    setFormSources('');
    setFormThreshold('50');
    setFormCadence('4');
  }

  function toggleKiq(pirId: string, kiqIdx: number) {
    setKiqAnswers((prev) => {
      const p = { ...(prev[pirId] ?? {}) };
      const current = p[kiqIdx] ?? { answered: false, evidence: '' };
      p[kiqIdx] = { answered: !current.answered, evidence: current.evidence };
      return { ...prev, [pirId]: p };
    });
  }

  function setKiqEvidence(pirId: string, kiqIdx: number, evidence: string) {
    setKiqAnswers((prev) => {
      const p = { ...(prev[pirId] ?? {}) };
      const current = p[kiqIdx] ?? { answered: false, evidence: '' };
      p[kiqIdx] = { ...current, evidence };
      return { ...prev, [pirId]: p };
    });
  }

  const unacknowledged = alerts.filter((a) => !a.acknowledged);

  // ── Collection Gantt ──────────────────────────────────────────────────
  const ganttRows = useMemo(() => {
    if (!routing || routing.length === 0) return [];
    const maxCadence = Math.max(...routing.map((r) => r.effective_cadence_hours), 24);
    const hours = Math.min(maxCadence, 48);
    return routing
      .sort((a, b) => a.effective_cadence_hours - b.effective_cadence_hours)
      .map((r) => {
        const widthPct = (24 / r.effective_cadence_hours) * (24 / hours) * 100;
        return { ...r, widthPct: Math.min(widthPct, 100) };
      });
  }, [routing]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <Target size={28} className="text-brand-600 dark:text-brand-400" /> Intelligence Requirements (PIRs)
          </h1>
          <p className="text-muted mt-2 max-w-3xl">
            Priority Intelligence Requirements define what decisions we're informing and who the consumer is. Each PIR
            is scored against current collection state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowCreateForm(!showCreateForm);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 transition-colors shrink-0"
        >
          {showCreateForm ? <X size={14} /> : <Plus size={14} />}
          {showCreateForm ? 'Cancel' : 'New PIR'}
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 p-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 space-y-3"
        >
          {editingId && <p className="text-mini font-mono text-brand-600">Editing {editingId}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pir-title" className="text-mini font-mono text-slate-500 mb-1 block">
                Title *
              </label>
              <input
                id="pir-title"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="pir-consumer" className="text-mini font-mono text-slate-500 mb-1 block">
                Consumer *
              </label>
              <input
                id="pir-consumer"
                required
                value={formConsumer}
                onChange={(e) => setFormConsumer(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pir-decision" className="text-mini font-mono text-slate-500 mb-1 block">
                Decision *
              </label>
              <input
                id="pir-decision"
                required
                value={formDecision}
                onChange={(e) => setFormDecision(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pir-desc" className="text-mini font-mono text-slate-500 mb-1 block">
                Description
              </label>
              <textarea
                id="pir-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="pir-priority" className="text-mini font-mono text-slate-500 mb-1 block">
                Priority
              </label>
              <select
                id="pir-priority"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pir-status" className="text-mini font-mono text-slate-500 mb-1 block">
                Status
              </label>
              <select
                id="pir-status"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pir-category" className="text-mini font-mono text-slate-500 mb-1 block">
                Category
              </label>
              <select
                id="pir-category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pir-cadence" className="text-mini font-mono text-slate-500 mb-1 block">
                Collection cadence (hours)
              </label>
              <input
                id="pir-cadence"
                type="number"
                min={0.5}
                step={0.5}
                value={formCadence}
                onChange={(e) => setFormCadence(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pir-kiqs" className="text-mini font-mono text-slate-500 mb-1 block">
                KIQ (one per line)
              </label>
              <textarea
                id="pir-kiqs"
                value={formKiqs}
                onChange={(e) => setFormKiqs(e.target.value)}
                rows={3}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="pir-sources" className="text-mini font-mono text-slate-500 mb-1 block">
                Relevant sources (comma-sep)
              </label>
              <input
                id="pir-sources"
                value={formSources}
                onChange={(e) => setFormSources(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="pir-threshold" className="text-mini font-mono text-slate-500 mb-1 block">
                Min source ratio %
              </label>
              <input
                id="pir-threshold"
                type="number"
                min={0}
                max={100}
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-mono px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editingId ? 'Update PIR' : 'Create PIR'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-mono px-4 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-slate-400 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {/* ── Alerts panel ────────────────────────────────────────────────── */}
      {unacknowledged.length > 0 && (
        <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <AlertTriangle size={14} />
              PIR Collection Alerts ({unacknowledged.length} unacknowledged)
            </div>
            <button
              type="button"
              onClick={() => void handleAcknowledgeAll()}
              disabled={ackAllLoading}
              className="inline-flex items-center gap-1 text-micro font-mono px-2 py-1 rounded border border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50"
            >
              {ackAllLoading ? <Loader2 size={10} className="animate-spin" /> : <CheckSquare size={10} />}
              Acknowledge all
            </button>
          </div>
          <div className="space-y-2">
            {unacknowledged.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-mini text-slate-700 dark:text-slate-300">
                <SeverityPill tone={toSeverity(a.severity)} className="shrink-0 px-1">
                  {a.severity}
                </SeverityPill>
                <span className="flex-1">{a.message}</span>
                <span className="text-slate-400 shrink-0">{new Date(a.triggered_at).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => handleAcknowledge(a.id)}
                  disabled={acknowledging.has(a.id)}
                  className="shrink-0 inline-flex items-center gap-1 text-micro font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {acknowledging.has(a.id) ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {unacknowledged.length === 0 && alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs">
          <CheckCircle size={14} />
          All {alerts.length} alerts acknowledged
        </div>
      )}

      {/* ── Collection Routing + Gantt ────────────────────────────────── */}
      {routing && routing.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowRouting(!showRouting)}
            className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 transition-colors"
          >
            <Radio size={12} /> Collection Routing ({routing.length} routes)
            {showRouting ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {showRouting && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 overflow-hidden">
              {/* Gantt chart */}
              {ganttRows.length > 0 && (
                <div className="p-4 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                  <div className="flex items-center gap-2 text-micro font-mono text-slate-500 mb-3">
                    <Clock size={12} /> Collection cadence timeline
                  </div>
                  <div className="space-y-1.5">
                    {ganttRows.slice(0, 15).map((r) => (
                      <div key={r.source_id} className="flex items-center gap-2 text-micro">
                        <span className="w-28 shrink-0 font-mono text-muted truncate">{r.source_id}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded h-3 relative overflow-hidden">
                          <div
                            className={`h-full rounded ${r.effective_cadence_hours <= 1 ? 'bg-rose-400' : r.effective_cadence_hours <= 3 ? 'bg-amber-400' : r.effective_cadence_hours <= 8 ? 'bg-emerald-400' : 'bg-slate-400'}`}
                            style={{ width: `${r.widthPct}%` }}
                          />
                        </div>
                        <span className="w-16 text-right font-mono text-slate-400">{r.effective_cadence_hours}h</span>
                        <span className="w-12 text-right font-mono text-slate-400">{r.pir_count} PIRs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {routing.map((r) => {
                  const c =
                    r.effective_cadence_hours <= 1
                      ? 'Every 1h'
                      : r.effective_cadence_hours <= 3
                        ? 'Every 3h'
                        : r.effective_cadence_hours <= 8
                          ? 'Every 8h'
                          : 'Daily';
                  return (
                    <div key={r.source_id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                      <span className="font-mono text-slate-700 dark:text-slate-300 w-36 shrink-0">{r.source_id}</span>
                      <span
                        className={`font-mono px-1.5 py-0.5 rounded text-micro ${r.effective_cadence_hours <= 1 ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : r.effective_cadence_hours <= 3 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-muted'}`}
                      >
                        {c}
                      </span>
                      <span className="text-slate-500">PIRs: {r.pir_count}</span>
                      <div className="flex gap-1">
                        {r.driving_priorities.map((p) => (
                          <span key={p} className={SeverityPill({ tone: toSeverity(p), className: 'px-1' })}>
                            {p}
                          </span>
                        ))}
                      </div>
                      <span className="text-slate-400 ml-auto">
                        Next: {new Date(r.next_collection_at).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="mb-6 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1">
        <div className="flex items-center gap-2 text-micro font-mono text-slate-500 mb-2">
          <Filter size={12} /> Filters
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PIRs by title, source, KIQ…"
              className="w-full text-mini font-mono px-7 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {(filterPriority !== 'all' || filterStatus !== 'all' || filterCategory !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setFilterPriority('all');
                setFilterStatus('all');
                setFilterCategory('all');
                setSearchQuery('');
              }}
              className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {data && (
          <p className="text-micro font-mono text-slate-400 mt-1.5">
            Showing {filteredPirs.length} of {data.pirs.length} PIRs
          </p>
        )}
      </div>

      <DataState loading={loading} error={error} rows={8}>
        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 mb-1">Active PIRs</p>
                <p className="text-2xl font-bold font-display">{data.active_count}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 mb-1">Fresh Sources</p>
                <p className="text-2xl font-bold font-display text-emerald-500">{data.fresh_sources.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 mb-1">Scores</p>
                <p className="text-2xl font-bold font-display flex items-center gap-2">
                  {data.scores.filter((s) => s.composite_coverage >= 70).length}
                  <Shield size={16} className="text-emerald-500" />
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
                <p className="text-mini font-mono text-slate-500 mb-1">Avg Coverage</p>
                <p className="text-2xl font-bold font-display">
                  {data.scores.length > 0
                    ? Math.round(data.scores.reduce((a, s) => a + s.composite_coverage, 0) / data.scores.length)
                    : 0}
                  %
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {filteredPirs.map((pir) => {
                const score = data.scores.find((s) => s.pir_id === pir.id);
                const isOpen = expanded.has(pir.id);
                const answers = kiqAnswers[pir.id] ?? {};
                const answeredCount = Object.values(answers).filter((a) => a.answered).length;
                return (
                  <div
                    key={pir.id}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const n = new Set(prev);
                          n.has(pir.id) ? n.delete(pir.id) : n.add(pir.id);
                          return n;
                        })
                      }
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                    >
                      <SeverityPill tone={toSeverity(pir.priority)}>{pir.priority}</SeverityPill>
                      <span className={`text-micro font-mono ${STATUS_COLORS[pir.status ?? 'active']}`}>
                        {pir.status ?? 'active'}
                      </span>
                      {answeredCount > 0 && (
                        <span className="text-micro font-mono text-emerald-500 shrink-0">
                          {answeredCount}/{pir.kiqs.length} KIQ
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{pir.title}</div>
                        <div className="text-mini text-slate-500 mt-0.5">{pir.consumer}</div>
                      </div>
                      {score && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16 bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full"
                              style={{ width: `${score.composite_coverage}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-slate-500 w-8 text-right">
                            {score.composite_coverage}%
                          </span>
                        </div>
                      )}
                      {isOpen ? (
                        <ChevronDown size={14} className="text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
                        <div className="flex justify-end gap-1 mt-3">
                          <button
                            type="button"
                            onClick={() => startEdit(pir)}
                            className="inline-flex items-center gap-1 text-micro font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Pencil size={10} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(pir.id)}
                            className="inline-flex items-center gap-1 text-micro font-mono px-2 py-1 rounded border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                          >
                            <Trash2 size={10} /> Delete
                          </button>
                        </div>
                        <p className="text-xs text-muted mt-2 leading-relaxed">{pir.description}</p>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">
                              Decision
                            </p>
                            <p className="text-xs text-muted">{pir.decision}</p>
                          </div>
                          <div>
                            <p className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                              <ListChecks size={10} /> KIQ ({answeredCount}/{pir.kiqs.length} answered)
                            </p>
                            <ul className="space-y-2">
                              {pir.kiqs.map((k, j) => {
                                const ans = answers[j];
                                const answered = ans?.answered ?? false;
                                const evidence = ans?.evidence ?? '';
                                return (
                                  <li key={j} className="text-xs">
                                    <div className="flex items-start gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleKiq(pir.id, j)}
                                        className={`mt-0.5 shrink-0 ${answered ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
                                        title={answered ? 'Mark unanswered' : 'Mark answered'}
                                      >
                                        {answered ? <CheckCircle size={12} /> : <Circle size={12} />}
                                      </button>
                                      <span
                                        className={`${answered ? 'text-emerald-600 dark:text-emerald-400 line-through decoration-emerald-400/30' : 'text-muted'}`}
                                      >
                                        {k}
                                      </span>
                                    </div>
                                    {answered && (
                                      <div className="ml-6 mt-1">
                                        <input
                                          type="text"
                                          value={evidence}
                                          onChange={(e) => setKiqEvidence(pir.id, j, e.target.value)}
                                          placeholder="Add evidence / source reference…"
                                          className="w-full text-micro font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 placeholder:text-slate-400"
                                        />
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                        {score && (
                          <div className="mt-3">
                            <div className="flex gap-4 mb-2">
                              <div>
                                <p className="text-micro font-mono text-slate-400 mb-0.5">Freshness</p>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
                                    <div
                                      className="bg-cyan-500 h-1.5 rounded-full"
                                      style={{ width: `${score.freshness_score}%` }}
                                    />
                                  </div>
                                  <span className="text-micro font-mono text-slate-500">{score.freshness_score}%</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-micro font-mono text-slate-400 mb-0.5">Confidence</p>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
                                    <div
                                      className="bg-violet-500 h-1.5 rounded-full"
                                      style={{ width: `${score.confidence?.score ?? 0}%` }}
                                    />
                                  </div>
                                  <span className="text-micro font-mono text-slate-500">
                                    {score.confidence?.score ?? 0}%
                                  </span>
                                </div>
                              </div>
                              <div>
                                <p className="text-micro font-mono text-slate-400 mb-0.5">Composite</p>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
                                    <div
                                      className="bg-brand-500 h-1.5 rounded-full"
                                      style={{ width: `${score.composite_coverage}%` }}
                                    />
                                  </div>
                                  <span className="text-micro font-mono text-slate-500">
                                    {score.composite_coverage}%
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-micro font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-muted">
                                Sources: {score.sources_contributing_today}/{score.total_relevant_sources}
                              </span>
                              {pir.min_source_ratio && (
                                <span className="text-micro font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-muted">
                                  Alert threshold: {pir.min_source_ratio}%
                                </span>
                              )}
                              {pir.collection_cadence_hours && (
                                <span className="text-micro font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-muted">
                                  Cadence: every {pir.collection_cadence_hours}h
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {score && routing && (
                          <div className="mt-2">
                            <div className="flex flex-wrap gap-2">
                              {routing
                                .filter((r) => pir.relevant_sources.includes(r.source_id))
                                .slice(0, 4)
                                .map((r) => (
                                  <span
                                    key={r.source_id}
                                    className="text-micro font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-muted"
                                  >
                                    {r.source_id}: {r.effective_cadence_hours}h cadence
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
                          <FeedbackWidget targetType="pir" targetId={pir.id} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredPirs.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-tool text-slate-500 font-mono">
                  No PIRs match the current filters. Try adjusting your search or filter criteria.
                </div>
              )}
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}
