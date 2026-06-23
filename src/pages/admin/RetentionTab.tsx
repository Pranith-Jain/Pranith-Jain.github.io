import { useCallback, useState } from 'react';
import { postJsonWithBody } from './adminApi';

/**
 * Admin Retention tab — runs the 30-day data retention sweep on demand.
 *
 * The sweep also fires from the hourly cron, so this is for operators who
 * want to:
 *   - Preview impact (dry-run) before the next scheduled sweep
 *   - Override the retention window for a one-off cleanup (e.g. before
 *     a D1 export or to free space after a data incident)
 *   - Force a sweep right now without waiting for the cron
 *
 * Endpoint: POST /api/v1/admin/retention/run
 *   body: { days?: number, dry_run?: boolean }
 *   - days: 1..3650, defaults to 30
 *   - dry_run: when true, count rows that WOULD be deleted without
 *     issuing the DELETE
 */

interface TableSweep {
  table: string;
  deleted: number;
  dry_run: boolean;
}

interface RetentionResult {
  total_deleted: number;
  tables_swept: TableSweep[];
  cutoff: string;
  days: number;
  dry_run: boolean;
  ran_at: string;
}

const DEFAULT_DAYS = 30;

export default function RetentionTab() {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [busy, setBusy] = useState<'dry' | 'run' | null>(null);
  const [result, setResult] = useState<RetentionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (dryRun: boolean) => {
      setBusy(dryRun ? 'dry' : 'run');
      setError(null);
      try {
        const r = await postJsonWithBody<RetentionResult>('/retention/run', { days, dry_run: dryRun });
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [days]
  );

  const totalDeleted = result?.total_deleted ?? 0;
  const wasDry = result?.dry_run ?? false;
  const cutoff = result?.cutoff ? new Date(result.cutoff) : null;
  const ranAt = result?.ran_at ? new Date(result.ran_at) : null;

  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 max-w-3xl">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Data retention sweep</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Deletes rows older than the retention window across 13 data tables (briefings, IOC logs, report-extraction
        cache, etc.). The cron runs this hourly; use this tab to preview impact or override the window.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1">
            Retention (days)
          </span>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || DEFAULT_DAYS)))}
            disabled={busy !== null}
            className="w-32 px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
          />
        </label>
        <button
          onClick={() => run(true)}
          disabled={busy !== null}
          className="px-4 py-1.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
        >
          {busy === 'dry' ? 'Previewing…' : 'Dry-run preview'}
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy !== null}
          className="px-4 py-1.5 border border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-200 rounded text-sm hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-50"
        >
          {busy === 'run' ? 'Sweeping…' : 'Run sweep now'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 border border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 rounded text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="text-sm text-slate-700 dark:text-slate-300 mb-3">
            {wasDry ? (
              <>
                <span className="text-amber-700 dark:text-amber-300 font-semibold">Dry run</span> — {totalDeleted}{' '}
                row(s) would be deleted (no DELETEs issued).
              </>
            ) : (
              <>
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Sweep complete</span> —{' '}
                {totalDeleted} row(s) deleted.
              </>
            )}
            {cutoff && (
              <>
                {' '}
                Cutoff: <code className="font-mono text-slate-500 dark:text-slate-400">{cutoff.toISOString()}</code>.
              </>
            )}
            {ranAt && (
              <>
                {' '}
                Ran at: <code className="font-mono text-slate-500 dark:text-slate-400">{ranAt.toLocaleString()}</code>.
              </>
            )}
          </div>

          {result.tables_swept.length > 0 && (
            <div className="border border-slate-200 dark:border-[rgb(var(--border-400))] rounded">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-500 uppercase text-xs tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Table</th>
                    <th className="text-right px-3 py-2">{wasDry ? 'Would delete' : 'Deleted'}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tables_swept.map((row) => (
                    <tr key={row.table} className="border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                      <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300">{row.table}</td>
                      <td className="px-3 py-1.5 text-right text-slate-900 dark:text-slate-100">{row.deleted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.tables_swept.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-500">
              No tables had rows past the cutoff — nothing to do.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600 dark:text-slate-500">
        The sweep excludes <code>api_keys</code>, <code>telegram_watched_channels</code>, <code>ct_watch</code>, and{' '}
        <code>counters</code> — those are operator-state, not intel.
      </p>
    </div>
  );
}
