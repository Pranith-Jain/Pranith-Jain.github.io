import { memo } from 'react';
import { VerdictChip } from './VerdictChip';
import type { ProviderErrorCode, ProviderResultWire, SecretFindingWire } from '../../lib/dfir/types';

const ERROR_CHIP_STYLE: Record<ProviderErrorCode, string> = {
  rate_limited: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  upstream_5xx: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  upstream_4xx: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  unauthorized: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  forbidden: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  not_found: 'bg-slate-500/15 text-muted border-slate-500/30',
  timeout: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  network: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  parse: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  unsupported_indicator: 'bg-slate-500/15 text-muted border-slate-500/30',
  no_api_key: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  unknown: 'bg-slate-500/15 text-muted border-slate-500/30',
};

const ERROR_LABEL: Record<ProviderErrorCode, string> = {
  rate_limited: 'rate-limited',
  upstream_5xx: 'upstream 5xx',
  upstream_4xx: 'upstream 4xx',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not found',
  timeout: 'timeout',
  network: 'network',
  parse: 'parse error',
  unsupported_indicator: 'unsupported',
  no_api_key: 'no API key',
  unknown: 'unknown error',
};

function isSecretFinding(value: unknown): value is SecretFindingWire {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return typeof f.type === 'string' && typeof f.redacted === 'string';
}

function readSecretFindings(r: ProviderResultWire): SecretFindingWire[] {
  const raw = r.raw_summary.findings;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSecretFinding);
}

function IocResultRowInner({ r }: { r: ProviderResultWire }): JSX.Element {
  const isSecretsProvider = r.source === 'secrets';
  const findings = isSecretsProvider ? readSecretFindings(r) : [];
  const findingCount = typeof r.raw_summary.finding_count === 'number' ? r.raw_summary.finding_count : findings.length;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-100 capitalize">{r.source}</span>
        <VerdictChip verdict={r.verdict} />
      </div>
      <div className="flex items-center gap-4 text-sm font-mono text-muted flex-wrap">
        <span>
          score: <span className="text-slate-900 dark:text-slate-100">{r.score}</span>
        </span>
        {r.cached && <span className="text-brand-600 dark:text-brand-400">cached</span>}
        {r.status === 'error' && r.error_code && (
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded border ${ERROR_CHIP_STYLE[r.error_code]}`}
            title={r.error ?? ''}
          >
            {ERROR_LABEL[r.error_code]}
            {r.error_status ? ` · ${r.error_status}` : ''}
          </span>
        )}
        {r.status === 'error' && !r.error_code && r.error && (
          <span className="text-rose-600 dark:text-rose-400">err: {r.error}</span>
        )}
        {r.status === 'unsupported' && <span className="text-slate-500">n/a for this type</span>}
      </div>
      {isSecretsProvider && findingCount > 0 && (
        <ul className="mt-2 space-y-1">
          {findings.slice(0, 3).map((f, i) => (
            <li
              key={`${f.type}-${i}`}
              className="flex items-center gap-2 text-mini font-mono text-rose-700 dark:text-rose-300"
            >
              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30">{f.type}</span>
              <span className="break-all">{f.redacted}</span>
            </li>
          ))}
          {findings.length > 3 && (
            <li className="text-mini font-mono text-rose-700 dark:text-rose-400">
              +{findings.length - 3} more (see raw evidence)
            </li>
          )}
        </ul>
      )}
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const IocResultRow = memo(IocResultRowInner);
