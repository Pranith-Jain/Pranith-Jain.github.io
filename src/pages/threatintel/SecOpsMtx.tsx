import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import {
  Shield,
  Clock,
  TrendingUp,
  Activity,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Settings,
  Calendar,
  BarChart3,
  FileText,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
  Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface MtxMetrics {
  mttd: number | null;
  mtta: number | null;
  mttr: number | null;
  totalCases: number;
  openCases: number;
  closedCases: number;
  truePositives: number;
  falsePositives: number;
}

interface MtxCase {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in-review' | 'closed';
  createdAt: string;
  closedAt: string | null;
  mttd: number | null;
  mtta: number | null;
  mttr: number | null;
  ruleName: string;
  alertCount: number;
  assignees: string[];
  verdict: 'tp' | 'fp' | null;
}

interface MtxTenant {
  id: string | number;
  name: string;
  guid: string;
  region: string;
  gcp_project_id: string;
  gcpProjectId?: string;
  base_url?: string;
}

interface MtxConfig {
  enabled: boolean;
  tenants: MtxTenant[];
  hasCredentials: boolean;
  lastRun: string | null;
}

interface Exclusion {
  id: number;
  keyword: string;
  note: string | null;
  created_at: string;
}

// ─── Duration Formatting ──────────────────────────────────────────────────

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function getDurationColor(minutes: number | null, thresholds = { good: 60, warn: 360 }): string {
  if (minutes === null || minutes === undefined) return 'text-slate-500 dark:text-slate-400';
  if (minutes <= thresholds.good) return 'text-emerald-600 dark:text-emerald-400';
  if (minutes <= thresholds.warn) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

// ─── Metric Card ──────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card padding="md" className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color}`} />
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-lg bg-${color.replace('bg-', '')}/10`}>
          <Icon size={20} className={`text-${color.replace('bg-', '')}`} />
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{value}</div>
          {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[severity] || colors.low}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'in-review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.open}`}
    >
      {status}
    </span>
  );
}

// ─── Benchmark Bar ────────────────────────────────────────────────────────

function BenchmarkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────

