import { useState, useEffect, useMemo, useCallback } from 'react';
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
  id: string;
  name: string;
  guid: string;
  region: string;
  gcpProjectId: string;
}

interface MtxConfig {
  enabled: boolean;
  tenants: MtxTenant[];
  hasCredentials: boolean;
  lastRun: string | null;
}

// ─── Duration Formatting ──────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function getDurationColor(seconds: number | null, thresholds = { good: 300, warn: 1800 }): string {
  if (seconds === null) return 'text-slate-500 dark:text-slate-400';
  if (seconds <= thresholds.good) return 'text-emerald-600 dark:text-emerald-400';
  if (seconds <= thresholds.warn) return 'text-amber-600 dark:text-amber-400';
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
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${color.replace('bg-', 'bg-')}/10`}>
          <Icon size={20} className={color.replace('bg-', 'text-')} />
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
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
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

  // Fetch config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/v1/secops-mtx/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          if (data.tenants?.length > 0) {
            setSelectedTenant(data.tenants[0].id);
          }
        }
      } catch {
        // Dashboard not configured yet
        setConfig({ enabled: false, tenants: [], hasCredentials: false, lastRun: null });
      }
    };
    fetchConfig();
  }, []);

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
      } else {
        toast('Failed to fetch MTTX metrics', 'error');
      }
    } catch {
      toast('Network error fetching metrics', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, dateRange, toast]);

  useEffect(() => {
    if (selectedTenant) fetchMetrics();
  }, [selectedTenant, dateRange, fetchMetrics]);

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
      'Closed',
      'MTTD',
      'MTTA',
      'MTTR',
      'Rule',
      'Verdict',
    ];
    const rows = filteredCases.map((c) => [
      c.id,
      c.title,
      c.severity,
      c.status,
      c.createdAt,
      c.closedAt ?? '',
      formatDuration(c.mttd),
      formatDuration(c.mtta),
      formatDuration(c.mttr),
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
      render: (r) => (
        <a
          href={`https://chronicle.google.com/${config?.tenants?.find((t) => t.id === selectedTenant)?.gcpProjectId ?? ''}/case/${r.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline text-xs inline-flex items-center gap-1"
        >
          Open <ExternalLink size={10} />
        </a>
      ),
      align: 'center',
    },
  ];

  // Benchmarks (industry standards)
  const benchmarks = [
    {
      metric: 'MTTD',
      description: 'Mean Time to Detect',
      target: '< 1 hour',
      ours: metrics?.mttd ?? null,
      good: 3600,
      warn: 7200,
    },
    {
      metric: 'MTTA',
      description: 'Mean Time to Acknowledge',
      target: '< 4 hours',
      ours: metrics?.mtta ?? null,
      good: 14400,
      warn: 28800,
    },
    {
      metric: 'MTTR',
      description: 'Mean Time to Respond',
      target: '< 24 hours',
      ours: metrics?.mttr ?? null,
      good: 86400,
      warn: 172800,
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
        <EmptyState
          icon={<Settings size={48} />}
          title="SecOps Not Configured"
          description="Connect your Google SecOps (Chronicle) service account to view MTTX metrics."
          action={
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg">
                To get started, you need to configure a Google SecOps service account with Chronicle API permissions.
                The service account JSON key can be provided via the admin API.
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-4 text-sm font-mono">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Required permissions:</div>
                <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                  <li>• Chronicle API (read-only)</li>
                  <li>• SOAR Admin (for case data)</li>
                </ul>
              </div>
            </div>
          }
        />
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
            <option key={t.id} value={t.id}>
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
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-slate-500 dark:text-slate-400">To</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white"
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
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.truePositives}</div>
              <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">True Positives</div>
              <BenchmarkBar value={metrics.truePositives} max={metrics.totalCases || 1} color="bg-emerald-500" />
            </Card>
            <Card padding="md" className="text-center">
              <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{metrics.falsePositives}</div>
              <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">False Positives</div>
              <BenchmarkBar value={metrics.falsePositives} max={metrics.totalCases || 1} color="bg-rose-500" />
            </Card>
            <Card padding="md" className="text-center">
              <div className="text-3xl font-bold text-brand-600 dark:text-brand-400">
                {metrics.totalCases > 0 ? Math.round((metrics.truePositives / metrics.totalCases) * 100) : 0}%
              </div>
              <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Precision</div>
              <BenchmarkBar value={metrics.truePositives} max={metrics.totalCases || 1} color="bg-brand-500" />
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
                  <div className="w-20 text-right text-xs text-slate-500 dark:text-slate-400">Target: {b.target}</div>
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
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filteredCases.length} cases</span>
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
    </DataPageLayout>
  );
}
