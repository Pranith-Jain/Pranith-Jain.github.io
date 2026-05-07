import { Link } from 'react-router-dom';
import type { HistoryEntry } from '../../lib/dfir/history';
import { VerdictChip } from './VerdictChip';

const ROUTE_BY_TOOL: Record<HistoryEntry['tool'], string> = {
  ioc: '/dfir/ioc-check',
  domain: '/dfir/domain',
  phishing: '/dfir/phishing',
  exposure: '/dfir/exposure',
  file: '/dfir/file',
};

const PARAM_BY_TOOL: Record<HistoryEntry['tool'], string> = {
  ioc: 'indicator',
  domain: 'domain',
  phishing: 'q',
  exposure: 'domain',
  file: 'hash',
};

function timeAgo(ts: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function HistoryRow({ e }: { e: HistoryEntry }): JSX.Element {
  const verdictType = (['clean', 'suspicious', 'malicious'] as const).includes(e.verdict as never)
    ? (e.verdict as 'clean' | 'suspicious' | 'malicious')
    : 'unknown';
  return (
    <li className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 w-20 shrink-0">
            {e.tool}
          </span>
          <span className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">{e.indicator}</span>
        </div>
        <span className="text-xs font-mono text-slate-500 mt-1 block">{timeAgo(e.timestamp)}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <VerdictChip verdict={verdictType} />
        <Link
          to={`${ROUTE_BY_TOOL[e.tool]}?${PARAM_BY_TOOL[e.tool]}=${encodeURIComponent(e.indicator)}`}
          className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          re-run
        </Link>
      </div>
    </li>
  );
}