function SettingsPanel({ config, onRefresh }: { config: MtxConfig | null; onRefresh: () => void }) {
  const { toast } = useToast();
  const [saText, setSaText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tenants, setTenants] = useState<MtxTenant[]>(config?.tenants ?? []);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [newTenant, setNewTenant] = useState({ name: '', guid: '', region: 'us', gcp_project_id: '', base_url: '' });
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [newExclKeyword, setNewExclKeyword] = useState('');
  const [newExclNote, setNewExclNote] = useState('');
  const [testingTenant, setTestingTenant] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTenants(config?.tenants ?? []);
  }, [config?.tenants]);

  // Load exclusions
  useEffect(() => {
    fetch('/api/v1/secops-mtx/exclusions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.exclusions) setExclusions(d.exclusions);
      })
      .catch(() => {});
  }, []);

  // Upload SA
  const handleSaUpload = useCallback(async () => {
    if (!saText.trim()) return;
    setUploading(true);
    try {
      // Try to parse as JSON
      let saJson = saText.trim();
      if (saJson.startsWith('data:')) {
        // Extract from data URI
        saJson = saJson.split(',')[1] ?? '';
      }
      // Validate it's valid JSON
      JSON.parse(saJson);

      const res = await fetch('/api/v1/secops-mtx/sa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAccountJson: saJson }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Service account uploaded: ${data.clientEmail}`, 'success');
        setSaText('');
        onRefresh();
      } else {
        toast(data.error || 'Upload failed', 'error');
      }
    } catch {
      toast('Invalid JSON — paste the raw service account key file', 'error');
    } finally {
      setUploading(false);
    }
  }, [saText, toast, onRefresh]);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSaText(String(reader.result));
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // Add tenant
  const handleAddTenant = useCallback(async () => {
    if (!newTenant.name || !newTenant.guid || !newTenant.gcp_project_id) {
      toast('Name, GUID, and GCP Project ID are required', 'error');
      return;
    }
    try {
      const res = await fetch('/api/v1/secops-mtx/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenant),
      });
      if (res.ok) {
        toast('Tenant added', 'success');
        setShowAddTenant(false);
        setNewTenant({ name: '', guid: '', region: 'us', gcp_project_id: '', base_url: '' });
        onRefresh();
      } else {
        const data = await res.json();
        toast(data.error || 'Failed to add tenant', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
  }, [newTenant, toast, onRefresh]);

  // Delete tenant
  const handleDeleteTenant = useCallback(
    async (id: string | number) => {
      if (!confirm('Delete this tenant?')) return;
      try {
        await fetch(`/api/v1/secops-mtx/tenants/${id}`, { method: 'DELETE' });
        toast('Tenant deleted', 'success');
        onRefresh();
      } catch {
        toast('Failed to delete tenant', 'error');
      }
    },
    [toast, onRefresh]
  );

  // Test connection
  const handleTestConnection = useCallback(
    async (id: string | number) => {
      setTestingTenant(String(id));
      try {
        const res = await fetch(`/api/v1/secops-mtx/tenants/${id}/test`, { method: 'POST' });
        const data = await res.json();
        toast(data.message, data.status === 'success' ? 'success' : 'error');
      } catch {
        toast('Connection test failed', 'error');
      } finally {
        setTestingTenant(null);
      }
    },
    [toast]
  );

  // Add exclusion
  const handleAddExclusion = useCallback(async () => {
    if (!newExclKeyword.trim()) return;
    try {
      await fetch('/api/v1/secops-mtx/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newExclKeyword.trim(), note: newExclNote.trim() || undefined }),
      });
      setNewExclKeyword('');
      setNewExclNote('');
      // Reload exclusions
      const res = await fetch('/api/v1/secops-mtx/exclusions');
      const d = await res.json();
      setExclusions(d.exclusions ?? []);
      toast('Exclusion added', 'success');
    } catch {
      toast('Failed to add exclusion', 'error');
    }
  }, [newExclKeyword, newExclNote, toast]);

  // Delete exclusion
  const handleDeleteExclusion = useCallback(
    async (id: number) => {
      try {
        await fetch(`/api/v1/secops-mtx/exclusions/${id}`, { method: 'DELETE' });
        setExclusions((prev) => prev.filter((e) => e.id !== id));
        toast('Exclusion removed', 'success');
      } catch {
        toast('Failed to remove exclusion', 'error');
      }
    },
    [toast]
  );

  return (
    <div className="space-y-6">
      {/* Service Account */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={18} className="text-brand-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Google Service Account
          </h3>
          {config?.hasCredentials && (
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Configured
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Upload a Google Cloud service account JSON key with Chronicle API and SOAR Admin permissions.
        </p>
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} icon={<Upload size={14} />}>
              Upload JSON file
            </Button>
          </div>
          <textarea
            value={saText}
            onChange={(e) => setSaText(e.target.value)}
            placeholder="Or paste the service account JSON here..."
            rows={6}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white placeholder-slate-400"
          />
          <Button
            variant="primary-brand"
            size="sm"
            onClick={handleSaUpload}
            loading={uploading}
            disabled={!saText.trim()}
            icon={<Upload size={14} />}
          >
            Save Service Account
          </Button>
        </div>
        <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex gap-2 text-xs text-blue-700 dark:text-blue-300">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-1">Required permissions:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Chronicle API (read-only access to cases, alerts, UDM search)</li>
                <li>SOAR Admin (for case history, playbook data)</li>
              </ul>
              <p className="mt-1">The key is stored encrypted in D1 and never exposed to the client.</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Tenants */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chronicle Tenants
            </h3>
          </div>
          <Button variant="primary-brand" size="sm" onClick={() => setShowAddTenant(true)} icon={<Plus size={14} />}>
            Add Tenant
          </Button>
        </div>

        {tenants.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No tenants configured. Add one to start analyzing MTTX metrics.
          </p>
        ) : (
          <div className="space-y-2">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300))] border border-slate-200 dark:border-[rgb(var(--border-400))]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 dark:text-white truncate">{t.name}</div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {t.guid} · {t.region} · {t.gcp_project_id}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTestConnection(t.id)}
                  loading={testingTenant === String(t.id)}
                >
                  Test
                </Button>
                <button
                  onClick={() => handleDeleteTenant(t.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Tenant Form */}
        {showAddTenant && (
          <div className="mt-4 p-4 rounded-lg border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">New Tenant</h4>
              <button onClick={() => setShowAddTenant(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={newTenant.name}
                onChange={(e) => setNewTenant((p) => ({ ...p, name: e.target.value }))}
                placeholder="Tenant Name"
                mono={false}
              />
              <Input
                value={newTenant.guid}
                onChange={(e) => setNewTenant((p) => ({ ...p, guid: e.target.value }))}
                placeholder="Customer ID (GUID)"
                mono={false}
              />
              <Select
                value={newTenant.region}
                onChange={(e) => setNewTenant((p) => ({ ...p, region: e.target.value }))}
                className="w-auto"
                mono={false}
              >
                <option value="us">US (us)</option>
                <option value="eu">EU (eu)</option>
                <option value="asia">Asia (asia)</option>
              </Select>
              <Input
                value={newTenant.gcp_project_id}
                onChange={(e) => setNewTenant((p) => ({ ...p, gcp_project_id: e.target.value }))}
                placeholder="GCP Project ID"
                mono={false}
              />
              <Input
                value={newTenant.base_url}
                onChange={(e) => setNewTenant((p) => ({ ...p, base_url: e.target.value }))}
                placeholder="Base URL (optional)"
                mono={false}
              />
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="primary-brand" size="sm" onClick={handleAddTenant} icon={<Plus size={14} />}>
                Add Tenant
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Case Exclusions */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} className="text-amber-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Case Exclusions
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Cases whose title, rule name, or alert names contain any of these keywords will be excluded from MTTX
          calculations.
        </p>
        <div className="flex gap-2 mb-4">
          <Input
            value={newExclKeyword}
            onChange={(e) => setNewExclKeyword(e.target.value)}
            placeholder="Keyword (e.g. 'test', 'training')"
            mono={false}
            className="flex-1"
          />
          <Input
            value={newExclNote}
            onChange={(e) => setNewExclNote(e.target.value)}
            placeholder="Note (optional)"
            mono={false}
            className="flex-1"
          />
          <Button
            variant="primary-brand"
            size="sm"
            onClick={handleAddExclusion}
            disabled={!newExclKeyword.trim()}
            icon={<Plus size={14} />}
          >
            Add
          </Button>
        </div>
        {exclusions.length > 0 ? (
          <div className="space-y-1">
            {exclusions.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-[rgb(var(--surface-300))]"
              >
                <span className="font-mono text-sm text-slate-900 dark:text-white">{e.keyword}</span>
                {e.note && <span className="text-xs text-slate-500 dark:text-slate-400">— {e.note}</span>}
                <button
                  onClick={() => handleDeleteExclusion(e.id)}
                  className="ml-auto text-slate-400 hover:text-rose-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">No exclusions configured.</p>
        )}
      </Card>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────

export default function SecOpsMtx() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<MtxConfig | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [metrics, setMetrics] = useState<MtxMetrics | null>(null);
  const [cases, setCases] = useState<MtxCase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [isDemo, setIsDemo] = useState(false);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/secops-mtx/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.tenants?.length > 0 && !selectedTenant) {
          setSelectedTenant(String(data.tenants[0].id));
        }
      }
    } catch {
      setConfig({ enabled: false, tenants: [], hasCredentials: false, lastRun: null });
    }
  }, [selectedTenant]);

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    if (!selectedTenant) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/secops-mtx/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setCases(data.cases);
        setIsDemo(!!data.isDemo);
        if (data.isDemo) toast('No Chronicle data available — showing empty state', 'info');
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast(err.error || 'Failed to fetch MTTX metrics', 'error');
      }
    } catch {
      toast('Network error fetching metrics', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, dateRange, toast]);

  useEffect(() => {
    if (selectedTenant && activeTab === 'dashboard') fetchMetrics();
  }, [selectedTenant, dateRange, fetchMetrics, activeTab]);

  // Filter cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.ruleName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = selectedSeverity === 'all' || c.severity === selectedSeverity;
      const matchesStatus = selectedStatus === 'all' || c.status === selectedStatus;
      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [cases, searchQuery, selectedSeverity, selectedStatus]);

  // Export CSV
  const exportCsv = useCallback(() => {
    const headers = [
      'ID',
      'Title',
      'Severity',
      'Status',
      'Created',
      'MTTD (min)',
      'MTTA (min)',
      'MTTR (min)',
      'Rule',
      'Verdict',
    ];
    const rows = filteredCases.map((c) => [
      c.id,
      c.title,
      c.severity,
      c.status,
      c.createdAt,
      String(c.mttd ?? ''),
      String(c.mtta ?? ''),
      String(c.mttr ?? ''),
      c.ruleName,
      c.verdict ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mttx-report-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
  }, [filteredCases, dateRange, toast]);

  // Table columns
  const columns: DataTableColumn<MtxCase>[] = [
    {
      key: 'severity',
      header: 'Sev',
      sortValue: (r) => r.severity,
      render: (r) => <SeverityBadge severity={r.severity} />,
      align: 'center',
    },
    {
      key: 'title',
      header: 'Case',
      sortValue: (r) => r.title,
      render: (r) => (
        <div className="max-w-[300px]">
          <div className="font-medium text-slate-900 dark:text-white truncate">{r.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.ruleName}</div>
        </div>
      ),
    },
    {
      key: 'mttd',
      header: 'MTTD',
      sortValue: (r) => r.mttd ?? Infinity,
      render: (r) => <span className={`font-mono ${getDurationColor(r.mttd)}`}>{formatDuration(r.mttd)}</span>,
      align: 'right',
    },
    {
      key: 'mtta',
      header: 'MTTA',
      sortValue: (r) => r.mtta ?? Infinity,
      render: (r) => <span className={`font-mono ${getDurationColor(r.mtta)}`}>{formatDuration(r.mtta)}</span>,
      align: 'right',
    },
    {
      key: 'mttr',
      header: 'MTTR',
      sortValue: (r) => r.mttr ?? Infinity,
      render: (r) => <span className={`font-mono ${getDurationColor(r.mttr)}`}>{formatDuration(r.mttr)}</span>,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'verdict',
      header: 'Verdict',
      sortValue: (r) => r.verdict ?? '',
      render: (r) =>
        r.verdict === 'tp' ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            <CheckCircle size={12} /> TP
          </span>
        ) : r.verdict === 'fp' ? (
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-medium">
            <AlertTriangle size={12} /> FP
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => {
        const tenant = config?.tenants?.find((t) => String(t.id) === selectedTenant);
        const projectId = tenant?.gcp_project_id ?? tenant?.gcpProjectId ?? '';
        return (
          <a
            href={`https://chronicle.google.com/${projectId}/case/${r.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline text-xs inline-flex items-center gap-1"
          >
            Open <ExternalLink size={10} />
          </a>
        );
      },
      align: 'center',
    },
  ];

  // Benchmarks (industry standards) — MTTX returns minutes, benchmarks in minutes
  const benchmarks = [
    {
      metric: 'MTTD',
      description: 'Mean Time to Detect',
      target: '< 1 hour',
      ours: metrics?.mttd ?? null,
      good: 60,
      warn: 120,
    },
    {
      metric: 'MTTA',
      description: 'Mean Time to Acknowledge',
      target: '< 4 hours',
      ours: metrics?.mtta ?? null,
      good: 240,
      warn: 480,
    },
    {
      metric: 'MTTR',
      description: 'Mean Time to Respond',
      target: '< 24 hours',
      ours: metrics?.mttr ?? null,
      good: 1440,
      warn: 2880,
    },
  ];

  // Not configured state
  if (config && !config.hasCredentials) {
    return (
      <DataPageLayout
        backTo="/threatintel"
        backLabel="Threat Intel"
        icon={<Shield size={20} />}
        title="SecOps MTTX Dashboard"
        description="Mean Time to Detect, Acknowledge, and Respond metrics from Google SecOps (Chronicle)"
      >
        <div className="max-w-2xl mx-auto">
          <EmptyState
            icon={<Settings size={48} />}
            title="SecOps Not Configured"
            description="Connect your Google SecOps (Chronicle) service account to view MTTX metrics."
            action={
              <Button variant="primary-brand" onClick={() => setActiveTab('settings')} icon={<Settings size={14} />}>
                Open Settings
              </Button>
            }
          />
        </div>
      </DataPageLayout>
    );
  }

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="Threat Intel"
      icon={<Shield size={20} />}
      title="SecOps MTTX Dashboard"
      description="Mean Time to Detect, Acknowledge, and Respond metrics from Google SecOps (Chronicle)"
      maxWidthClass="max-w-7xl"
    >
      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))] w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-[rgb(var(--surface-300))] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 size={14} className="inline mr-1.5" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-white dark:bg-[rgb(var(--surface-300))] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Settings size={14} className="inline mr-1.5" />
          Settings
        </button>
      </div>

      {activeTab === 'settings' ? (
        <SettingsPanel config={config} onRefresh={fetchConfig} />
      ) : (
        <>
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl bg-slate-50 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))]">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-500" />
              <label className="text-xs font-mono text-slate-500 dark:text-slate-400">Tenant</label>
            </div>
            <Select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-auto min-w-[180px]"
              mono={false}
            >
              {config?.tenants.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </Select>

            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-slate-500 dark:text-slate-400">From</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white min-h-[44px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-slate-500 dark:text-slate-400">To</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white min-h-[44px]"
              />
            </div>

            <Button
              variant="primary-brand"
              size="sm"
              onClick={fetchMetrics}
              loading={loading}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCsv} icon={<Download size={14} />}>
              Export CSV
            </Button>
          </div>

          {/* Demo Banner */}
          {isDemo && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>Demo mode — no Chronicle data found. Configure a service account in Settings to connect.</span>
            </div>
          )}

          {/* Loading State */}
          {loading && !metrics && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-brand-500" />
              <span className="ml-3 text-slate-500 dark:text-slate-400">Fetching metrics from Chronicle...</span>
            </div>
          )}

          {/* Metrics Dashboard */}
          {metrics && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <MetricCard
                  label="MTTD"
                  value={formatDuration(metrics.mttd)}
                  icon={Clock}
                  color="bg-emerald-500"
                  sub="Mean Time to Detect"
                />
                <MetricCard
                  label="MTTA"
                  value={formatDuration(metrics.mtta)}
                  icon={Activity}
                  color="bg-amber-500"
                  sub="Mean Time to Acknowledge"
                />
                <MetricCard
                  label="MTTR"
                  value={formatDuration(metrics.mttr)}
                  icon={TrendingUp}
                  color="bg-brand-500"
                  sub="Mean Time to Respond"
                />
                <MetricCard
                  label="Total Cases"
                  value={metrics.totalCases}
                  icon={BarChart3}
                  color="bg-slate-500"
                  sub={`${metrics.openCases} open · ${metrics.closedCases} closed`}
                />
              </div>

              {/* Verdict Split */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card padding="md" className="text-center">
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {metrics.truePositives}
                  </div>
                  <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">True Positives</div>
                  <div className="mt-2">
                    <BenchmarkBar value={metrics.truePositives} max={metrics.totalCases || 1} color="bg-emerald-500" />
                  </div>
                </Card>
                <Card padding="md" className="text-center">
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{metrics.falsePositives}</div>
                  <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">False Positives</div>
                  <div className="mt-2">
                    <BenchmarkBar value={metrics.falsePositives} max={metrics.totalCases || 1} color="bg-rose-500" />
                  </div>
                </Card>
                <Card padding="md" className="text-center">
                  <div className="text-3xl font-bold text-brand-600 dark:text-brand-400">
                    {metrics.totalCases > 0 ? Math.round((metrics.truePositives / metrics.totalCases) * 100) : 0}%
                  </div>
                  <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Precision</div>
                  <div className="mt-2">
                    <BenchmarkBar value={metrics.truePositives} max={metrics.totalCases || 1} color="bg-brand-500" />
                  </div>
                </Card>
              </div>

              {/* Benchmarks */}
              <Card padding="md" className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-brand-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Industry Benchmarks
                  </h3>
                </div>
                <div className="space-y-3">
                  {benchmarks.map((b) => (
                    <div
                      key={b.metric}
                      className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300))]"
                    >
                      <div className="w-24">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{b.metric}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{b.description}</div>
                      </div>
                      <div className="flex-1">
                        <BenchmarkBar
                          value={b.ours ?? 0}
                          max={b.warn * 1.5}
                          color={
                            b.ours !== null && b.ours <= b.good
                              ? 'bg-emerald-500'
                              : b.ours !== null && b.ours <= b.warn
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }
                        />
                      </div>
                      <div className="w-20 text-right">
                        <span
                          className={`font-mono text-sm font-bold ${b.ours !== null && b.ours <= b.good ? 'text-emerald-600 dark:text-emerald-400' : b.ours !== null && b.ours <= b.warn ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}
                        >
                          {formatDuration(b.ours)}
                        </span>
                      </div>
                      <div className="w-20 text-right text-xs text-slate-500 dark:text-slate-400">
                        Target: {b.target}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Case List */}
              <Card padding="none">
                <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search cases by title or rule..."
                      mono={false}
                    />
                  </div>
                  <Select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="w-auto"
                    mono={false}
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                  <Select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-auto"
                    mono={false}
                  >
                    <option value="all">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="in-review">In Review</option>
                    <option value="closed">Closed</option>
                  </Select>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {filteredCases.length} cases
                  </span>
                </div>

                <DataTable
                  columns={columns}
                  rows={filteredCases}
                  rowKey={(r) => r.id}
                  initialSort={{ key: 'mttr', dir: 'desc' }}
                  empty={
                    <EmptyState
                      icon={<FileText size={32} />}
                      title="No cases found"
                      description="Try adjusting your filters or date range"
                      size="sm"
                    />
                  }
                />
              </Card>
            </>
          )}

          {/* No Data State */}
          {!loading && !metrics && config?.tenants && config.tenants.length > 0 && (
            <EmptyState
              icon={<BarChart3 size={48} />}
              title="No Metrics Data"
              description="Select a tenant and date range, then click Refresh to fetch MTTX metrics from Chronicle."
              size="lg"
            />
          )}
        </>
      )}
    </DataPageLayout>
  );
}
