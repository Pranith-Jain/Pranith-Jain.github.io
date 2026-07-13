import { CheckCircle, Heart, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';

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
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  pass: CheckCircle,
  warn: AlertTriangle,
  fail: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  fail: 'text-rose-600 dark:text-rose-400',
};

const OVERALL_STYLE: Record<string, string> = {
  healthy:
    'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  degraded:
    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  unhealthy: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
};

function formatName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface CveHealthCheckProps {
  bare?: boolean;
}

export default function CveHealthCheck({ bare }: CveHealthCheckProps): JSX.Element {
  const { data, loading, error, refetch } = useDataFetch<HealthReport>({
    url: '/api/v1/cve-health',
    ttl: 30_000,
  });

  const passes = data?.checks.filter((c) => c.status === 'pass').length ?? 0;
  const warns = data?.checks.filter((c) => c.status === 'warn').length ?? 0;
  const fails = data?.checks.filter((c) => c.status === 'fail').length ?? 0;

  const body = data && (
    <div className="space-y-3">
      <div className={`p-4 rounded-xl border ${OVERALL_STYLE[data.overall]}`}>
        <div className="flex items-center gap-2 font-semibold">
          <Heart className="h-5 w-5" />
          <span className="capitalize">{data.overall}</span>
          <span className="text-sm font-normal opacity-75">
            ({passes} pass, {warns} warn, {fails} fail)
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {data.checks.map((check) => {
          const Icon = STATUS_ICON[check.status] ?? CheckCircle;
          return (
            <div
              key={check.name}
              className="p-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl"
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${STATUS_COLOR[check.status]}`} />
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                  {formatName(check.name)}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 ml-6">{check.message}</p>
              {check.details && (
                <pre className="mt-2 ml-6 p-2 bg-slate-50 dark:bg-[rgb(var(--surface-300))] rounded-xl text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto border border-slate-100 dark:border-[rgb(var(--border-400))]">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
  if (bare) return <>{body}</>;
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Heart size={28} />}
      title="CVE Health Check"
      loading={loading}
      error={error}
      empty={!data}
      emptyMessage="Click 'Re-check' to run health diagnostics."
      onRetry={refetch}
      headerExtra={
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {data?.generated_at && `Last checked: ${new Date(data.generated_at).toLocaleString()}`}
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl text-sm flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Re-check
          </button>
        </div>
      }
    >
      {body}
    </DataPageLayout>
  );
}
