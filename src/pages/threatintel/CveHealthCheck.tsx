import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Heart, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../lib/api-client';

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

interface HealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  generated_at: string;
  error?: string;
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  pass: CheckCircle,
  warn: AlertTriangle,
  fail: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pass: 'text-green-600 dark:text-green-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  fail: 'text-red-600 dark:text-red-400',
};

const OVERALL_STYLE: Record<string, string> = {
  healthy: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
  degraded:
    'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
  unhealthy: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
};

function formatName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CveHealthCheck(): JSX.Element {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<HealthReport>('/api/v1/cve-health', { timeoutMs: 15000 });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const passes = report?.checks.filter((c) => c.status === 'pass').length ?? 0;
  const warns = report?.checks.filter((c) => c.status === 'warn').length ?? 0;
  const fails = report?.checks.filter((c) => c.status === 'fail').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {report?.generated_at && `Last checked: ${new Date(report.generated_at).toLocaleString()}`}
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded text-sm flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Re-check
        </button>
      </div>

      {report && (
        <div className={`p-4 rounded border ${OVERALL_STYLE[report.overall]}`}>
          <div className="flex items-center gap-2 font-semibold">
            <Heart className="h-5 w-5" />
            <span className="capitalize">{report.overall}</span>
            <span className="text-sm font-normal opacity-75">
              ({passes} pass, {warns} warn, {fails} fail)
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {report?.checks.map((check) => {
          const Icon = STATUS_ICON[check.status] ?? CheckCircle;
          return (
            <div
              key={check.name}
              className="p-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded"
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${STATUS_COLOR[check.status]}`} />
                <span className="font-mono text-sm font-medium">{formatName(check.name)}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 ml-6">{check.message}</p>
              {check.details && (
                <pre className="mt-2 ml-6 p-2 bg-slate-50 dark:bg-slate-800 rounded text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {!loading && !report && !error && (
        <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-sm">
          Click "Re-check" to run health diagnostics.
        </div>
      )}
    </div>
  );
}
